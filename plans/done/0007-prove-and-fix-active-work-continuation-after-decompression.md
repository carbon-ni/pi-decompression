---
id: TASK-0007
title: Prove and fix active-work continuation after decompression
status: done
depends_on: []
priority: high
tags: [decompression, continuation, integration, regression]
---

# Prove and fix active-work continuation after decompression

## Problem
A user observed that active work stops after threshold-triggered decompression instead of continuing. Existing unit tests prove mocked callbacks, and the previous Pi 0.84.4 smoke test counted a post-compaction agent turn, but neither proves that real Pi accepts the synthetic continuation and completes the interrupted goal.

## Desired outcome
When active work crosses configured threshold, Pi preserves completed turn, compacts once, and continues same goal without user prompt. A deterministic test proves full runtime sequence and semantic completion, not only callback invocation or event count.

## Important compatibility context
- Repository tests pin `@earendil-works/pi-coding-agent` 0.84.4.
- Previously recorded live smoke used Pi 0.84.4.
- Installed Pi documentation is 0.85.0; reproduce against user's actual Pi version before concluding behavior is correct.
- Pi 0.85 documentation says `sendUserMessage()` throws during streaming unless `deliverAs` is supplied.
- Current adapter calls `pi.sendUserMessage(message)` without delivery option from compaction completion callback. Treat this as hypothesis, not proven root cause.

## Observed reproduction

Real Pi produced this exact failure after a successful compaction:

```text
Extension "<runtime>" error: Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.
```

This confirms continuation is attempted while Pi still considers agent active. Current `pi.sendUserMessage(message)` call lacks explicit follow-up delivery semantics, so Pi rejects message instead of queueing it. User's original diagnosis is correct.

Same run later retriggered decompression while post-compaction context remained about 45% against 40% threshold and failed with `Nothing to compact (session too small)`. Treat this as related regression evidence: continuation fix must not create compact/resume loop, and test should distinguish one interrupted cycle from later irreducible high usage.

## Acceptance criteria
- [x] Add deterministic full-path test that loads real extension through Pi SDK/runtime rather than directly calling extension handlers.
- [x] Script model behavior so active goal needs another turn, first completed turn crosses threshold, compaction returns usable handoff, and resumed turn emits unique marker such as `ORIGINAL_GOAL_RESUMED`.
- [x] Assert ordered evidence: original user goal → completed pre-threshold turn/tool result → one compaction entry/event → synthetic continuation user message → resumed assistant marker.
- [x] Assert no assistant continuation starts between threshold crossing and compaction.
- [x] Assert exactly one compaction and exactly one synthetic continuation; another generic `agent_start` is insufficient evidence.
- [x] Assert continuation message is accepted by Pi, appears in session context, and results in resumed assistant output.
- [x] Add unhappy-path proof that compaction failure emits error and never sends/runs continuation.
- [x] Preserve queued-user-message behavior: real queued input is not overtaken or duplicated by synthetic continuation.
- [x] Exercise the repository-pinned Pi 0.84.4 runtime and, when an equivalent offline harness exists, the installed Pi version; otherwise record the installed version and observed error as version-specific evidence without claiming equivalent reproduction.
- [x] New full-path test reproduces the rejected continuation with an equivalent `Agent is already processing` failure before production change when the target runtime exposes that failure. If the pinned SDK accepts the old call, record the controlled no-option pass and retain focused adapter red evidence instead of fabricating a full-path red result.
- [x] Successful fix queues continuation explicitly as follow-up when Pi remains active during compaction completion; test proves it is later delivered exactly once.
- [x] Production code is unchanged until the smallest available regression test fails for the observed reason; a focused adapter red test is acceptable when the pinned SDK cannot expose the installed-runtime incompatibility.
- [x] Smallest evidence-backed fix makes new regression test pass without weakening existing active, idle, queue, collision, failure, and stale-usage tests.
- [x] README describes actual ordering precisely: stop boundary, compaction, and when continuation is queued/delivered.
- [x] `make check` passes and coverage remains at configured threshold.

## Recommended deterministic test design

Keep test beside source, for example `src/index.integration.test.ts`.

1. Use Pi SDK `createAgentSession()` with:
   - `DefaultResourceLoader({ additionalExtensionPaths: [absolute src/index.ts path] })`;
   - `SessionManager.inMemory()`;
   - `SettingsManager.inMemory()` with Pi native auto-compaction disabled to avoid collision;
   - isolated temporary cwd and agent directory;
   - no real credentials or network.
2. Supply scripted fake model/provider. Route requests by content, not timing:
   - original goal request: return tool call or incomplete work plus usage above decompression threshold;
   - handoff prompt beginning `You are writing a handoff document`: return valid handoff sections;
   - synthetic `Continue the interrupted user task using the handoff context.` request: return `ORIGINAL_GOAL_RESUMED` with usage below threshold.
3. Subscribe to session events and retain compact structured trace. Also inspect in-memory session entries/messages after settle.
4. Fail test unless trace proves semantic sequence. Do not infer continuation from `agent_start` count.
5. Bound every wait. On timeout, print last events/state and dispose session so failure is actionable and test cannot hang.

If SDK fixture cannot exercise same `pi.sendUserMessage` binding as CLI, use isolated `pi --mode rpc` subprocess with scripted local provider. Parse stdout as strict LF-delimited JSONL; do not use Node `readline`, per Pi RPC contract.

## TDD sequence for developer

### Red 1 — full wired lifecycle
Add integration test for:

`turn_end → safe interruption → agent_settled → compaction → continuation accepted → ORIGINAL_GOAL_RESUMED`

This test must fail for user's observed behavior before any production edit. If it passes on 0.84.4, run same scenario on installed Pi version and capture first event/state divergence.

### Red 2 — explicit delivery semantics
Instrument test trace around compaction callback:
- `ctx.isIdle()` state if observable;
- compaction start/end;
- queue updates;
- extension errors/notifications;
- whether continuation user message enters session.

Do not encode assumed fix before knowing which transition fails.

### Green — choose fix from evidence
- **Confirmed path:** post-compaction `sendUserMessage` throws because Pi is still processing. Supply explicit `deliverAs: "followUp"` through adapter contract and test its queue/delivery ordering. Keep delivery decision explicit at composition root.
- If compaction completion callback is not reached, reconcile request state with `session_compact` event and ensure exactly one owner resumes.
- If Pi accepts message but does not run it, verify queue state and trigger semantics before moving injection earlier.
- Queue continuation before compaction only if runtime test proves Pi retains it, does not execute it before compaction, and does not prevent `agent_settled`/compaction. Pi defines `agent_settled` as having no follow-up left, so pre-queueing can change lifecycle and must not be guessed.

### Refactor
Keep one continuation owner and one delivery adapter. Remove temporary instrumentation. Retain event trace only in failure messages.

## Constraints
- TDD: no production fix before reproducible failing test.
- No network or user credentials in normal test gate.
- Tests must be deterministic: scripted responses, unique markers, exact event ordering, bounded timeouts.
- Keep tests beside source; do not create root `tests/`.
- Do not weaken native Pi compaction, queue ordering, or failure safety.
- Do not interrupt midway through tool execution.
- Do not treat extension notification or callback invocation as proof of goal continuation.
- Preserve real user steering/follow-up ordering.

## Non-goals
- Rewriting handoff content quality.
- Changing threshold calculation.
- Depending on paid provider for normal CI.
- Solving every Pi version compatibility issue before identifying observed failing transition.

## Progress

- Minimal delivery fix committed: `fd24f35 fix: queue decompression continuation as follow-up TASK-0007`.
- Composition root now calls `pi.sendUserMessage(message, { deliverAs: "followUp" })`.
- Adapter regression assertion was red before production edit and green afterward.
- Focused index tests, typecheck, and `make check` pass.
- Secondary loop reproduced red and fixed across both idle and active paths: `5262e85` introduced threshold disarming; `b1a6ae6` added shared `observeThreshold()` plus active `onTurnEnd` regression coverage.
- Above-threshold post-compaction usage no longer retriggers; observed below-threshold usage re-arms a later crossing.
- Funzzy `verify @agent-final` passes through watcher generation 3.
- Added `src/index.integration.test.ts`: Pi SDK 0.84.4 loads the real extension entrypoint with `DefaultResourceLoader`, `SessionManager.inMemory()`, and an offline faux provider. It proves original goal → completed pre-threshold assistant turn → exactly one compaction entry/event → one synthetic continuation → `ORIGINAL_GOAL_RESUMED`, plus no assistant turn starts between the threshold boundary and compaction.
- The repository-pinned 0.84.4 SDK passes the semantic test. A controlled run with the old no-option call also passes on 0.84.4, so the previously observed `Agent is already processing` rejection is not reproducible in this SDK lifecycle; the installed Pi CLI is 0.85.0 and remains the version-specific source of that evidence.
- README now documents the stop boundary, compaction, and queued follow-up ordering.
- Added an active-threshold rearming regression test so `make coverage` remains at the configured 100% thresholds (113 tests; 100% statements, branches, functions, and lines).

## Evidence to retain
- Pi version under test.
- Minimal ordered event trace.
- Session entry roles around compaction.
- Continuation acceptance or exact extension error.
- Failing test output before fix and passing output after fix.
- Focused and final verification commands.
