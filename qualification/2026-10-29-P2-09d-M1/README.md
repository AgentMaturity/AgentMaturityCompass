# P2-09d-M1: `migrate --to postgres` is all or nothing

Base 331f311d6, branch rtd/w7-pg-migrate.

## Regression tests (red on base, green on the fix)
tests/postgresSessionEventStore.test.ts ("amc evidence-stores migrate --to postgres") and tests/a4PostgresMirror.test.ts:
- a copy that does not read back as written rolls back whole (with and without a recorded chain id): `.amc` bytes unchanged, no copied rows, chain rows unchanged, retry after the fault is fixed succeeds. On base: `.amc` gained `postgres-store.json`, 3 copied rows stayed.
- a mirror log that does not verify refuses inside the copy's transaction. On base: `.amc` gained the chain id and both signed heads, and the retry refused as a merge.
- a local write that fails after COMMIT (signed head path is a directory) leaves a state the next run finishes: fresh id, recorded id (resume), and SQLite written in between. On base: every retry refused with "never merges chains".
- refused merge and rewound-head resume leave `.amc` and the chain unchanged (guards; these pass on base).
`.amc` snapshots exclude `evidence.sqlite-shm` (SQLite's shared-memory index, which readers rewrite).

## Mutation checks
mutation-checks.txt (script mutate.py): 9 guards, all killed. An earlier run also killed the pinned determinism ids: every retry failed with "event id … is already used by another chain".

## Checks
build, typecheck, typecheck:tests, lint, check:gates, check:dead-code, check:duplicates, check:counts, check:api-ref and check:docs-drift all pass (logs in this directory).
tests.log: 4 files / 66 tests. tests-mirror-consumers.log: 105 files / 1260 tests.
check-freeze.log fails only on freeze-exception keys from changesets already on the held line (P2-09d, P2-30, P3-14, …). This change adds no CLI command and no freeze exception, so the integrator needs to land nothing for it.

## Pending (Sid)
Live Postgres drill: docs/runbooks/POSTGRES_FAILOVER.md. Run a refused migration (for example a trigger that alters a copied row) against a real server, check that ROLLBACK leaves the chain empty, then rerun.
