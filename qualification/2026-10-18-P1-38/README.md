# P1-38 qualification: pinned pi-ai routes and the capability matrix

Local run on macOS arm64 (darwin 25.6.0), Node 22.23.3, pnpm 10.33.0. Not CI. No provider was contacted and no
credential was used: every model reply came from a local fixture server on 127.0.0.1. The npm registry was used to
install `@earendil-works/pi-ai@1.3.0` and its tree, and by `audit:runtime` and `check:packed-install`.

## Files

- `receipt.json`: commit, environment, commands with exit codes and durations, focused test totals, artifact hashes.
- `checks.json`: every command with its exit code, duration and the last lines of its output.
- `mutations.json`: three guards broken on purpose, the tests that failed, and the restore.
- `capability-results-native.json`, `capability-results-pi-ai.json`: the results the contract tests recorded,
  from which `docs/providers/CAPABILITY_MATRIX.{json,md}` was generated. Regenerating after the merge with `int`
  produced no diff.

## What was shown

- The bytes the fixture server received equal the bytes whose digest the signed `request/header` holds, for every
  native HTTP route and every pi route (`tests/nativeCapabilityContract.test.ts`, `tests/piAi/piAiAdapterContract.test.ts`).
- pi-ai's own send path, given an injected `fetch`, transmits the same bytes AMC's encoder records (ADR-016).
- Unproven features (images) and failed tool results are refused before a header exists; missing usage is recorded
  as unreported; a pi session verifies with its requests `reconstructed`, is `unreconstructable` without the pinned
  library, and fails with `digest-mismatch` after one source byte is edited (`tests/piAi/piAiDerivation.test.ts`).
- `amc agent-loop run --provider pi-ai:groq` runs a verified turn end to end (`tests/piAi/piAiCli.test.ts`).

## Not run

- Live provider runs (Groq, Hugging Face, Together): need Sid's keys. Every matrix cell says "Live provider: not run".
- The full `npm test` suite. The focused run covered the new tests and the 56 existing test files that import the
  changed modules: 995 tests, 994 passed, 1 failed. The failure,
  `tests/nativeValidationOutcomeSurfaces.test.ts` "Darwin 'SDK' public validation reports 'success'…", reported the
  macOS sandbox as `execution-denied` under the parallel load. That file then passed alone (13 of 13).
- Whether npm skips the optional peer in the packed install was not checked separately; `check:packed-install`
  passed with the native stub route.
