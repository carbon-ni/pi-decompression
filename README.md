# pi-compactor

A guarded [Pi extension](https://github.com/earendil-works/pi-mono) that saves a handoff before compaction and can trigger compaction when context usage reaches a configured threshold.

## Start

```bash
nix develop
npm ci
make hooks-install
make check
pi -e ./src/index.ts
```

Pi should start without an extension load error. The extension registers the commands below.

## Commands

`/compactor` and `/break` are aliases that share the same handler and persisted state. Use either command with the same syntax:

```text
/compactor [on|off] [threshold]
/break [on|off] [threshold]
```

Examples:

- `/break` — show the current state.
- `/break on` or `/break off` — enable or disable automatic compaction.
- `/break 60` — set the context threshold to 60%.
- `/break on 60` — enable automatic compaction and set its threshold.

State is persisted in `.pi/compactor.json` for trusted projects. When enabled with a threshold, the extension checks usage after Pi fully settles (including retries, automatic compaction, and queued follow-ups), then triggers one threshold compaction. Before Pi compacts, the extension writes a handoff report under `$AGENT_WORKSPACE/reports` (or `.tmp/reports` when `AGENT_WORKSPACE` is unset).

## Canonical workflow

| Phase | Command | Enforcement |
| --- | --- | --- |
| Install | `npm ci` | lockfile and CI |
| During work | `make watch` | Funzzy runs normal gate |
| Before commit/push | `make check` | versioned Git hooks |
| CI | `make check` | GitHub Actions |
| Release | `make release-check` | tag workflow |

`make check` is normal gate. Success output is exactly `true`. Failure output starts with `false` and ends with bounded diagnostics.

Formatting, architecture, coverage, package verification, and dependency audit are explicit release checks. They do not make normal feedback loop slower.

See [DEVELOPMENT.md](DEVELOPMENT.md) for operating rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries.

## Done

A change is done when:

1. Happy and unhappy paths have deterministic, co-located tests.
2. `make check` prints `true`.
3. Relevant manual checks pass.
4. Documentation matches behavior.
5. Commit uses Conventional Commits.
