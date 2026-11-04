# P2-09d qualification receipt: Postgres session store

Branch `rtd/w3-p2-09d` on base `93ccb82b5`, code commit `a3b6e2a92`. Details and commands: `receipt.json`.

## What was run

- `tests/postgresSessionEventStore.test.ts` (23 tests): the shared session-store conformance suite, SQLite/Postgres determinism, fork refusal at the database, two interleaved writers, two workspaces in one database, lost primary (fail closed, resume), lost commit reply (idempotent retry), hung server (timeout, reconnect), read-only open, tampered history, connection policy (sslmode, file mode, missing file, MD5, cleartext, trust, no TLS, driver missing), the mirror-table list, and the migration (copy, parity, signed receipt, re-pin, continue from the SQLite head; refuse merge; refuse unauthenticated SQLite history; `amc verify` reports an unreadable store).
- 85 existing test files that touch the changed modules: 1,362 passed, 0 failed.
- Eight mutation checks, each turning its named test red (listed in `receipt.json`).

## Security review fixes

Three findings, fixed with tests in "security review fixes (P2-09d)": event ids keyed per chain with cross-chain ids refused; verification and writer open check the last row against `amc_chain_heads` and against a head AMC signs into the workspace after each append and migration, with session seals verified; run verification, budgets, native session reads and audit packets read Postgres rows. Red/green and mutations are in `receipt.json` (`securityReview`). Related suites: 123 files, 2,089 passed.

## What this does not show

There is no Postgres server here and `pg` is not a dependency. Every test drives `tests/fixtures/fake-pg`, a `pg`-shaped driver over SQLite, through the real worker-thread bridge. It cannot show real Postgres locking, real TLS and SCRAM negotiation, or a real failover.

## Pending (Sid)

Run `docs/runbooks/POSTGRES_FAILOVER.md` once against the chosen HA setup and commit its `postgres-failover.json` here with a README naming the platform, version, replication mode and failover trigger. Not faked.

## Receipt repaired 2026-10-31

`receipt.json` did not follow `qualification/receipt.schema.json` (37 problems in `npm run check:qualification`). It lacked `pnpm`, `tests`, `artifacts` and `notes`, gave a short commit, listed commands without `durationMs`, and carried fields the schema does not allow (`slice`, `parent`, `postgresServer`, `redGreen`, `mutations`, `pending`, `securityReview` and per-command counts). The receipt now names the full commit `a3b6e2a92ae8b370e698dbd9ae114133e6557f3b` and lists every recorded command with its exit code, the two security-review rows included. `tests` is null because the runs are separate selections at two commits, and `artifacts` is empty because the folder holds no other files. Everything the extra fields recorded (slice, parent, server, counts, mutation checks, pending items and the security review) is kept in `notes`. `date` is now 2026-10-27, the folder's wave-3 date, which the checker requires it to equal; the receipt had recorded 2026-10-28, and its notes say so. pnpm and the command durations were never recorded; they are written as `not recorded` and `durationMs: 0`. The original receipt is in git at `58a328ea8:qualification/2026-10-27-P2-09d/receipt.json`.


## Folder renamed 2026-10-31

This folder was `qualification/2026-10-27-P2-09d/`. `npm run check:qualification` reads a folder name as `<YYYY-MM-DD>-<KEY>`, where a second receipt for the same key and day may add a lowercase variant (`qualification/README.md`). The receipt key is `P2-09`. The old suffix `d` follows the key without a hyphen, so it can never be a variant. The folder now carries the lowercase variant `-d`, the same slice letter. The evidence files are unchanged; git records the move as a rename.
