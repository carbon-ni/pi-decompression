---
id: TASK-0001
title: Show decompression state in status bar
status: todo
depends_on: [TASK-0003]
priority: normal
tags: [ui, decompression]
---

# Show decompression state in status bar

## Problem
Users cannot see whether automatic decompression is enabled or which threshold is armed without running a command. Footer should make active decompression state visible at a glance.

## Desired outcome
When handoff decompression is active, Pi's default footer shows compact status item with active threshold. Users do not need to run `/break` to confirm current state.

## Acceptance criteria
- [ ] After `/break on 60` or `/decompress on 60`, footer status is `decompression on:60%`.
- [ ] After enabling without configured threshold, footer status is `decompression on:no-threshold` so state is explicit rather than misleading.
- [ ] After `/break off` or `/decompress off`, decompression status item is cleared.
- [ ] On session start in trusted project, restored enabled state appears in footer with restored threshold.
- [ ] On session start with disabled, missing, malformed, or untrusted configuration, status item is absent.
- [ ] Status updates immediately after successful command state mutation; persistence failure does not leave footer out of sync with active in-memory state.
- [ ] Existing command notifications, aliases, threshold behavior, and handoff decompression remain unchanged.
- [ ] Deterministic tests cover enabled-with-threshold, enabled-without-threshold, disabled, restored, and invalid/untrusted paths.
- [ ] README documents footer item and exact displayed forms.
- [ ] `make check` prints `true`.

## Constraints
- Use Pi's additive `ctx.ui.setStatus("decompression", value)` API; do not replace default footer with `setFooter`.
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

