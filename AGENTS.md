# Agent guidance

## Repository map

This repository is a TypeScript Pi extension. Route work to the smallest owner:

- `src/index.ts` is the composition root: it registers `/decompress` and `/break` and wires Pi lifecycle handlers.
- [`src/domain/AGENTS.md`](src/domain/AGENTS.md) covers pure threshold, command, state, and handoff policy.
- [`src/infra/AGENTS.md`](src/infra/AGENTS.md) covers Pi lifecycle coordination plus filesystem, model, and persistence adapters.
- [`src/AGENTS.md`](src/AGENTS.md) covers source-level routing and the reserved `cli`, `fixtures`, and `lib` areas.

Tests are colocated with each owner. Follow the route from changed source to its neighboring test, then use the Make target that proves the relevant invariant.

## Shared workflow

- Start with `git status --short --branch` and `make help`.
- Use TDD. Cover happy and unhappy paths before implementation.
- Run focused tests while editing; finish with `make check`.
- Keep tests beside source. Do not create root `tests/`.
- Keep `src/domain` and `src/lib` free of external imports.
- Put Pi, file, process, model, and network adapters in `src/infra`.
- Wire dependencies in `src/index.ts`.
- Use exact dependency versions and `npm ci`.
- Keep normal gate unchanged: lint, typecheck, deterministic tests.
- Use `make release-check` for formatting, architecture, coverage, audit, and package checks.
- Use Conventional Commits. Never amend completed history.
