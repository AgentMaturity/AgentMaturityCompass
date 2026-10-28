# P2-09d qualification receipt: Postgres session store

Branch `rtd/w3-p2-09d` on base `93ccb82b5`, code commit `a3b6e2a92`. Details and commands: `receipt.json`.

## What was run

- `tests/postgresSessionEventStore.test.ts` (23 tests): the shared session-store conformance suite, SQLite/Postgres determinism, fork refusal at the database, two interleaved writers, two workspaces in one database, lost primary (fail closed, resume), lost commit reply (idempotent retry), hung server (timeout, reconnect), read-only open, tampered history, connection policy (sslmode, file mode, missing file, MD5, cleartext, trust, no TLS, driver missing), the mirror-table list, and the migration (copy, parity, signed receipt, re-pin, continue from the SQLite head; refuse merge; refuse unauthenticated SQLite history; `amc verify` reports an unreadable store).
- 85 existing test files that touch the changed modules: 1,362 passed, 0 failed.
- Eight mutation checks, each turning its named test red (listed in `receipt.json`).

## What this does not show

There is no Postgres server here and `pg` is not a dependency. Every test drives `tests/fixtures/fake-pg`, a `pg`-shaped driver over SQLite, through the real worker-thread bridge. It cannot show real Postgres locking, real TLS and SCRAM negotiation, or a real failover.

## Pending (Sid)

Run `docs/runbooks/POSTGRES_FAILOVER.md` once against the chosen HA setup and commit its `postgres-failover.json` here with a README naming the platform, version, replication mode and failover trigger. Not faked.
