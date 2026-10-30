# AMC-1531 · Standalone native parity umbrella: Done (see the interpretation note)

- **Commit on main:** `d8d65853` (ancestor of origin/main `5ea5e866a` and of the base `60d0255c4`).
- **Focused tests at `60d0255c4`:** 20 passed, 0 failed.
  - `tests/nativeDelegationInheritance.test.ts` 9/9
  - `tests/subagentHookInheritance.test.ts` 11/11
- **Quick release gate at `60d0255c4`:** 16 of 16 executed checks passed (`../release-gate-quick.json`).
  - Quick mode skips packed-install, the full suite, per-file coverage, install-persona QA and live health.
  - Installed acceptance comes from P0-31, not from this gate.
- **Remaining item from P0-32 (AMC-1545 qualifies in P0-31):** done, through P0-31 and its follow-up P0-61.

## Blocker AMC-1545

- **P0-31 (`../../2026-10-11-P0-31/outcomes.json`):**
  - The installed delegated runs passed in all 4 cells: macOS and Linux arm64, Node 22 and 24. `max-turns:1` and `timeout-ms:1500` each stopped the child.
  - The row was still marked failed, because 2 of its 3 guard mutations survived.
- **P0-61** (`f4b4a0380`, tests only):
  - It added the missing limit cases to `tests/subagentHookInheritance.test.ts`.
  - It then killed all 3 `1545-*` mutants, with a green baseline (`../../2026-10-11-P0-56/p0-61-mutations.json`).
- **Drift:** `src/agent/subagentRunner.ts` is unchanged from the RC `756bd697` and from `f4b4a0380` up to the base.

**Interpretation note:** the spec's acceptance criterion says AMC-1531 is Done only if P0-31 recorded AMC-1545 as qualified. P0-31's own row says failed. This note counts P0-61, the follow-up P0-31 opened for that row, as closing it. If Sid reads the criterion strictly, reopen this issue with P0-39's installed re-run as the owner.

## Landing

The P0-31 and P0-56 receipts are on `int`, not yet on origin/main. They reach main in the same merge as this note.

## September record

The candidate holds no reconciliation record for AMC-1531. Sid's untracked copy was not read.

## Residual risks (owners)

- **P0-60 (Sid):** Linux confined-shell cancellation (AMC-1513) stays a recorded exception until the VM's AppArmor userns restriction changes.
- **P2-12:** the AMC-1511 resume guards have 3 surviving mutants.
- **P0-39:** the installed AMC-1545 runs predate P0-58 (JSONL refuses a second writer up front) and P0-59 (the budget-refusal code). The versioned 2.0.0 tarball re-runs them.
