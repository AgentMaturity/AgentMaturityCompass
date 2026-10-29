# P3-19 qualification: procurement contract clauses (draft)

Commit `fe71fdfe5` on `rtd/w6-p3-19` (base `cafe5751f`). `receipt.json` lists every command with its exit code and
duration; `checks.txt` holds the tail of each command's output.

## Result

- `docs/procurement-clauses.json` holds 12 clauses with stable ids (`PC-...`), each with sources dated 2026-10-29, an
  AMC artifact or "not provided by AMC", and status `experimental`. `docs/PROCUREMENT_CLAUSES.md` is generated from
  it; `node scripts/gen-procurement-clauses.mjs --check` exits 0. The page is listed on the docs site
  (`website/docs/docs.js`) and `npm run build:pages` includes it.
- Source re-verification: `SOURCES.md`. Counsel review: pending, `COUNSEL_REVIEW.md`.
- Tests: `tests/procurementClauses.test.ts` 16 passed; with the docs-site, counts and docs-truth test files touching
  the changed surfaces, 15 files and 113 tests passed.
- `check:freeze` exits 1 on this branch and on base `cafe5751f` alike: other items' exception keys are not yet in
  `allowedExceptionKeys`. P3-19 adds no CLI command, so it needs no freeze exception.

## Red and green

Before the change `tests/procurementClauses.test.ts` fails to load (no `scripts/gen-procurement-clauses.mjs`, no
library); after it, 16 of 16 pass.

## Mutation checks (each restored afterwards)

| Mutation in `scripts/gen-procurement-clauses.mjs` | Tests that fail |
| --- | --- |
| M1: drop the "has no sources" check | `negative fixture: a clause without sources fails`; `--check ... an invalid library exits 2` |
| M2: drop the counsel-reviewed reviewer check | `negative fixture: a counsel-reviewed clause without reviewer or date fails` |
| M3: drop the verifiedAt check | `negative fixture: a source without verifiedAt or without url and path fails` |
| M4: stop stripping quotes in the claim-vocabulary clause | `the committed library is valid` and two more |
| M5: drop the url-required rule for regulatory clauses | `negative fixture: a regulatory clause citing only repo paths fails` |
