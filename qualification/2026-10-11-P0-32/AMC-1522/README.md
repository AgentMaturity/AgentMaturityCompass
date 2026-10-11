# AMC-1522 · Origin-addressed compaction: Done

- **Commits on main:** `e7900221` and `609269ed`. Both are ancestors of origin/main `5ea5e866a` and of the base `60d0255c4`.
- **Focused tests at `60d0255c4`:** `tests/surfaceHistoryCompaction.test.ts` 14/14.
- **AMC-1547 guard tests at `60d0255c4`:** 144 passed, 0 failed across 7 files:
  - `sessionSpillCommitment` 15, `spillEncryption` 25, `spillLifecycle` 19, `sessionSpillRead` 11
  - `bundleSpill` 4, `retentionSpill` 5, `cliSpillCommands` 65
- **Remaining item from P0-32 (AMC-1547 qualifies in P0-30):** done.

## Blocker AMC-1547

P0-30 recorded AMC-1547 as follows (`../../2026-10-11-P0-30/outcomes.json`):

- **Result:** 7 of 7 guard mutations killed, 1 equivalent, 0 survived and 0 errors, at `91678253` and `e46bd29d`.
- **Equivalent:** the transport `..` check (`spillLifecycle.ts` `transportDirectory`). The public API cannot reach it, because `parseIndex` pins object files to `objects/<sha256>.blob`.
- **Its outcome line ends:** "AMC-1522 closes in P0-32".
- **Drift:** no commit touches `src/session` between `e46bd29d` and the base `60d0255c4`, so the batch still applies.

## Landing

P0-30's receipt is on `int` (`ee0afc9bc`), not yet on origin/main. This folder sits on top of it, so the note and its evidence reach main in the same merge. The integrator should not cherry-pick this note without it.

## September record

The candidate holds no reconciliation record for AMC-1522. Sid's untracked copy was not read.

## Residual risk

None open for this issue.
