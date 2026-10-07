# Evidence Corruption Response Runbook

Use this when AMC integrity checks indicate tampering, corruption, or signature-chain failure.

## Trigger Signals

- `amc verify all --json` returns `fail`
- transparency/merkle verification fails
- ledger hash-chain mismatch or artifact signature mismatch
- unexpected `UNKNOWN` spikes caused by unreadable/missing evidence

## Immediate Containment

1. Stop write-heavy workflows and preserve current state.
```bash
amc down
```
2. Capture verification output for incident record.
```bash
amc verify all --json
amc transparency verify
amc trust status
```

## Scope the Damage

1. Determine which subsystems failed (ledger, transparency, policies, artifacts).
2. Check latest backup integrity before restore.
```bash
amc backup verify .amc/backups/latest.amcbackup --pubkey <recorded-auditor.pub>
amc backup print .amc/backups/latest.amcbackup
```

## Recovery

1. Restore to isolated path.
```bash
amc backup restore .amc/backups/latest.amcbackup --to /tmp/amc-restore --force --pubkey <recorded-auditor.pub>
```
2. Verify restored workspace offline.
```bash
cd /tmp/amc-restore
amc verify all --json
amc transparency verify
```
3. If restored workspace is clean, promote it as new active workspace and restart Studio.

## Post-Recovery Validation

```bash
amc up
amc studio healthcheck
amc verify all --json
```

## Exit Criteria

- restored workspace passes full verification
- corruption window and impacted artifacts documented
- preventive controls assigned (backup cadence, access restrictions, integrity monitoring)
