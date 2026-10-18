# P1-33 receipt: pack admission criteria v1 as a checker

Environment: local macOS 26.6.2 arm64 (Darwin 25.6.0), Node v22.23.3, pnpm 10.33.0. Not CI. Branch
`rtd/p1-33-catalog-reverify` at `f7119b39e` (int `6c317596e` merged in); the mutations ran at `c8a2cc119`, before that merge,
which left the admission and governance code unchanged. `receipt.json` lists every command with its exit
code and duration.

Nothing here is a review or a promotion. Every catalog pack and control is still `experimental`; D-08 has named no
expert, so no review record can count and no pack can be admitted as reviewed.

## The Layer 0 admission report

`amc.l0.baseline-0.1.0.json` is the committed report `catalog/admission/amc.l0.baseline-0.1.0.json`, written by
`amc catalog check --write` at `checkedAt` 2026-10-18T10:41:59Z.

- Report digest: `sha256:b5b2470c860279e55bd9e450494ebf8688fe0882505b8d5ca768bf3da4573590`
- Pack digest: `sha256:5fbce9ef6ae025335d9c3d59eeda437454ec7cc4fad29afb74bbcf839d11debc`
- Declared `experimental`; decision `admit` (as experimental only); `maxAdmissibleSupport` `experimental`.
- Criteria: 4 met; 1, 2, 3, 5, 7, 8, 9 and 10 not met; 6 not evaluated. Criteria 2 (32 citations unverified, no legal
  review), 9 (no pack sign-offs, no control review stands) and 10 (no partner, update plan, triage target or coverage
  document) are not met, as the spec expects. Criterion 1 fails on `compilerCompat ^0.1.0`, which the running compiler
  (1.2.0) does not satisfy.
- Fixture run: 343 evidence fixtures ran through `evaluateControl`, 0 failures, 0 false mandatory passes. The 83 guard
  fixtures need harnesses that live in the test suite, so criterion 6 is not evaluated here, never met.

## What was checked

- TDD: `tests/catalog/admission/checker.test.ts` failed first (the module did not exist: "Cannot find module
  '../../../src/catalog/admission/index.js'"), then passed: 30 tests.
- `focused-tests.json`: the catalog suites and the suites around the changed modules, 808 tests, all passed. The full
  suite was not run here.
- `mutations.json`: 29 mutations, one per guard, each killed. They include the two the spec names: skipping the
  false-pass count (killed by the passing-negative and guard-harness tests) and dropping the agent-signer refusal (killed
  by the agent sign-off test).
- `check:freeze -- --base-ref int` exits 1 only because `P1-33` is not yet in int's `allowedExceptionKeys`: a branch
  cannot authorize itself. Commit `710840d09` adds the key alone; merged into int first, the guard passes, as
  `check:freeze -- --base-ref 710840d09` shows (exit 0).
- `check:catalog-currency`, `check:catalog-changelog` (against int and origin/main) and `check:catalog-admission` pass with
  the committed admission reports: reports sit outside every catalog digest.

## Not evaluated

- No real review record, roster or pinned reviewer key exists, so the record criteria ran only against fixture keys in a
  temporary AMC home.
- Guard harnesses are not registered outside the test suite.
