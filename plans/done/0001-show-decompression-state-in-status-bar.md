---
id: TASK-0001
title: Show decompression state in status bar
status: done
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
- [x] After `/break on 60` or `/decompress on 60`, footer status is `decompression on:60%`.
- [x] After enabling without configured threshold, footer status is `decompression on:no-threshold` so state is explicit rather than misleading.
- [x] After `/break off` or `/decompress off`, decompression status item is cleared.
- [x] On session start in trusted project, restored enabled state appears in footer with restored threshold.
- [x] On session start with disabled, missing, malformed, or untrusted configuration, status item is absent.
- [x] Status updates immediately after successful command state mutation; persistence failure does not leave footer out of sync with active in-memory state.
- [x] Existing command notifications, aliases, threshold behavior, and handoff decompression remain unchanged.
- [x] Deterministic tests cover enabled-with-threshold, enabled-without-threshold, disabled, restored, and invalid/untrusted paths.
- [x] README documents footer item and exact displayed forms.
- [x] `make check` prints `true`.

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

## Completion evidence
- Implementation: `675050e feat: show decompression state in status bar (TASK-0001)`.
- `formatDecompressionStatus` is pure; infrastructure applies same runtime state through additive `setStatus`.
- 107 tests pass with 100% statements, branches, functions, and lines.
- `make check`, architecture, format-check, and pack-check pass.
- Package dry-run contains no tests or `.pi` artifacts.

