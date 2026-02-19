# Operations Runbook (Production)

This runbook is for post-launch AMC operation with verifiable controls.

## 1) Upgrade Procedure

1. Build + test candidate:
   ```bash
   npm ci
   npm test
   npm run build
   ```
2. Roll deployment (compose/helm).
3. Verify runtime:
   ```bash
   amc studio healthcheck
   amc doctor --json
   amc verify all --json
   ```
4. Verify trust and transparency state:
   ```bash
   amc trust status
   amc transparency verify
   amc transparency merkle root
   ```

## 2) Retention Lifecycle

Use signed retention controls (dry-run first):

```bash
amc retention status
amc retention run --dry-run
amc retention run
amc retention verify
```

## 3) Backup / Restore

Create and verify encrypted signed backup:

```bash
amc backup create --out .amc/backups/latest.amcbackup
amc backup verify .amc/backups/latest.amcbackup
```

Restore drill:

```bash
amc backup restore .amc/backups/latest.amcbackup --to /tmp/amc-restore --force
AMC_WORKSPACE_DIR=/tmp/amc-restore amc verify all --json
```

## 4) Maintenance Tasks

```bash
amc maintenance stats
amc maintenance vacuum
amc maintenance reindex
amc maintenance rotate-logs
amc maintenance prune-cache
```

## 5) Encryption-at-Rest Key Lifecycle (blobs)

```bash
amc blobs key init
amc blobs verify
amc blobs key rotate
amc blobs reencrypt
```

## 6) Vault/Signing Key Rotation

```bash
amc vault rotate-keys
```

If using containerized secret files, rotate mounted secrets and restart controlled workloads.

## 7) Metrics and SLO Monitoring

```bash
amc metrics status
curl -fsS http://127.0.0.1:9464/metrics
```

Track:
- API and bridge request latency/error rate
- readiness failures
- evidence storage growth (db/blob/segments)
- backup age and verification status
- retention throughput and failures

## 8) Incident / DR Baseline

If integrity checks fail:
1. Freeze change paths (owner/operator controls only).
2. Preserve artifacts and logs.
3. Run:
   - `amc verify all --json`
   - `amc transparency verify`
   - `amc trust status`
4. Restore from last known-good `.amcbackup` if recovery is required.

## Evidence Pointers

- CLI surfaces: `src/cli.ts`
- Retention: `src/ops/retention/`
- Backup: `src/ops/backup/`
- Maintenance: `src/ops/maintenance/`
- Metrics: `src/ops/metrics/`
- Transparency log + merkle: `src/transparency/`
- Trust mode + notary checks: `src/trust/`, `src/notary/`
