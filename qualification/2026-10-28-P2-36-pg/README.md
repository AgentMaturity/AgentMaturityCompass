# P2-36: A4 on the Postgres ledger backend, and A4 side tables in WORM

Branch `rtd/w4-a4-pg`, base `e95619acb`. Recorded 2026-10-28. No real Postgres server was used: every Postgres test drives the SQLite-backed `pg` fake (`tests/fixtures/fake-pg`) through the real worker bridge. The real-Postgres drill is section 4b of `docs/runbooks/POSTGRES_FAILOVER.md`, and it is still pending for Sid.

## Design choice

The design is write-through with fail-closed commit ordering. The alternative was to mirror each row after the SQLite commit.

- SQLite stays the store that A4 and the action journal verify and read. Each of their write transactions calls `LedgerMirror.write()` as its last step, still inside the SQLite transaction. That call does three things in one Postgres transaction: it upserts the rows of the one scope the write touched (the A4 project or the action execution), it appends a hash-chained `amc_ledger_mirror_log` entry holding the scope's digest, and it commits. SQLite commits only after that. A Postgres write that cannot commit throws, and the SQLite transaction rolls back. As a result, no A4 or journal transition can exist that the mirror lacks.
- Mirroring after the commit was rejected because a mirror that trails SQLite can lose a committed transition on failover. That conflicts with the brief's rule that integrity and failing closed come before convenience. The cost is that each write holds the SQLite write lock for a few Postgres round trips, and that writes are refused while Postgres is unreachable.
- If the reply to a COMMIT is lost, the write reads back the log entry it wrote. It counts as committed only if that entry is present.
- Parity is checked against a signed head, following `postgresHead.ts`. After each commit the monitor key signs the log head into `.amc/postgres-ledger-mirror-head.json`. The checks run before every write, in project snapshot reads, in `verifyA4Chain` with `{ mirror: true }` (used by `amc a4 verify`, `amc verify`, the router's verify endpoint and readiness integrity), and in migration:
  - The scope's Postgres rows must hash to the last digest logged for that scope. A mismatch means the rows were changed outside AMC.
  - The logged digest must equal the digest of the SQLite rows. A mismatch is divergence.
  - Postgres may not hold a row that SQLite lacks, and its append-only rows must match SQLite's.
  - The log must still hold the signed head. If it does not, the log was truncated or rewound.
  - Verification also re-hashes the whole log.
- Failures are refused with two codes. `LEDGER_MIRROR_DIVERGED` refuses both the write and the read. `LEDGER_MIRROR_UNAVAILABLE` refuses writes and fails verification, but reads still work, because the rows read verify on their own signed chain. `LEDGER_MIRROR_BEHIND` covers a scope Postgres never held: verification fails, reads still work, and the scope's next write copies it whole.
- The mirror never deletes rows and never repairs them. Liveness columns (`heartbeat_ts`) and `a4_requests` are copied but not compared.

## Status of each brief item

1. **Done.** The `a4_*` and `action_*` rows are carried into Postgres. All 14 tables are declared as `POSTGRES_MIRROR_TABLES` entries (`postgresLedgerSideTables.ts`), and a test pins each column list and key to the ledger schema.
2. **Done.** A WORM export carries a ledger side-table segment: a deterministic snapshot plus a manifest, both named by the signed index. `worm-verify` checks it table by table, and it reports an export made before this change as "does not cover A4".
3. **Done.** `LEDGER_BACKEND_INCOMPLETE` is now raised only for an `a4_*` or `action_*` table that the ledger holds and the mirror does not declare. The gap is empty today.
4. **Done.** `migrate --to postgres` copies the side tables in the same transaction and writes one mirror-log entry per scope. It then compares every side row with SQLite column by column, checks every scope's parity and walks the log.
5. **Done.** The docs are updated: `docs/EVIDENCE_STORAGE.md`, `docs/A4_FORGE.md`, and `docs/runbooks/POSTGRES_FAILOVER.md` §4b (the pending A4 drill steps).

## What remains

- The real-Postgres drill. It is pending for Sid.
- A restore command that loads the WORM side-table snapshot. None exists for WORM ledger segments either; the snapshot is column-exact, so a restore can insert its rows as they are.
- The mutation that would weaken the migration's row comparison is not killed. The fake driver cannot make a copy differ from its source.
- A4's audit rows stay in `evidence.sqlite`, as every direct ledger producer's rows do. WORM segments carry them.

## Evidence

- `checks.txt`: build, typecheck, typecheck:tests, lint, check:gates, check:dead-code, check:duplicates, check:counts, check:api-ref, check:docs-drift and check:schemas. All exited 0.
- `related-tests.txt`: 35 files and 596 tests passed. The files are every test that imports a changed module (listed in `related-test-selection.txt`), plus `tests/a4/*`, `tests/actions/*`, `tests/a4*.test.ts` and `tests/wormSideTables.test.ts`.
- `mutation.txt`: 13 guards were each disabled in turn, and all 13 mutations were killed by the new tests.
