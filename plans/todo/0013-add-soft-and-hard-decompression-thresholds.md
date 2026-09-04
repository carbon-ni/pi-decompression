---
id: TASK-0013
title: Add soft and hard decompression thresholds
status: doing
depends_on: []
priority: high
tags: []
---

# Add soft and hard decompression thresholds

## Problem
Stopping active work immediately at configured threshold is unnecessarily disruptive, but waiting indefinitely risks exhausting context. We need one pending decompression that waits at soft threshold and escalates safely when usage reaches 10% relative overhead.

## Desired outcome
Configured threshold becomes a soft request boundary. Active work may finish naturally after crossing it. If context reaches a derived hard boundary, Pi stops at next completed turn boundary, compacts once, and resumes interrupted work once.

## Product contract

```text
soft = configured threshold
hard = min(soft * 1.10, 100)
```

Examples: 60→66, 70→77, 90→99, 95→100. This is 10% relative overhead, not 10 percentage points.

Both boundaries control one request lifecycle:

1. Below soft: no request.
2. At soft but below hard: mark one pending request and let active run continue.
3. If agent settles naturally: compact once without synthetic continuation.
4. At hard: promote same request, abort only at completed `turn_end`, compact once after settlement, then synthesize at most one continuation.

## Acceptance criteria
- [ ] Pure policy derives hard threshold as `min(soft * 1.10, 100)` and covers 60→66, 70→77, 90→99, 95→100, and 100→100.
- [ ] Usage below soft creates no decompression request.
- [ ] Active usage at soft and below hard does not call `abort()` or `compact()` immediately; one pending request waits for safe settlement.
- [ ] Natural settlement after soft crossing compacts exactly once and never synthesizes continuation.
- [ ] Usage reaching hard promotes existing soft request instead of creating a second request.
- [ ] Hard crossing calls `abort()` exactly once at completed turn boundary, never during streaming or tool execution.
- [ ] After forced settlement, compaction runs exactly once and successful completion queues exactly one continuation.
- [ ] A direct below-soft→hard jump follows same forced path without needing earlier soft observation.
- [ ] Duplicate `turn_end`, `agent_settled`, compaction callbacks, and native compaction events cannot cause duplicate compaction or continuation.
- [ ] Real queued user input is never overtaken by synthetic continuation.
- [ ] Native Pi compaction satisfying pending soft or hard request prevents a second extension compaction; only genuinely interrupted hard path may resume.
- [ ] Failed/cancelled compaction clears pending state, reports error, and does not resume.
- [ ] Successful compaction disarms threshold until below-soft usage is observed, preserving loop prevention.
- [ ] Threshold status remains distance to configured soft threshold; hard threshold is not persisted or shown as a second countdown.
- [ ] Existing `/break now`, state persistence, safe tool-call boundary, and disabled/no-threshold behavior remain unchanged.
- [ ] README documents soft wait, derived hard limit, safe turn-boundary stop, and relative 10% formula.
- [ ] Deterministic tests cover soft natural settle, hard promotion, direct hard jump, duplicate/race, queued input, native compaction, failure, and re-arm paths.
- [ ] Watcher final and release gates pass at configured 100% coverage.

## Constraints
- Never abort active tool execution or an incomplete streamed assistant message.
- Do not send a follow-up before compaction; it would consume more context and delay settlement.
- Hard threshold is derived, not another persisted setting.
- Keep threshold arithmetic and state classification pure; Pi lifecycle effects stay in infrastructure.
- Use TDD with happy and unhappy paths before production changes.

## Non-goals
- Per-token hard-limit enforcement within one model response.
- Guaranteeing recovery when one response or tool result alone overflows provider context before a lifecycle boundary.
- User-configurable hard-overhead percentage in first version.

