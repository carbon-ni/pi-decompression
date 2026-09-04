---
id: TASK-0011
title: Simplify status countdown to remaining percentage
status: done
depends_on: []
priority: normal
tags: []
---

# Simplify status countdown to remaining percentage

## Problem
The footer repeats labels and threshold details when the user only needs the percentage remaining before decompression.

## Desired outcome
When usage is known and a threshold is configured, footer item shows only remaining percentage before decompression, for example `10%`.

## Acceptance criteria
- [x] Known usage renders only `<left>%`; it does not include `decompression`, `left`, slash, or configured threshold.
- [x] Countdown calculation remains `ceil(max(thresholdPercent - contextUsagePercent, 0))`.
- [x] At or above threshold renders `0%`.
- [x] Unknown usage renders `--`.
- [x] Enabled state without threshold retains concise `on:no-threshold`; disabled state clears footer item.
- [x] Tests are changed before production formatter.
- [x] README shows compact footer contract.
- [x] Final watcher and release gates pass.

## Constraints
- Do not change threshold behavior, lifecycle refresh, persistence, or compaction.

