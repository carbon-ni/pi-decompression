---
id: TASK-0007
title: Prove and fix active-work continuation after decompression
status: doing
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

## Acceptance criteria
- [ ] Add deterministic full-path test that loads real extension through Pi SDK/runtime rather than directly calling extension handlers.
- [ ] Script model behavior so active goal needs another turn, first completed turn crosses threshold, compaction returns usable handoff, and resumed turn emits unique marker such as `ORIGINAL_GOAL_RESUMED`.
- [ ] Assert ordered evidence: original user goal → completed pre-threshold turn/tool result → one compaction entry/event → synthetic continuation user message → resumed assistant marker.
- [ ] Assert no assistant continuation starts between threshold crossing and compaction.
- [ ] Assert exactly one compaction and exactly one synthetic continuation; another generic `agent_start` is insufficient evidence.
- [ ] Assert continuation message is accepted by Pi, appears in session context, and results in resumed assistant output.
- [ ] Add unhappy-path proof that compaction failure emits error and never sends/runs continuation.
- [ ] Preserve queued-user-message behavior: real queued input is not overtaken or duplicated by synthetic continuation.
- [ ] Reproduce scenario with repository-pinned Pi 0.84.4 and user's installed Pi version; record version-specific difference if any.
- [ ] Production code is unchanged until new full-path test fails for observed reason.
- [ ] Smallest evidence-backed fix makes new regression test pass without weakening existing active, idle, queue, collision, failure, and stale-usage tests.
- [ ] README describes actual ordering precisely: stop boundary, compaction, and when continuation is queued/delivered.
- [ ] `make check` passes and coverage remains at configured threshold.

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
- If post-compaction `sendUserMessage` throws because Pi is still streaming, supply explicit `deliverAs: "followUp"` through adapter contract and test its queue/delivery ordering.
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

## Evidence to retain
- Pi version under test.
- Minimal ordered event trace.
- Session entry roles around compaction.
- Continuation acceptance or exact extension error.
- Failing test output before fix and passing output after fix.
- Focused and final verification commands.
