# Development

## One command path

Use Make targets. Hooks, watcher, and CI call `make check`; do not create a second gate.

```bash
make help
make watch
make check
make release-check
```

## Lifecycle

- **Session start:** read open work and run `git status --short --branch`.
- **During work:** write failing happy and unhappy path tests first. Run focused tests, or keep `make watch` active.
- **Pre-commit and pre-push:** installed hooks run `make check`.
- **Landing:** run `git pull --ff-only`, `make check`, then `git push`.
- **Release:** create a SemVer tag only after `make release-check` passes. The tag workflow verifies package, but does not publish it.

## Policies and recovery

| Policy | Enforcement | Recovery |
| --- | --- | --- |
| Exact dependency graph | `npm ci` | remove local install and rerun `npm ci` |
| Normal gate parity | `make check` everywhere | run failing script shown in bounded output |
| Versioned hooks | `make hooks-check` | `make hooks-install` |
| Dependency direction | `make architecture` | move adapter import to `src/infra` |
| Deterministic tests | `make test` | mock clock, randomness, network, and process boundaries |
| Conventional commits | `.githooks/commit-msg` | rewrite first line, for example `feat: add policy` |

## DO NOT

- Do not import external packages from `src/domain` or `src/lib`; this couples policy to infrastructure.
- Do not create a root `tests/` directory; co-locate tests with code.
- Do not edit `package-lock.json` by hand; use exact npm installs.
- Do not add formatting, coverage, security, or architecture checks to normal gate without an explicit decision; this slows feedback and breaks gate contract.
- Do not publish from CI until package ownership and credentials are defined.
- Do not use destructive Git recovery. Prefer a new commit.
