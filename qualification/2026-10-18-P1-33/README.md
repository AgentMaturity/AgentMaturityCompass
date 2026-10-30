# P1-33 receipt: pack admission criteria v1 as a checker

Environment: local macOS 26.6.2 arm64 (Darwin 25.6.0), Node v22.23.3, pnpm 10.33.0. Not CI. Branch
`rtd/p1-33-catalog-reverify` at `c93ba2c3b`, int `577aa7970` (with the P1-33 freeze key) merged in, after the
independent review's fixes. `receipt.json` lists every command with its exit code and duration.

Nothing here is a review or a promotion. Every catalog pack and control is still `experimental`; D-08 has named no
expert, so no review record can count and no pack can be admitted as reviewed.

## The Layer 0 admission report

`amc.l0.baseline-0.1.0.json` is the committed report `catalog/admission/amc.l0.baseline-0.1.0.json`, written by
`amc catalog check --write` at `checkedAt` 2026-10-18T11:52:19Z.

- Report digest: `sha256:c7ed082e754d60b5bbcf9c9163aa3bc2da7d0bf408962c4cb3f4a4ff9183ba3d`
- Pack digest: `sha256:5fbce9ef6ae025335d9c3d59eeda437454ec7cc4fad29afb74bbcf839d11debc`
- Declared `experimental`; `decision` `admit` (the spec's field) with `support` `experimental`: experimental,
  unreviewed, not admitted as reviewed or qualified. `maxAdmissibleSupport` `experimental`.
- Criteria: 4 met; 1, 2, 3, 5, 7, 8, 9 and 10 not met; 6 not evaluated. Criteria 2 (32 citations unverified, no legal
  review), 9 (no pack sign-offs, no control review stands) and 10 (no partner, update plan, triage target or coverage
  document) are not met, as the spec expects. Criterion 1 fails on `compilerCompat ^0.1.0`, which the running compiler
  (1.2.0) does not satisfy.
- Fixture run: 343 evidence fixtures ran through `evaluateControl`, 0 failures, 0 false mandatory passes. The 83 guard
  fixtures need harnesses that live in the test suite, so criterion 6 is not evaluated here, never met.

## The review's findings

- R1 (forged committed report) and R3 (a report outliving its trust): `loadAdmittedCatalog` now recomputes admission
  and ignores and flags a differing report (`ADM_REPORT_MISMATCH`); `check:catalog-admission` fails one that claims more.
- R2 (vacuous admission): every listed control is checked, a criterion with nothing to check is not evaluated, and a
  pack with no mandatory control is never admitted as reviewed.
- `review-repros.txt`: the reviewer's repro file, rerun with its gated loads pointed at `loadAdmittedCatalog` and its
  expectations flipped; R1, R2 and R3 now refuse, and R6 shows the shipped lock is identical gated and ungated.
- Wording: "experimental, unreviewed: not admitted as reviewed or qualified", and `support` next to `decision`.
- The OSCAL export and A4 Adapt (`src/a4/adaptPolicy.ts` lines 18, 53, 144; `src/a4/stages/adapt.ts` lines 15, 158,
  482; approved by the A4 owner) load through the same gate; `gatedLoads.test.ts` shows the CLI plan, A4 Understand's
  plan and A4's shipped lock agree for a downgraded pack, and that the shipped lock equals the activated plan's.

## What was checked

- TDD: the new tests failed first (the gate module did not exist); the review repros failed open before the fixes
  (the reviewer's `repro.log`).
- `focused-tests.json`: the catalog suites (`tests/catalog/**`), the P1-46 goldens (`compilerStationDefaults`), the
  A4-adjacent and compliance suites, 828 tests: 827 passed, 1 failed. The failure is
  `tests/compliance/evidenceBinding.test.ts` "every source literal in src is classified", on the `signed-tools-yaml` and
  `defaults` literals P1-10F added to `src/catalog/catalogCli.ts`; int has the same literals and the same test. It is not
  this branch's change. The full suite was not run here.
- `mutations.json`: 38 mutations, one per guard, each killed: the two the spec names (the false-pass count, the
  agent-signer refusal), and one or more per review fix (the gate's recomputation, its mismatch flag, the check's
  claims-more error, the no-mandatory rule, the zero-subject rule, member controls, the wording, the support field, the
  OSCAL export, A4 Adapt and the CLI compile on the gate).
- Every check in `receipt.json` exits 0, `check:freeze -- --base-ref int` included now that int carries the key.

## Not evaluated, and follow-ups

- No real review record, roster or pinned reviewer key exists, so the record criteria ran only against fixture keys in a
  temporary AMC home.
- Guard harnesses are not registered outside the test suite.
- Criterion 1 compares two loads and the lock built from them; without a committed `catalog.lock.json` it cannot fail on
  a deterministic loader. Follow-up: commit a catalog lock, or drop the lock comparison from the criterion.
- The agent-signer refusal rests on the declared identity kind; a pinned, rostered agent key declaring `human` passes it
  (ADMISSION.md, GOVERNANCE.md).
- A4's `shippedLockDigest` is memoized per process, so a change to the operator's trust takes effect in Studio at restart.
