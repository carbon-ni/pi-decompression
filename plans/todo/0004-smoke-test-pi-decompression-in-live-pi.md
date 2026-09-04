---
id: TASK-0004
title: Smoke-test pi-decompression in live Pi
status: doing
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
- [ ] Start real Pi 0.84.4 with repository extension entrypoint in isolated temporary trusted project.
- [ ] `/decompress` and `/break` appear and invoke same runtime state; `/compactor` is unavailable.
- [ ] Default/disabled state shows no decompression footer item.
- [ ] `/decompress on 60` renders `decompression on:60%`; `/break off` clears item.
- [ ] Trusted state persists only to `.pi/decompression.json` and restores after clean Pi restart.
- [ ] With usable model credentials, threshold crossing creates handoff under isolated reports directory, compacts once at turn boundary, and resumes interrupted goal once.
- [ ] Existing queued input is not overtaken by synthetic continuation during smoke scenario.
- [ ] If model/provider access prevents end-to-end threshold scenario, record exact blocker as unverified; do not simulate or claim pass.
- [ ] Capture concise evidence without API keys, session contents, full handoff content, or other secrets.
- [ ] Temporary project and report paths are isolated from repository; no generated `.pi`, session, report, or cache artifact is committed.
- [ ] Any code fix is covered by deterministic regression test and all normal/release checks remain green.

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

