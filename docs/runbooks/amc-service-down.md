# Runbook: AMC Service Down

## Purpose

Recover AMC when Studio/API is unavailable or readiness fails.

`<monitor sha256>` below is the fingerprint of `.amc/keys/monitor_ed25519.pub` (`shasum -a 256`), recorded outside the workspace when it was created. Without that pin (or `AMC_EXPECTED_MONITOR_FINGERPRINT`, or a trust list), `amc verify all` reports the ledger UNANCHORED and exits 1; that alone is not evidence of corruption.

## Triggers

- `amc status` shows Studio not running unexpectedly.
- `/healthz` or `/readyz` is unreachable or returns non-200.
- `amc studio healthcheck` fails.

## Immediate Actions (First 10 Minutes)

1. Confirm outage scope.
   ```bash
   amc status
   amc studio healthcheck
   ```
2. Capture current diagnostics before restart attempts.
   ```bash
   amc logs --lines 200
   amc doctor --strict --json
   amc verify all --json --expect-monitor <monitor sha256>
   ```
3. If trust/integrity checks are failing, treat as integrity incident, not just availability.

## Recovery Procedure

1. Attempt controlled restart.
   ```bash
   amc down
   amc up
   ```
2. Recheck service health and readiness.
   ```bash
   amc status
   amc studio healthcheck
   ```
3. Validate trust-critical state after service returns.
   ```bash
   amc trust status
   amc transparency verify
   amc verify all --json --expect-monitor <monitor sha256>
   ```
   After a crash, `amc verify` may name `Session <id> missing seal`. If the session is the gateway's (runtime `gateway`), a running Studio seals it within about 10 minutes; nothing to do. For any other runtime, or on a copy you will not run Studio on: confirm the writer is dead (`amc status`, the tool's process), then `amc verify --repair` shows `seal_interrupted_sessions` and `--apply` seals it with a signed marker. If `--repair` proposes `archive_evidence_store` instead, something other than an open session failed; follow the rest of this runbook.

## If Restart Fails

1. Check for signature/config failures called out by readiness.
2. Validate gateway and signed policy surfaces.
   ```bash
   amc gateway verify-config
   amc ops verify
   amc policy action verify
   amc policy approval verify
   ```
3. If integrity failures persist, restore from last known-good backup.
   ```bash
   amc backup verify .amc/backups/latest.amcbackup --pubkey <recorded-auditor.pub>
   amc backup restore .amc/backups/latest.amcbackup --to /tmp/amc-restore --force --pubkey <recorded-auditor.pub>
   cd /tmp/amc-restore
   amc verify all --json --expect-monitor <monitor sha256>
   ```

## Exit Criteria

- `amc studio healthcheck` is healthy.
- `amc verify all --json --expect-monitor <monitor sha256>` passes.
- `amc trust status` and `amc transparency verify` pass.
- Incident note includes timeline, root cause, and prevention action.
