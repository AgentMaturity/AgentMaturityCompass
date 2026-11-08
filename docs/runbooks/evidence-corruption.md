# Evidence Corruption Response Runbook

Use this when AMC integrity checks indicate tampering, corruption, or signature-chain failure.

`<monitor sha256>` below is the fingerprint of `.amc/keys/monitor_ed25519.pub` (`shasum -a 256`), recorded outside the workspace when it was created. Without that pin (or `AMC_EXPECTED_MONITOR_FINGERPRINT`, or a trust list), `amc verify all` reports the ledger UNANCHORED and exits 1; that alone is not evidence of corruption.

## Trigger Signals

- `amc verify all --json --expect-monitor <monitor sha256>` reports `FAIL`
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
amc verify all --json --expect-monitor <monitor sha256>
amc transparency verify
amc trust status
```

## Scope the Damage

1. Determine which subsystems failed (ledger, transparency, policies, artifacts). After a crash, `amc verify` may name `Session <id> missing seal`. If the session is the gateway's (runtime `gateway`), a running Studio seals it within about 10 minutes; nothing to do. For any other runtime, or on a copy you will not run Studio on: confirm the writer is dead (`amc status`, the tool's process), then `amc verify --repair` shows `seal_interrupted_sessions` and `--apply` seals it with a signed marker after you type `seal` (`--yes` in scripts). An erased seal plus deleted newest rows looks exactly the same, so seal only a session you know was interrupted. If `--repair` proposes `archive_evidence_store` instead, something other than an open session failed, or a signed ledger checkpoint forbids the seal (`Not sealing: …`); follow the rest of this runbook.
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
amc verify all --json --expect-monitor <monitor sha256>
amc transparency verify
```
3. If restored workspace is clean, promote it as new active workspace and restart Studio.

## Post-Recovery Validation

```bash
amc up
amc studio healthcheck
amc verify all --json --expect-monitor <monitor sha256>
```

## Exit Criteria

- restored workspace passes full verification
- corruption window and impacted artifacts documented
- preventive controls assigned (backup cadence, access restrictions, integrity monitoring)
