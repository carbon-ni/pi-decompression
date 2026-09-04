# pi-decompression

A guarded [Pi extension](https://github.com/earendil-works/pi-mono) that gives long-running work room to breathe. It preserves a handoff, pauses at a context threshold, and resumes the interrupted goal after Pi compacts the conversation.

A **coffee break** is mostly rest. A **retro** is structured reflection. **Decompression** sits between them: rest, unstructured thinking, and informal reflection—with a durable handoff so work can continue.

## Start

```bash
nix develop
npm ci
make hooks-install
make check
pi -e ./src/index.ts
```

Pi should start without an extension load error. The extension registers `/decompress` and its short `/break` alias.

## Commands

Both commands share the exact same handler and persisted state:

```text
/decompress [on|off|now] [threshold]
/break [on|off|now] [threshold]
```

Examples:

- `/break` — show the current decompression state.
- `/break on` or `/break off` — enable or disable automatic decompression.
- `/break 60` — set the context threshold to 60%.
- `/decompress on 60` — enable decompression and set its threshold.
- `/break now` or `/decompress now` — immediately compact a handoff while Pi is idle.

`now` preserves automatic settings and persisted state, uses the same handoff compaction path, and never resumes an already-idle task. Busy sessions and queued user messages are rejected safely; wait until work settles and retry. Automatic threshold decompression remains the only path that synthesizes a continuation.

When enabled with a threshold, the Pi footer value shows only the remaining percentage, such as `40%`. It is calculated as `ceil(max(threshold - usage, 0))`, clamped to `0%` at or above the threshold, and shown as `--` when usage is unavailable. Without a configured threshold it shows `on:no-threshold`. Disabling decompression clears this footer item.

State is persisted for trusted projects in `.pi/decompression.json`. When enabled with a threshold, that configured value is the soft boundary. Active work crossing soft is allowed to finish naturally; if it settles, pi-decompression compacts once without synthetic continuation. A derived hard boundary gives active work a safe upper limit: `hard = min(soft * 1.10, 100)` (for example, 60% → 66%). At hard, the completed turn and its tool results are preserved, Pi stops at that completed turn boundary before another assistant turn, and a handoff is created during compaction. Pi selects a safe retained boundary and keeps assistant tool calls paired with their following tool results; pi-decompression preserves that boundary and never cuts at a standalone tool result. After hard compaction completes, interrupted work queues exactly one synthetic follow-up (`Continue the interrupted user task using the handoff context.`); Pi delivers it after the active operation settles unless a queued user message already continues the work. If usage reaches soft while idle, Pi compacts without synthetic continuation. Handoffs are written under `$AGENT_WORKSPACE/reports` (or `.tmp/reports` when `AGENT_WORKSPACE` is unset).

## Canonical workflow

| Phase | Command | Enforcement |
| --- | --- | --- |
| Install | `npm ci` | lockfile and CI |
| During work | `make watch` | Funzzy runs normal gate |
| Before commit/push | `make check` | versioned Git hooks |
| CI | `make check` | GitHub Actions |
| Release | `make release-check` | tag workflow |

`make check` is normal gate. Success output is exactly `true`. Failure output starts with `false` and ends with bounded diagnostics.

Formatting, architecture, coverage, package verification, and dependency audit are explicit release checks. They do not make the normal feedback loop slower.

See [DEVELOPMENT.md](DEVELOPMENT.md) for operating rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries.

## Done

A change is done when:

1. Happy and unhappy paths have deterministic, co-located tests.
2. `make check` prints `true`.
3. Relevant manual checks pass.
4. Documentation matches behavior.
5. The commit uses Conventional Commits.
