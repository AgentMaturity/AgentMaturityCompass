# Runbook: Postgres session store failover drill

P2-09d. Status: **pending — needs Sid.** No run has been recorded. The in-tree tests drive the Postgres store against a SQLite-backed fake driver (`tests/fixtures/fake-pg`) through the real worker bridge; they cannot show how a real Postgres behaves during a failover. This drill does, once, on the HA setup Sid chooses. Background: [EVIDENCE_STORAGE.md](../EVIDENCE_STORAGE.md), ADR 018 decision 5.

## 1. What you need

- A Postgres HA setup: CloudNativePG, Patroni, or a managed service with automatic failover. Use synchronous replication if a committed append must survive the primary's loss.
- A role for AMC that authenticates with SCRAM-SHA-256 (`password_encryption = scram-sha-256`, `pg_hba.conf` method `scram-sha-256` over `hostssl`), and the server's CA certificate.
- A database (or schema) for the drill only. The drill writes throwaway chains.
- A checkout of the commit under test, built: `npm run build`, then `npm install --no-save pg`.

## 2. Configure

```bash
printf '%s\n' 'postgres://amc_drill:<password>@<rw-service-host>/amc_drill?sslmode=verify-full&sslrootcert=/path/ca.pem' > ~/.amc-pg-drill-url
chmod 600 ~/.amc-pg-drill-url
export AMC_POSTGRES_URL_FILE=~/.amc-pg-drill-url
```

Point the URL at the read-write service (CloudNativePG `<cluster>-rw`, Patroni's HAProxy or VIP, or the managed endpoint), so a promoted primary is reached at the same host.

## 3. Run

```bash
node scripts/drills/postgres-failover-drill.mjs --seconds 180 \
  --out qualification/<date>-P2-09d/postgres-failover.json
```

While it runs (after about 30 seconds), fail over the primary:

- CloudNativePG: `kubectl cnpg promote <cluster> <replica>` or delete the primary pod.
- Patroni: `patronictl failover` or stop the primary node.
- Managed: the provider's "failover" or "reboot with failover" action.

## 4. Read the receipt

The drill exits 0 only when every check passes:

- `conformance` and `determinism`: the shared session-store suite and the SQLite/Postgres hash comparison pass against this server;
- `chainVerifies`: the chain read back after failover verifies (hashes, links, signatures, session envelopes);
- `noDuplicateIds` and `everyAcknowledgedAppendPresent`: retries with the same id did not duplicate a row, and no acknowledged append was lost;
- `noUnexpectedErrors`: every failure during the failover was `POSTGRES_UNAVAILABLE` (fail closed), nothing else.

Also record `unavailableWindowMs` (how long appends were refused) and `latencyMs.p95` against the 50 ms local-authorization budget. A p95 over budget is a finding to record, not a failed drill.

## 5. Record

Commit the receipt under `qualification/<date>-P2-09d/` with a README naming the HA platform, its version, the replication mode and how the failover was triggered. Then update the P2-09 issue: acceptance criterion "failover tests pass in CI, and a failover receipt is recorded". A CI job with a Postgres service is a separate follow-up; it needs `pg` added as a dev dependency, which this item did not do.
