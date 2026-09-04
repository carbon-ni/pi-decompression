---
id: TASK-0009
title: Add immediate decompression command
status: done
depends_on: [TASK-0007]
priority: normal
tags: [decompression, command, qol, manual]
---

# Add immediate decompression command

## Problem
Users can configure automatic decompression but cannot explicitly request one through product language. They must know and use Pi's technical `/compact` command, which bypasses `/break` mental model and may not create same handoff experience.

## Desired outcome
User can run `/break now` to request one handoff decompression immediately. Canonical alias `/decompress now` behaves identically.

## Product contract

```text
/break now
/decompress now
```

- Explicit request works whether automatic watcher is on or off.
- It does not change persisted enabled state or threshold.
- It uses same handoff compaction path as automatic decompression.
- Initial version accepts request only while Pi is idle. Busy invocation fails clearly instead of aborting an in-flight tool or task.
- Because idle invocation does not interrupt active goal, it does not synthesize `Continue...` afterward.

## Acceptance criteria
- [x] Parser recognizes exact single argument `now` as explicit decompression action.
- [x] `/break now` and `/decompress now` share exact handler and behavior.
- [x] Idle invocation starts exactly one `ctx.compact()` call using existing handoff hook.
- [x] Explicit invocation works with automatic decompression disabled and without configured threshold.
- [x] Invocation leaves `enabled` and `thresholdPercent` unchanged in memory and persisted config.
- [x] Successful explicit decompression reports concise completion notification.
- [x] Compaction rejection/failure reports actionable error and clears request state so later `/break now` can retry.
- [x] Invocation with no compactable history reports Pi error, including `Nothing to compact`, without synthetic continuation or loop.
- [x] Busy invocation does not call `ctx.abort()` or `ctx.compact()` and reports: wait until current work settles, then retry.
- [x] Existing pending user messages count as busy and are not overtaken.
- [x] Manual request cannot race or start second compaction while automatic request is pending/active.
- [x] Successful manual decompression disarms automatic threshold until usage is observed below threshold, matching TASK-0007 loop guard.
- [x] Explicit idle decompression never sends synthetic continuation.
- [x] Command usage/help becomes `/decompress [on|off|now] [threshold]` and equivalent `/break` copy.
- [x] README documents `now`, idle-only boundary, state preservation, and difference from automatic threshold behavior.
- [x] Deterministic tests cover parser success/rejection, disabled state, enabled state preservation, busy rejection, duplicate suppression, success, failure, no-history error, and no continuation.
- [x] Watcher `@agent-final` gate passes with freshness proof.

## Suggested TDD sequence

### Red — command language
Add pure parser tests first:

| input | action |
| --- | --- |
| `now` | explicit decompression |
| `NOW` | explicit decompression |
| `now 60` | invalid |
| `now please` | invalid |
| `on now` | invalid |

Do not overload threshold number or existing on/off actions.

### Red — idle lifecycle
At infrastructure boundary, enable neither watcher nor threshold. Invoke `now`; assert:
1. one compaction starts;
2. same custom handoff hook is eligible despite watcher being disabled;
3. completion clears request and notifies;
4. resume adapter is not called.

### Red — failure and safety
- Busy context: no abort, no compaction, explicit retry-later notification.
- Existing active/pending compaction: reject duplicate.
- `ctx.compact().onError`: clear state, report reason, allow later retry.

### Green
Represent explicit request in same lifecycle state machine rather than calling unrelated second compaction implementation. Distinguish request source (`automatic-active`, `automatic-idle`, `manual-idle`) so handoff eligibility, continuation, notification, and threshold disarming remain explicit.

### Refactor
Keep one `startDecompression` and one completion owner. Avoid boolean combinations that make manual/automatic behavior implicit. Composition root remains only dependency wiring.

## Constraints
- Complete TASK-0007 first; this command builds on corrected continuation and threshold re-arm lifecycle.
- TDD: happy and unhappy paths before production edits.
- Never compact or abort midway through active tool execution.
- No timer, polling, or second handoff generator.
- Do not persist transient manual request.
- Do not silently fall back to default Pi compaction when user requested handoff decompression.
- Do not add compatibility command beyond existing `/break` alias.

## Non-goals
- Scheduling `/break now` while agent is busy; initial contract rejects it safely.
- Changing automatic threshold.
- Enabling watcher as side effect.
- Resuming already-idle work after manual invocation.
- Replacing Pi's built-in `/compact` command.

## Verification
- Focused domain parser tests.
- Focused infrastructure manual lifecycle tests.
- Entry-point alias wiring tests.
- Watcher `verify @agent-final`.
- Optional manual smoke: disabled watcher → `/break now` → handoff path exists → no continuation turn.
