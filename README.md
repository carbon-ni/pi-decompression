# pi-compactor

Guarded TypeScript starter for a [Pi extension](https://github.com/earendil-works/pi-mono).

The starter exports an empty extension factory. Compaction policy is intentionally not defined yet; add it through tests when requirements are clear.

## Start

```bash
nix develop
npm ci
make hooks-install
make check
pi -e ./src/index.ts
```

Pi should start without an extension load error. The starter registers no commands or tools.

## Canonical workflow

| Phase | Command | Enforcement |
| --- | --- | --- |
| Install | `npm ci` | lockfile and CI |
| During work | `make watch` | Funzzy runs normal gate |
| Before commit/push | `make check` | versioned Git hooks |
| CI | `make check` | GitHub Actions |
| Release | `make release-check` | tag workflow |

`make check` is normal gate. Success output is exactly `true`. Failure output starts with `false` and ends with bounded diagnostics.

Formatting, architecture, coverage, package verification, and dependency audit are explicit release checks. They do not make normal feedback loop slower.

See [DEVELOPMENT.md](DEVELOPMENT.md) for operating rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries.

## Done

A change is done when:

1. Happy and unhappy paths have deterministic, co-located tests.
2. `make check` prints `true`.
3. Relevant manual checks pass.
4. Documentation matches behavior.
5. Commit uses Conventional Commits.
