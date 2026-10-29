# Crash recovery for the reference deployment

Start with [docs/runbooks/amc-service-down.md](../../runbooks/amc-service-down.md) when Studio stops answering; use [docs/runbooks/evidence-corruption.md](../../runbooks/evidence-corruption.md) when verification fails afterwards.

1. Pod killed mid-action: after `kubectl delete pod --force`, a consequential action must end `completed` or `outcome_unknown` and is never dispatched again; check the fixture's system of record for a duplicate effect. (check CR-1)
2. Node drain: `kubectl cordon <node>` then `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data`. With the default `podDisruptionBudget.maxUnavailable: 1` the drain evicts Studio (an outage). The volume is `ReadWriteOnce`, so the pod can only start on a node that can attach it; on a single node, uncordon it and wait for Ready. With `minAvailable: 1` the drain blocks until you scale to 0 or delete the pod yourself. (check CR-2)
3. Disk full: protected effects must be denied with a reason, and the ledger must verify once space is freed. Watch `amc_db_size_bytes`. (check CR-3)
4. KeyProvider outage: see [KEY_PROVIDER_OUTAGE.md](KEY_PROVIDER_OUTAGE.md). (check CR-4)
5. Database failover: only in the Postgres HA option, which the reference topology does not use. Appends must fail closed with no chain fork, and the RTO is recorded. (check CR-5)
6. Telemetry outage: stopping the scraper or OTLP endpoint must not stop execution; mandatory evidence still persists and dropped telemetry is reported. (check CR-6)
