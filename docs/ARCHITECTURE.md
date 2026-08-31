# Architecture

## Shape

```text
src/
├── index.ts      # composition root and Pi package entry
├── domain/       # pure compaction policy
├── lib/          # shared project-owned utilities
├── cli/          # optional executable adapters
├── fixtures/     # deterministic test data
└── infra/        # Pi API and other external adapters
```

Tests live beside implementation as `*.test.ts`.

## Dependency direction

```text
index -> infra -> domain
             \-> lib
domain -------> lib
```

`domain` and `lib` must not import external packages. `make architecture` enforces this rule. `src/index.ts` owns dependency wiring. Pi APIs, file systems, models, clocks, network, and process access belong in `src/infra`.

The current starter has only an empty composition root. Add domain and infrastructure code only when compaction behavior is defined by a failing test.

## Configuration

Use one JSON configuration file if extension needs runtime settings. Resolve values in this order:

1. built-in defaults
2. project configuration file
3. environment variables

Read project configuration only after `ctx.isProjectTrusted()` returns true. Parse configuration in infrastructure, then pass typed values to domain code.

## Change rules

- Keep policy pure and deterministic.
- Keep external side effects behind explicit adapters.
- Prefer early returns.
- Add new module only when it owns a distinct reason to change.
- Keep test fixtures in `src/fixtures`; do not hide business examples in mocks.
