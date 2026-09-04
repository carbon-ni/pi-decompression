# Infrastructure guidance

`src/infra` adapts external boundaries and coordinates the decompression lifecycle. Keep business decisions in `src/domain`; keep Pi, model, filesystem, process, and environment access here.

- `decompression.ts` is the application coordinator. It handles command state, trusted-project persistence, usage thresholds, turn-boundary aborts, compaction callbacks/events, handoff generation, and one-time resumption.
- `decompression-config.ts` owns `.pi/decompression.json` path resolution and JSON I/O. Treat missing, malformed, invalid, or untrusted configuration as unavailable rather than letting it break startup.
- `handoff-store.ts` owns immutable files under `<reports>/handoffs/<date>/`. Never overwrite a stamped handoff; resolve collisions with numeric suffixes and read the newest handoff for the current session.

Keep filesystem, clock, UUID, model, and resume operations injectable where tests need deterministic behavior. Pi lifecycle handlers must tolerate duplicate/racing events, failed compaction, queued messages, and disabled state without synthesizing unwanted work. Preserve the installed Pi event shapes locally when the dependency does not export a type.

Tests are colocated: update the relevant `*.test.ts` for happy and failure paths. Use `make test` for focused feedback, then `make check`; run `make architecture` if dependency boundaries change.
