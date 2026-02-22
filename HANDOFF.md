# FIX-1 Handoff

## Summary of fixes

### 1) Correction verification path repaired for append-only ledger
- Updated `src/corrections/correctionStore.ts` to stop deleting/reinserting rows in `updateCorrectionVerification`.
- Added append-only shadow table `corrections_verification` with immutable triggers:
  - `protect_corrections_verification_immutable`
  - `no_delete_corrections_verification`
- `updateCorrectionVerification(...)` now appends verification events to `corrections_verification`.
- All correction read APIs now overlay latest verification state from the shadow table:
  - `getCorrectionsByAgent`
  - `getCorrectionsByQuestion`
  - `getPendingCorrections`
  - `getCorrectionById`
  - `getVerifiedCorrections`
  - `getCorrectionsByTriggerType`
  - `getCorrectionsByWindow`
- `getLastCorrectionHash(...)` now resolves latest hash across both base correction rows and verification shadow events.

Lifecycle result: correction flow now works as append-only create -> verify -> confirmed state readout (without UPDATE/DELETE on immutable corrections rows).

### 2) Claim stale-sweep repaired for append-only ledger
- Updated `src/claims/claimExpiry.ts` to remove forbidden `UPDATE claims SET lifecycle_state ...`.
- `sweepStaleClaims(...)` now:
  - appends a transition to `EXPIRED` in `claim_transitions`
  - appends a new `claims` row with `lifecycle_state = EXPIRED` and lineage link (`promoted_from_claim_id = original claim_id`)
- Added duplicate-expiry protection: if an `EXPIRED` transition already exists for a claim, sweep skips it.
- Updated stale detection to treat `EXPIRED` as terminal (`isClaimStale`).

### 3) Type/model alignment for EXPIRED state
- Added `EXPIRED` to `ClaimLifecycleState` in `src/claims/claimTypes.ts`.
- Updated typed state maps for compatibility:
  - `src/claims/claimLifecycle.ts`
  - `src/claims/promotionGate.ts`
  - `src/claims/governanceLineage.ts`

### 4) Regression tests added
- Added `tests/appendOnlyLifecycleFixes.test.ts` covering:
  - correction verification append-only behavior with immutable triggers
  - stale claim sweep append-only expiry behavior (`EXPIRED` record insertion, no in-place updates, idempotent re-sweep behavior)

## Verification run
- Executed required command:
  - `npm test -- --reporter=verbose 2>&1 | tail -30`
- Result in this sandbox: suite does not fully pass due existing environment/socket restrictions (`listen EPERM: operation not permitted 127.0.0.1`) in integration tests (e.g., `tests/enterpriseSsoScim.test.ts`).
- New targeted regression suite passes:
  - `tests/appendOnlyLifecycleFixes.test.ts` -> 2/2 tests passing.

## Remaining issues
- Full-suite failures are dominated by existing network bind restrictions in this environment, not by these lifecycle changes.
- Unrelated workspace drift observed during test/install steps (outside the fix scope):
  - deleted `.amc/guard_events.sqlite`
  - modified `package-lock.json`
