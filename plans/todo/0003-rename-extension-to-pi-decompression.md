---
id: TASK-0003
title: Rename extension to pi-decompression
status: todo
depends_on: []
priority: high
tags: [rename, branding, decompression]
---

# Rename extension to pi-decompression

## Problem
The current pi-compactor name describes mechanism rather than intended experience. Product should frame the feature as decompression: a middle ground between coffee-break rest and structured retrospective, combining rest, unstructured thinking, and informal reflection.

## Desired outcome
Product is consistently named and presented as **pi-decompression**. User-facing language explains decompression as space between a coffee break and retrospective: rest plus unstructured thinking plus informal reflection. Technical Pi compaction remains implementation mechanism, not product identity.

## Ubiquitous language
- **Decompression:** user-facing experience, extension, runtime state, and canonical command.
- **Break:** short, friendly command alias for decompression.
- **Handoff:** durable context artifact created during decompression.
- **Compaction:** Pi lifecycle/API term only; use where technical contract requires it.
- **Retro:** comparison point in product story, not feature or command.

## Acceptance criteria
- [ ] Package metadata and lockfile identify package as `pi-decompression` with description and keywords matching new positioning.
- [ ] README title, introduction, commands, examples, behavior, and troubleshooting consistently present pi-decompression.
- [ ] README includes product framing: a coffee break is mostly rest; a retro is structured reflection; decompression combines rest, unstructured thinking, and informal reflection.
- [ ] Canonical command is `/decompress [on|off] [threshold]`; `/break` remains short alias using exact same handler and state.
- [ ] `/compactor` is no longer registered or documented.
- [ ] Command descriptions, usage output, status notifications, errors, and continuation copy use decompression language rather than compactor branding.
- [ ] Extension factory, product-owned modules/files, exported types, creators, state parsers, and tests use decompression naming.
- [ ] Pi contract terms such as `session_before_compact`, `ctx.compact()`, compaction event types, and compaction result fields retain correct technical names.
- [ ] Project config moves to `<cwd>/.pi/decompression.json`; code does not read or write `.pi/compactor.json`.
- [ ] No compatibility alias or automatic migration preserves `/compactor`, old config path, or old product-owned symbols.
- [ ] Existing trusted-project, threshold, interrupt/resume, handoff, collision, and failure behavior remains unchanged.
- [ ] Architecture and development docs describe implemented decompression extension rather than starter or old product identity.
- [ ] Open plans use decompression language and depend on rename where implementation would otherwise cause rework; completed plans remain immutable historical records.
- [ ] Tests prove `/decompress` and `/break` share handler, `/compactor` is absent, config uses only new path, and user-facing copy is rebranded.
- [ ] `make check`, `make coverage`, `make architecture`, `make format-check`, and `make pack-check` pass.

## Constraints
- This is a clean active refactor, not compatibility migration.
- Preserve behavior; do not combine rename with new decompression features or configuration schema changes.
- Keep composition root as dependency owner and retain domain/infra boundaries.
- Rename via semantic references where available; verify remaining literal occurrences separately.
- Historical Git commits and completed task records are not rewritten.

## Non-goals
- GitHub repository rename, npm publication, release announcement, or migration guide.
- Logo, badge, color palette, illustrations, or other visual assets.
- `/retro` command or structured retrospective workflow.
- Changing handoff file layout or content-generation policy.
- Implementing status-bar task `TASK-0001` as part of rename.

## Completion evidence
- List semantic and file renames.
- Record intentional remaining uses of technical word `compaction`.
- Record checks and package inspection result.

