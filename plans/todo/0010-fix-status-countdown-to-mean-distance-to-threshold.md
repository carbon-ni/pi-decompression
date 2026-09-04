---
id: TASK-0010
title: Fix status countdown to mean distance to threshold
status: doing
depends_on: []
priority: high
tags: []
---

# Fix status countdown to mean distance to threshold

## Problem
The status currently subtracts usage from total context capacity, but the intended countdown is remaining percentage points before decompression triggers: threshold minus current usage.

## Desired outcome
Footer countdown answers “how much usage remains before decompression?” For 10% usage and 50% threshold, it renders `decompression 40% left/50%`.

## Acceptance criteria
- [ ] Known usage renders `ceil(max(thresholdPercent - contextUsagePercent, 0))` as `% left`.
- [ ] 10% usage at 50% threshold renders `decompression 40% left/50%`.
- [ ] Fractional distance rounds up so display does not show `0% left` before threshold is reached.
- [ ] Usage at or above threshold clamps to `0% left`; negative values never appear.
- [ ] Unknown usage, no-threshold, and disabled states retain existing behavior.
- [ ] Lifecycle refresh and post-compaction stale-usage clearing remain unchanged.
- [ ] Tests are corrected before production logic and cover below, exact, above, fractional, and unknown usage.
- [ ] README defines `left` as distance to configured decompression threshold, not unused total model context.
- [ ] Watcher final gate and release gate pass.

## Constraints
- This corrects TASK-0008 semantics; it does not change threshold triggering or persistence.
- Keep formatting pure and runtime usage ephemeral.

