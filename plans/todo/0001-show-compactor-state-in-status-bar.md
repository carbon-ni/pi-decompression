---
id: TASK-0001
title: Show compactor state in status bar
status: todo
depends_on: []
priority: normal
tags: [ui, compactor]
---

# Show compactor state in status bar

## Problem
Users cannot see whether automatic compaction is enabled or which threshold is armed without running a command. The footer should make active compactor state visible at a glance.

## Desired outcome
When handoff compaction is active, Pi's default footer shows a compact status item with the active threshold. Users do not need to run `/break` to confirm current state.

## Acceptance criteria
- [ ] After `/break on 60` or `/compactor on 60`, footer status is `break on:60%`.
- [ ] After enabling without a configured threshold, footer status is `break on:no-threshold` so state is explicit rather than misleading.
- [ ] After `/break off` or `/compactor off`, compactor status item is cleared.
- [ ] On session start in trusted project, restored enabled state appears in footer with restored threshold.
- [ ] On session start with disabled, missing, malformed, or untrusted configuration, status item is absent.
- [ ] Status updates immediately after successful command state mutation; persistence failure does not leave footer out of sync with active in-memory state.
- [ ] Existing command notifications, aliases, threshold behavior, and handoff compaction remain unchanged.
- [ ] Deterministic tests cover enabled-with-threshold, enabled-without-threshold, disabled, restored, and invalid/untrusted paths.
- [ ] README documents footer item and exact displayed forms.
- [ ] `make check` prints `true`.

## Constraints
- Use Pi's additive `ctx.ui.setStatus("compactor", value)` API; do not replace default footer with `setFooter`.
- Derive display from same in-memory state used by command and threshold watcher; no second state source.
- Keep status formatting deterministic and independently testable.

## Non-goals
- Showing live context usage or countdown until threshold.
- Making footer text configurable.
- Adding another command or changing configuration schema.
- Displaying an `off` item permanently.

## Reference
- Pi docs: `docs/tui.md`, Pattern 4 (Persistent Status Indicator).
- Pi example: `examples/extensions/status-line.ts`.

