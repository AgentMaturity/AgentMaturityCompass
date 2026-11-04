# AMC-1507 · Pi v3 sessions keep failures, ancestry and unknown timing: Done

- **Commits on main:** `c050244a`, `8defa070`, `1b89a573`, `8baae594`. All four are ancestors of origin/main `5ea5e866a` and of the base `60d0255c4`.
- **Focused tests at `60d0255c4`:** 31 passed, 0 failed.
  - `tests/piSessionImport.test.ts` 11/11
  - `tests/piSessionImportBoundaries.test.ts` 15/15
  - `tests/traceFailureUnknownTime.test.ts` 2/2
  - `tests/traceIngestionTiming.test.ts` 3/3
- **Remaining item from P0-32 (receipt attributable to a merged commit):** done. This receipt names the base commit, which contains all four merged commits, and records the run there.

## Supporting evidence

- **Installed run:** the AMC-1506 run imported a Pi v3 session through the installed RC. It kept both failures, with the summary "Pi v3 session: 4 conversation entries, 0 structural, 2 failure(s)", and wrote a trace failure index with 2 clusters. See `../AMC-1506/installed-import/import-pi.json`.
- **September defect, now fixed:** the reconciliation recorded one low-severity defect, that negative numeric timestamps were accepted. `8baae594` fixed it; `src/importers/piSessionImport.ts:277` now applies the generic mapper's bounds.
- **Related:** P0-31 recorded AMC-1523 (Pi v3 import text) as passing in 4 of 4 installed cells (`../../2026-10-11-P0-31/outcomes.json`).

## September reconciliation

`reconciliation-summary.json` summarises the 2026-09-14 record from candidate `37c1466b` (blob `427995c6…`). Its original is not in main's history.

- It found PARTIAL at `6e7875f2`: 14 claims held. It ran 47 of 47 tests, and 2 mutations were red as expected.
- What it lacked was a tracked receipt, which this receipt now provides.
- It also noted historical full-suite counts that were never committed. Those counts are not used here.

## Residual risk

- The fixtures are synthetic. No session written by a real Pi CLI was imported, and the old acceptance did not ask for one. No owner.
