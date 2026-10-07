# Migration Runbook (Data + Config Safety)

Use this checklist when upgrading AMC versions that may impact data, signatures, policy files, or runtime config.

---

## 1) Pre-migration checks

```bash
amc status
amc verify all --json
amc maintenance stats
```

Record current:
- AMC version
- workspace path
- active mode (`owner` / `agent`)
- latest verification output location

---

## 2) Backup and restore drill (mandatory)

Create signed encrypted backup:

```bash
amc backup create --out .amc/backups/pre-migration-<ts>.amcbackup
amc backup verify .amc/backups/pre-migration-<ts>.amcbackup --pubkey <recorded-auditor.pub>
```

Restore to isolated path and verify:

```bash
amc backup restore .amc/backups/pre-migration-<ts>.amcbackup --to /tmp/amc-restore-<ts> --pubkey <recorded-auditor.pub>
```

Expected: restore succeeds and key files exist in `/tmp/amc-restore-<ts>`.

---

## 3) Prepare release artifact

Prefer signed bundle verification before apply:

```bash
amc release verify /path/to/amc-<version>.amcrelease --pubkey <published-release-signing.pub>
```

If verification fails, stop.

---

## 4) Apply upgrade

- Deploy new binary/container image
- Keep rollout progressive (single workspace/canary first)
- Watch health endpoints:
  - `/healthz`
  - `/readyz`

---

## 5) Post-migration verification

Run immediately after upgrade:

```bash
amc verify all --json
amc retention verify
amc transparency verify
```

If using notary/trust hardening:

```bash
amc trust status
```

Expected: no signature/integrity failures.

---

## 6) Failure and rollback criteria

Rollback immediately when:
- `amc verify all` reports integrity/signature failures
- readiness remains unhealthy beyond agreed SLO window
- critical operator workflows fail (`run`, `verify`, `backup verify`)

Rollback steps:
1. Revert deployment to last known-good release
2. Restore verified pre-migration backup if needed
3. Re-run verification suite
4. Escalate incident with evidence report and version delta

---

## 7) Change record (required)

Capture in incident/release note:
- from-version -> to-version
- backup file + hash
- restore drill result
- post-migration verify result
- rollback required (Y/N)
- owner sign-off
