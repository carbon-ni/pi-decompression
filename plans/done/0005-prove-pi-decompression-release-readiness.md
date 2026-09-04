---
id: TASK-0005
title: Prove pi-decompression release readiness
status: done
depends_on: []
priority: high
tags: [release, package, qa]
---

# Prove pi-decompression release readiness

## Problem
Runtime behavior is verified, but project has not yet proven full release gate, clean-tarball installation, package metadata completeness, and tag workflow readiness as one reproducible release candidate.

## Desired outcome
Produce evidence-backed release verdict for current `0.1.0` candidate. Candidate is ready only if repository gates pass and packed artifact installs/loads in isolation. Any intentional publication blocker is explicit rather than silently removed.

## Acceptance criteria
- [x] `make release-check` passes unchanged, including audit at configured severity.
- [x] `npm ci` is reproducible from exact lockfile in clean isolated checkout or equivalent worktree.
- [x] Package metadata is audited: name, version, description, keywords, engine, peer dependency, `pi.extensions`, file allowlist, `private`, license, repository, and provenance fields.
- [x] Release verdict distinguishes Git/tag/package-install readiness from npm-registry publication readiness; `private: true` is not removed without explicit publication decision.
- [x] `npm pack --dry-run --json` identifies `pi-decompression@0.1.0`, contains required runtime sources/README, and excludes tests, `.pi`, reports, caches, coverage, build output, and credentials.
- [x] Real tarball is created in isolated temp directory, installed with production semantics, and Pi discovers/loads extension from installed package without source-tree fallback.
- [x] Installed artifact exposes `/decompress` and `/break`, not `/compactor`; basic command/status behavior works from packaged copy.
- [x] Tag workflow is checked against package engine, exact action versions, `npm ci`, release gate, timeouts, permissions, and SemVer tag pattern.
- [x] Any missing metadata or workflow defect is fixed with deterministic guard where practical; behavior changes require regression tests.
- [x] Release evidence records commands, artifact contents/size, install/load result, and remaining manual publication steps without secrets.
- [x] Final worktree is clean and no tarball, temporary install, credential, session, or report artifact is committed.

## Constraints
- Read Pi package documentation and validate actual package behavior; do not infer from manifest alone.
- Use isolated directories and bounded timeouts for clean install and Pi load.
- Do not publish, tag, push, rename remote repository, or modify credentials.
- Do not weaken normal/release gates or coverage thresholds.
- Keep dependencies exact and use `npm ci` where lockfile exists.

## Non-goals
- Selecting npm organization/ownership or package visibility.
- Creating release announcement, changelog policy, logo, or screenshots.
- Testing every provider; package-load proof does not require paid model call.
- Changing extension runtime behavior unless verification finds defect.

## Deliverable
- Concise release-readiness report with verdict: ready, ready-for-tag-but-not-publish, or blocked.
- Exact blockers and smallest next manual action.

## Final verdict
- Ready for Git/SemVer tagging and isolated package installation.
- Not ready for npm-registry publication by design: `private: true` remains, and license, repository ownership, and provenance policy require explicit decisions.
- Registry access recovered; unchanged `make release-check` now passes with `found 0 vulnerabilities`.

## Evidence
- Release hardening: `f97e7f2 ci: harden release package checks (TASK-0005)`.
- Isolated `npm ci`, tarball production install, and Pi 0.84.4 packaged-copy load passed.
- Artifact: `pi-decompression@0.1.0`, 12 files, 9,464 bytes packed, 32,168 bytes unpacked.
- Packaged runtime exposes `/decompress` and `/break`, excludes `/compactor`, persists/restores new config, and renders status.
- Final release gate passes: 125 tests, 100% statements/branches/functions/lines coverage, format, architecture, audit, and package checks.
- Ignored Funzzy responder metadata is explicitly excluded from Biome so local runtime state cannot make release formatting nondeterministic (`0bf4d1c`).
- Report: `/Users/cristianoliveira/.agents/reports/04-09-26/TASK-0005-release-readiness.md`.

