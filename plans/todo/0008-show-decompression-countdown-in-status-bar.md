---
id: TASK-0008
title: Show decompression countdown in status bar
status: todo
depends_on: [TASK-0007]
priority: normal
tags: [decompression, status-bar, qol, visibility]
---

# Show decompression countdown in status bar

## Problem
Footer shows only whether decompression is enabled and configured threshold. Users cannot see how close current context is to threshold, so decompression timing feels surprising.

## Desired outcome
While decompression watcher is armed, footer shows remaining percentage points until threshold beside configured threshold. User can predict next decompression without running command.

Recommended compact format:

```text
decompression 15% left/60%
```

Here `left` means percentage points until threshold, not unused model context:

```text
left = max(thresholdPercent - contextUsagePercent, 0)
```

## Acceptance criteria
- [ ] Enabled state with known usage and threshold renders `decompression <left>% left/<threshold>%`.
- [ ] Remaining value is derived from same usage and threshold used by watcher; display never becomes second policy source.
- [ ] Fractional usage has deterministic compact rounding and never displays `0% left` before threshold is actually reached. Recommended: `ceil(max(threshold - usage, 0))`.
- [ ] At or above threshold, display clamps to `0% left`; it never shows negative value.
- [ ] Enabled state with threshold but unavailable post-compaction/startup usage renders explicit unknown state: `decompression -- left/60%`.
- [ ] Enabled state without configured threshold remains `decompression on:no-threshold`.
- [ ] Disabled state clears footer item.
- [ ] Footer refreshes after completed turns, idle usage observation, successful compaction, state restoration, and `/decompress` or `/break` mutations.
- [ ] Successful compaction clears stale countdown to unknown until fresh usage is available.
- [ ] Status formatting remains pure in `src/domain`; Pi usage lookup and `setStatus` stay in `src/infra`.
- [ ] Existing threshold crossing, continuation, re-arm, notification, and persistence behavior remains unchanged.
- [ ] Deterministic tests cover known, unknown, below, exact, above, fractional, no-threshold, disabled, command-update, and post-compaction states.
- [ ] README documents status format and defines `left` as distance to configured usage threshold.
- [ ] Watcher `@agent-final` gate passes.

## Suggested TDD sequence

### Red — domain formatting
Extend formatter contract to accept optional current usage percent. Add table-driven tests first:

| usage | threshold | expected |
| ---: | ---: | --- |
| unavailable | 60 | `decompression -- left/60%` |
| 45 | 60 | `decompression 15% left/60%` |
| 44.98 | 60 | `decompression 16% left/60%` |
| 60 | 60 | `decompression 0% left/60%` |
| 75 | 60 | `decompression 0% left/60%` |

Keep disabled and no-threshold cases in same test table.

### Green — runtime refresh
Pass current usage snapshot into status formatter. Update status only from lifecycle points that already observe stable context usage; do not add timer or polling.

Recommended refresh points:
1. session start/config restore;
2. enable/disable/threshold commands;
3. `turn_end` after reading usage;
4. `agent_settled` after reading usage;
5. successful native or extension compaction, resetting usage display to unknown.

### Refactor
Use one status projection helper so command, startup, turn, and compaction paths cannot drift. Keep threshold decisions separate from display projection.

## Constraints
- Complete TASK-0007 first because both tasks touch decompression lifecycle and status updates.
- TDD: formatter and lifecycle refresh tests before production edits.
- No per-token or streaming updates; completed lifecycle boundaries are sufficient.
- No new persisted field. Current usage/countdown is ephemeral session state.
- No color, animation, custom footer, or replacement of Pi default footer.
- Keep status concise; avoid raw floating-point output such as `44.986029411764704%`.
- Keep `src/domain` free of Pi imports and `src/infra` responsible for Pi API calls.

## Non-goals
- Showing total token count or model context window.
- Changing configured threshold semantics.
- Changing when decompression triggers.
- Adding ETA or time-based prediction.
- Persisting last observed usage across restarts.

## Verification
- Focused domain formatter tests.
- Focused infrastructure lifecycle/status tests.
- Watcher `verify @agent-final` with freshness proof.
- Manual footer smoke check is useful but not required for normal deterministic gate.
