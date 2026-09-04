---
id: TASK-0006
title: Rename local checkout directory to pi-decompression
status: todo
depends_on: []
priority: normal
tags: [repository, local, operations]
---

# Rename local checkout directory to pi-decompression

## Problem
Package and product are named pi-decompression, but local checkout remains /Users/cristianoliveira/other/pi-compactor, which creates path ambiguity in shell output, reports, and future sessions.

## Desired outcome
Future shells and Pi sessions use `/Users/cristianoliveira/other/pi-decompression` as only local checkout path while preserving Git history, branch, hooks, ignored local state, and build behavior.

## Acceptance criteria
- [ ] Destination `/Users/cristianoliveira/other/pi-decompression` is confirmed absent or safely reconciled before move.
- [ ] Tracked files contain no active absolute reference to old checkout path; historical reports/session records are not rewritten.
- [ ] All Pi/crew/watcher/editor/shell processes using old checkout are stopped before directory move.
- [ ] Parent-level move renames directory atomically without copying, deleting, recloning, or creating compatibility symlink.
- [ ] New path is Git worktree root on `main` with same HEAD and clean tracked state.
- [ ] Git hooks remain configured and executable.
- [ ] `npm ci` is not rerun solely for path rename; existing dependencies remain usable.
- [ ] From new path, `make check`, `make architecture`, and `make pack-check` pass.
- [ ] New Pi process loads extension from new path and exposes `/decompress` and `/break`.
- [ ] Old directory path no longer exists after successful verification.
- [ ] No remote is created or modified; checkout currently has no Git remote.

## Constraints
- Do not move directory while this Pi session or any crew member still uses old cwd.
- Final move must be last operation of active old-path sessions; resume verification in fresh process from new path.
- Preserve ignored `.pi`, `.tmp`, node_modules, coverage, and other local contents as-is; do not commit them.
- Do not rewrite historical Git commits, Pi sessions, or external reports containing old path.
- Use bounded commands and fail before mutation if destination exists unexpectedly.

## Non-goals
- Creating or renaming GitHub repository.
- Adding Git remote.
- Renaming npm package, commands, config, or source symbols; already completed.
- Cleaning deprecated ignored local config/cache artifacts.

## Operational handoff
1. Audit destination and tracked old-path references while sessions are active.
2. Commit audit/preparation evidence if repository files change.
3. Stop every old-path Pi/crew process.
4. From parent directory, run guarded move.
5. Start fresh Pi session from new path and complete verification.

## Completion rule
Task cannot move to done from session whose cwd is old path. Close it only from fresh process rooted at new path.

