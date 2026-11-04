# Roll back the reference deployment

1. Without a schema change: `helm rollback amc-rd <revision> --wait`. Run the governed turn again; the chain before the rollback must remain a prefix of the chain after it, so receipts issued earlier still bind events that exist unchanged. (check RB-1)
2. Across a migration: an older AMC refuses a ledger a newer AMC migrated (`ledger schema version <n> is newer than this AMC; restore the pre-upgrade backup or upgrade AMC`, the P2-09 downgrade guard). The pod does not become Ready. (check RB-2)
3. To go back anyway, restore the pre-upgrade backup taken in [UPGRADE.md](UPGRADE.md) step 2 (check RB-2):
    1. `kubectl scale deploy/<fullname> --replicas=0` and wait for the pod to go.
    2. Start a tool pod on the same volume with the older image and the `amc-bootstrap` Secret.
    3. `amc backup restore <file> --to /data/amc/.restore --pubkey <auditor.pub>` (a fresh directory, never `--force` over the live workspace, so stale SQLite WAL files cannot meet the restored database).
    4. Replace `/data/amc/.amc` with `/data/amc/.restore/.amc`, delete the tool pod and scale back to 1.
4. Confirm `PRAGMA integrity_check` returns `ok`, the chain equals the pre-upgrade chain, and a governed turn passes. (check RB-2)

The container-level drill (`scripts/deploy/rollback-drill.mjs`) remains the Compose equivalent; see [docs/runbooks/amc-service-down.md](../../runbooks/amc-service-down.md) when Studio does not come back.
