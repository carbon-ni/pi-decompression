---
id: TASK-0008
title: Show decompression countdown in status bar
status: done
depends_on: [TASK-0007]
priority: normal
tags: [decompression, status-bar, qol, visibility]
---

# Show decompression countdown in status bar

## Problem
Footer shows only whether decompression is enabled and configured threshold. Users cannot see how close current context is to threshold, so decompression timing feels surprising.

## Desired outcome
While decompression is enabled, footer shows remaining model context capacity beside configured decompression threshold. User can see both overall context headroom and configured trigger without running command.

Confirmed compact format:

```text
decompression 55% left/60%
```

Here `left` means unused model context, not distance to decompression threshold. At 45% context usage with a 60% decompression threshold:

```text
left = max(100 - contextUsagePercent, 0) = 55
```

## Acceptance criteria
- [x] Enabled state with known usage and threshold renders `decompression <context-left>% left/<threshold>%`.
- [x] Remaining capacity is derived from same context usage observed by watcher; display never becomes second policy source.
- [x] Fractional usage has deterministic compact rounding and never displays `0% left` before context is exhausted. Recommended: `ceil(max(100 - usage, 0))`.
- [x] At or above 100% context usage, display clamps to `0% left`; it never shows a negative value.
- [x] Crossing decompression threshold does not redefine `left`: 60% usage at 60% threshold renders `decompression 40% left/60%` until compaction completes.
- [x] Enabled state with threshold but unavailable post-compaction/startup usage renders explicit unknown state: `decompression -- left/60%`.
- [x] Enabled state without configured threshold remains `decompression on:no-threshold`.
- [x] Disabled state clears footer item.
- [x] Footer refreshes after completed turns, idle usage observation, successful compaction, state restoration, and `/decompress` or `/break` mutations.
- [x] Successful compaction clears stale countdown to unknown until fresh usage is available.
- [x] Status formatting remains pure in `src/domain`; Pi usage lookup and `setStatus` stay in `src/infra`.
- [x] Existing threshold crossing, continuation, re-arm, notification, and persistence behavior remains unchanged.
- [x] Deterministic tests cover known, unknown, below, exact, above, fractional, no-threshold, disabled, command-update, and post-compaction states.
- [x] README documents status format and defines `left` as remaining total model context capacity, distinct from configured usage threshold.
- [x] Watcher `@agent-final` gate passes.

## Suggested TDD sequence

### Red — domain formatting
Extend formatter contract to accept optional current usage percent. Add table-driven tests first:

| usage | threshold | expected |
| ---: | ---: | --- |
| unavailable | 60 | `decompression -- left/60%` |
| 45 | 60 | `decompression 55% left/60%` |
| 44.98 | 60 | `decompression 56% left/60%` |
| 60 | 60 | `decompression 40% left/60%` |
| 75 | 60 | `decompression 25% left/60%` |
| 100 | 60 | `decompression 0% left/60%` |
| 105 | 60 | `decompression 0% left/60%` |

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
- Showing total token count or raw model context-window size.
- Changing configured threshold semantics.
- Changing when decompression triggers.
- Adding ETA or time-based prediction.
- Persisting last observed usage across restarts.

## Verification
- Focused domain formatter tests.
- Focused infrastructure lifecycle/status tests.
- Watcher `verify @agent-final` with freshness proof.
- Manual footer smoke check is useful but not required for normal deterministic gate.
