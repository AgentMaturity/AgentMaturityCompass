# Runbook: AMC Service Down

## Purpose

Recover AMC when Studio/API is unavailable or readiness fails.

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
   amc verify all --json
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
   amc verify all --json
   ```

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
   amc backup verify .amc/backups/latest.amcbackup
   amc backup restore .amc/backups/latest.amcbackup --to /tmp/amc-restore --force
   cd /tmp/amc-restore
   amc verify all --json
   ```

## Exit Criteria

- `amc studio healthcheck` is healthy.
- `amc verify all --json` passes.
- `amc trust status` and `amc transparency verify` pass.
- Incident note includes timeline, root cause, and prevention action.
