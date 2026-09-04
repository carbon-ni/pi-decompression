# Source guidance

`src` is the extension implementation. Keep the dependency direction explicit:

- `index.ts` is the composition root and Pi package entrypoint. Register commands and lifecycle handlers here; wire concrete adapters here.
- `domain/` owns pure, deterministic decompression policy and contracts.
- `infra/` owns Pi API, model, filesystem, and lifecycle adapters; it coordinates the domain policy.
- `cli/`, `fixtures/`, and `lib/` are reserved areas. Add code there only when it has the responsibility described by its local README; do not use them to bypass the domain/infra boundary.

Tests stay beside their implementation as `*.test.ts`. For behavior changes, add happy and unhappy-path tests before implementation and use injected adapters for deterministic boundaries.

Use the repository Make targets for proof: `make test` for focused behavior, `make architecture` for dependency direction, and `make check` for the normal lint/typecheck/test gate.
