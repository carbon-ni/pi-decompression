---
id: TASK-0002
title: Compact and resume long-running agent work
status: doing
depends_on: []
priority: high
tags: [compactor, lifecycle, reliability]
---

# Compact and resume long-running agent work

## Problem
A long multi-turn agent run can pass far beyond the configured `/break` threshold because custom compaction waits until the agent fully settles. Compacting immediately while busy aborts work and does not automatically resume it, so users need bounded, safe interruption and continuation.

## Desired outcome
When context crosses the configured threshold during active work, extension pauses at next completed turn boundary, creates one handoff compaction, and continues same user goal without requiring manual prompt.

## Acceptance criteria
- [ ] Context usage is evaluated after each completed turn while `/break` is enabled with threshold.
- [ ] When usage first reaches or exceeds threshold during active run, current turn and tool results finish, but no additional LLM turn begins before compaction.
- [ ] Extension records one pending compaction and requests one safe stop; repeated lifecycle events cannot start concurrent compactions.
- [ ] Once agent settles due to extension request, extension performs exactly one handoff compaction.
- [ ] After successful compaction, extension resumes interrupted user goal exactly once when no queued user message already provides continuation.
- [ ] Existing steering and follow-up messages keep order and are not duplicated, dropped, or overtaken by synthetic continuation.
- [ ] If threshold is reached when agent is already idle, compaction runs without synthetic continuation.
- [ ] Manual or Pi-native compaction never causes synthetic continuation unless extension previously marked active work as interrupted.
- [ ] Explicit `/break off` clears pending automatic interruption before compaction or resume.
- [ ] Compaction cancellation/failure reports actionable error, clears pending state, and never enters compact/resume loop.
- [ ] Post-compaction stale usage cannot immediately retrigger threshold; later fresh usage can trigger another cycle.
- [ ] Behavior continues for repeated threshold crossings until user disables `/break` or session ends.
- [ ] Deterministic tests cover active success, idle success, queued-message preservation, duplicate-event suppression, disable race, compaction failure/cancellation, stale usage, and later re-trigger.
- [ ] Existing command, persistence, handoff, and settled fallback behavior remains compatible.
- [ ] README explains threshold is enforced at turn boundary and active work resumes after successful compaction.
- [ ] `make check` prints `true`.

## Constraints
- Do not call manual compaction concurrently with Pi compaction.
- Do not interrupt midway through tool execution; completed tool results must remain in session and handoff context.
- Continuation must use explicit session-lifecycle state, not inference from arbitrary messages.
- Pending interruption/resume state is session-local and must not alter `.pi/compactor.json` schema.
- Prefer Pi lifecycle events and `ctx.compact` completion/error callbacks over timers or polling.

## Non-goals
- Guaranteeing exact token percentage before provider response completes.
- Retrying failed handoff model calls automatically.
- Changing Pi's built-in overflow recovery behavior.
- Persisting interrupted work across process crash or Pi restart.
- Adding pending/resuming text to status bar; track separately in `TASK-0001` if wanted.

## References
- Pi extension lifecycle: `turn_end`, `agent_end`, and `agent_settled`.
- `ctx.compact()` is manual compaction: it aborts active operation and does not own automatic retry.
- Pi native overflow compaction owns retry semantics; extension must not imitate it implicitly.

