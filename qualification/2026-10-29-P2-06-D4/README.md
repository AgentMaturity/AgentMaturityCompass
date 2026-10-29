# P2-06-D4: backup restore decides every refusal before it writes

Defect D4 from qualification/2026-10-29-P2-06 (BR-3, `tenantChanged: true`). `amc backup restore --force` into another tenant's initialised workspace changed that workspace's `.amc` and only then failed.

## Root cause

`restoreBackup` (src/ops/backup/backupEngine.ts) extracted the payload straight into the target with `--force` and made no identity check. The only check that refused another workspace was the key set's anti-rollback comparison (`boundKeyset`, P1-08: the target path's committed mark against the restored `keyset.json`). It ran after the extract, when the restore signed its own `BACKUP_RESTORED` audit row, so it threw `FORK_DETECTED` after the extracted files and `.amc/RESTORE_WARNING.txt` were written.

## Fix

- `assertKeysetRestorable(target, incoming)` (src/keys/keyset.ts): a target holding `.amc` must hold the backup's key set (the same keys), and the backup's key set must pass this machine's committed and adopted marks for the target path. It runs on the payload extracted into a system temp directory, before any write to or beside the target.
- `restoreBackup` stages the restore in `.amc-restore-*` on the target's filesystem, verifies and seals it there, and commits by rename. Over the same workspace, replaced entries are kept in `<target>/.amc-pre-restore-*` (returned as `replacedTo`, printed by the CLI), never deleted; a failed rename puts back what had moved.

## Evidence

- Regression test: tests/backupRestoreRefusal.test.ts (7 tests). Red on 331f311d6 for the cross-tenant case (`FORK_DETECTED` after write, tree bytes changed) and both failure-after-checks cases; green after the fix.
- Mutations: mutations.json (4 mutants, all killed).
- Module tests: 51 files, 718 tests passed (every test file importing keys/keyset or ops/backup, plus embeddedKeyForgery and referenceDeploymentHarness).

## Other restore and import paths

- Backup restore without `--force`: the existing-target refusal now runs before decryption. A new target was left partial when a later write failed; staging fixes that.
- Bundle import: no `amc bundle import` exists. `amc federate import` already decides every refusal first and stages with a rename.
- `amc evidence-stores migrate --to postgres`: write-before-refuse found, not fixed here (P2-09). `ensurePostgresChainId` writes `.amc` before the "Postgres chain already holds rows" refusal. `recordSignedPostgresHead` (both streams) writes before `assertMirrorParity` can refuse. Rows committed to Postgres before a parity refusal also make every retry refuse. A fix needs the copy and parity check in one Postgres transaction, and a live Postgres to qualify it.

## Pending

- Rerun BR-3 on the reference deployment (real cluster). Pending for the P2-06 harness run.
