# Domain guidance

`src/domain` owns decompression policy without runtime dependencies. Keep this module pure: no Pi API, filesystem, model, process, network, or other external imports. Pass all inputs in and return typed values.

Current responsibilities include:

- parsing `/decompress` and `/break` arguments;
- validating persisted decompression state;
- deciding when usage reaches a configured threshold;
- formatting status text;
- building handoff paths, prompts, pointer summaries, and compaction results.

Keep policy deterministic and easy to exercise with direct unit tests. Preserve the boundary between policy and side effects: persistence and model calls belong in `src/infra`. Update `decompression-policy.test.ts` for both accepted and rejected inputs, including boundary values.

Run `make architecture` when changing imports and `make test` (or the normal `make check`) before handoff.
