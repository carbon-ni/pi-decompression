---
id: TASK-0012
title: Keep valid tool-call boundaries after decompression
status: doing
depends_on: []
priority: high
tags: []
---

# Keep valid tool-call boundaries after decompression

## Problem
Custom compaction can keep the newest branch entry even when it is a tool result. Pi then sends an orphan function-call output after compaction, and the provider rejects continuation with 'No tool call found for function call output'.

## Observed failure

```text
Error: No tool call found for function call output with call_id call_...
```

Pi compaction documentation states that valid cut points never begin at tool results because results must stay with their tool call. The extension currently overrides Pi's prepared safe boundary with the final branch entry.

## Desired outcome
Post-compaction context never contains a tool result without its matching assistant tool call. Synthetic continuation proceeds normally after a turn containing tool execution.

## Acceptance criteria
- [ ] Add a failing regression that represents a trailing assistant tool call plus tool result at compaction.
- [ ] Compaction uses a Pi-valid kept boundary and never selects an arbitrary trailing tool-result entry.
- [ ] Full runtime proof exercises tool execution before decompression and reaches a unique resumed marker without provider transcript errors.
- [ ] Existing handoff pointer, exact-once continuation, queued-user ordering, and loop prevention remain intact.
- [ ] Empty/minimal branches fall back safely without inventing entry IDs.
- [ ] Tests cover happy and failure/boundary paths before production change.
- [ ] README explains that Pi's safe retained boundary preserves tool-call pairing.
- [ ] Watcher and release gates pass at 100% configured coverage.

## Constraints
- Follow Pi's documented compaction cut-point contract.
- Do not sanitize or silently delete tool results independently of their calls.
- Keep domain policy pure and Pi entry inspection in infrastructure.

