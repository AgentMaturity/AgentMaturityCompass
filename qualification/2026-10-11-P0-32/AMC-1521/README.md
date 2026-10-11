# AMC-1521 · Test TypeScript gate in CI and the release gate: Done

- **Commits on main:**
  - `f6c48535` and `d1f2ee84`
  - `c49b3ef3`, the step-id assertion, cherry-picked from `b0c523bd`
  - All three are ancestors of origin/main `5ea5e866a` and of the base `60d0255c4`.
- **Focused tests at `60d0255c4`:** `tests/releaseGateExecution.test.ts` 22/22 and `tests/reconciliationDefectsReleaseGate.test.ts` 3/3, so 25 passed, 0 failed.
- **Remaining item from P0-32 (the step-id assertion on main):** done.
  - The spec expected it from P0-13 or P0-33. It is already on main as `c49b3ef3`.
  - It pins the `typecheck-tests` step by id before `build` in `scripts/release-gate.mjs`.
  - It also pins the "Typecheck tests" step in `ci.yml` and `npm-publish.yml`.

## Evidence

- **Quick release gate at `60d0255c4`:** step `typecheck-tests` passed (`../release-gate-quick.json`).
- **Hosted CI:** run 38132701944 ran on main `5ea5e866a`, and its `build-test (22)` step "Typecheck tests" concluded success (`../AMC-1509/hosted-clean-source.json`).
- **Mutations:** P0-30 recorded 4 of 4 AMC-1521 guard mutations killed (`../../2026-10-11-P0-30/outcomes.json`).

## September record

The candidate holds no reconciliation record for AMC-1521. Sid's untracked copy was not read.

## Residual risk

None open.
