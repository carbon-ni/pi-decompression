---
id: TASK-0004
title: Smoke-test pi-decompression in live Pi
status: done
depends_on: []
priority: high
tags: [qa, tui, decompression]
---

# Smoke-test pi-decompression in live Pi

## Problem
Automated tests verify extension wiring and lifecycle state, but no real Pi TUI run has confirmed command discovery, footer rendering, persisted state, threshold handoff, and automatic continuation together.

## Desired outcome
Produce reproducible, sanitized evidence that installed Pi 0.84.4 loads pi-decompression and user-visible lifecycle works outside test doubles. Fix any extension defect found; report Pi/core limitation separately.

## Acceptance criteria
- [x] Start real Pi 0.84.4 with repository extension entrypoint in isolated temporary trusted project.
- [x] `/decompress` and `/break` appear and invoke same runtime state; `/compactor` is unavailable.
- [x] Default/disabled state shows no decompression footer item.
- [x] `/decompress on 60` renders `decompression on:60%`; `/break off` clears item.
- [x] Trusted state persists only to `.pi/decompression.json` and restores after clean Pi restart.
- [x] With usable model credentials, threshold crossing creates handoff under isolated reports directory, compacts once at turn boundary, and resumes interrupted goal once.
- [x] Existing queued input is not overtaken by synthetic continuation during smoke scenario.
- [x] If model/provider access prevents end-to-end threshold scenario, record exact blocker as unverified; do not simulate or claim pass.
- [x] Capture concise evidence without API keys, session contents, full handoff content, or other secrets.
- [x] Temporary project and report paths are isolated from repository; no generated `.pi`, session, report, or cache artifact is committed.
- [x] Any code fix is covered by deterministic regression test and all normal/release checks remain green.

## Constraints
- Prefer scriptable PTY/RPC evidence where it exercises same extension APIs; use interactive TUI for footer rendering proof.
- Use bounded timeouts and abort hung Pi/model processes cleanly.
- Do not modify global Pi configuration, credentials, or current working session.
- Do not publish or rename repository.

## Non-goals
- Visual pixel-perfect testing of entire Pi footer.
- Provider performance benchmarking or token-cost comparison.
- Testing every model/provider.
- Changing product behavior without a separately shaped defect.

## Evidence to record
- Pi version and invocation shape.
- Sanitized command/status observations.
- Config and handoff path existence, not sensitive content.
- Compaction/resume event count or observable equivalent.
- Verification commands and any residual runtime unknowns.

## Completion evidence
- Sanitized report: `/Users/cristianoliveira/.agents/reports/04-09-26/TASK-0004-live-pi-smoke-test.md`.
- Pi 0.84.4 TUI/RPC verified command discovery, exact footer transitions, config persistence/restore, threshold handoff, exact-one compaction/continuation, and queued-input ordering.
- Threshold scenario used `openai-codex/gpt-5.4` in isolated environment with no provider errors.
- 107 tests pass; coverage is 100% statements, branches, functions, and lines; normal/release checks pass.
- No source defect or code change was needed.
- Exact semantic resumed text remains intentionally unverified because prompt/session/handoff content was not retained.

