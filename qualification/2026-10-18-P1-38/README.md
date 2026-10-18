# P1-38 qualification: pinned pi-ai routes and the capability matrix

Local run on macOS arm64 (darwin 25.6.0), Node 22.23.3, pnpm 10.33.0. Not CI. No provider was contacted and no
credential was used: every model reply came from a local fixture server on 127.0.0.1. The npm registry was used to
install `@earendil-works/pi-ai@1.3.0` and its tree, and by `audit:runtime` and `check:packed-install`.

## Files

- `receipt.json`: commit, environment, commands with exit codes and durations, focused test totals, artifact hashes.
- `checks.json`: every command with its exit code, duration and the last lines of its output.
- `mutations.json`: five guards broken on purpose, the tests that failed, and the restore.
- `capability-claims-native.json`, `capability-claims-pi-ai.json`: the features each contract test claims, written
  at collection time; `capability-contract-report.json`: the vitest JSON report of the run that
  `npm run -s check:capability-matrix` made. The matrix counts a claim only when this report says its test passed.

## What was shown

- `pnpm install --frozen-lockfile` with pi-ai as an explicit devDependency: two consecutive frozen installs left
  `pnpm-lock.yaml` byte-identical (sha256 648ed237…), and the check run's frozen install exited 0.
- The bytes the fixture server received equal the bytes whose digest the signed `request/header` holds, for every
  native HTTP route and every pi route (`tests/nativeCapabilityContract.test.ts`, `tests/piAi/piAiAdapterContract.test.ts`).
- pi-ai's own send path, given an injected `fetch`, transmits the same bytes AMC's encoder records (ADR-016).
- Unproven features (images) and failed tool results are refused before a header exists; missing usage is recorded
  as unreported; a pi session verifies with its requests `reconstructed`, is `unreconstructable` without the pinned
  library, and fails with `digest-mismatch` after one source byte is edited (`tests/piAi/piAiDerivation.test.ts`).
- `amc agent-loop run --provider pi-ai:groq` runs a verified turn end to end (`tests/piAi/piAiCli.test.ts`).
- A matrix cell whose contract test fails turns unknown, and `check:capability-matrix` exits 1 citing it (mutations).

## Not run

- Live provider runs (Groq, Hugging Face, Together): need Sid's keys. Every matrix cell says "Live provider: not run".
- The full `npm test` suite. The focused run covered the new tests and the 56 existing test files that import the
  changed modules: 996 tests, 992 passed, 4 failed. All 4 were hook or test timeouts under load in
  `tests/cliDelegateFlag.test.ts`, `tests/nativeShellComposition.test.ts` and `tests/nativeValidationOutcomeSurfaces.test.ts`;
  those three files then passed alone (65 of 65).
- Whether npm skips the optional peer in the packed install was not checked separately; `check:packed-install`
  passed with the native stub route.
