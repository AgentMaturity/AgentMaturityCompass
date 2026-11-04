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

## Receipt repaired 2026-10-31

The folder had no `receipt.json`, which `npm run check:qualification` requires. It was written from this README, `mutations.json` and the git history. Its commands are the two test runs under Evidence, written as vitest commands because their command lines were not recorded, with exit 0 as their results imply. `commit` is `b98565946`, which holds the fix and this folder. The folder records no build, typecheck, lint or repository-check results, so the receipt lists none. `tests` is null because the module run's skipped count was not recorded. `mutations.json` is listed as a hashed artifact. The Node, pnpm and OS versions and the command durations were never recorded; they are written as `not recorded` and `durationMs: 0`. `arch` is `arm64`, a same-host inference from the same wave's D5 receipt of that day, because the schema allows only `arm64` or `x64`.


## Folder renamed 2026-10-31

This folder was `qualification/2026-10-29-P2-06-D4/`. `npm run check:qualification` reads a folder name as `<YYYY-MM-DD>-<KEY>`, where a second receipt for the same key and day may add a lowercase variant (`qualification/README.md`). The receipt key is `P2-06`. The old uppercase suffix `-D4` reads as another key, so it can never match. The folder now carries the lowercase variant `-d4-restore`, from the lane branch `rtd/w7-d4-restore`. The branch name is added because a rename that changed only the letter case may leave the old directory name in place in existing macOS checkouts, whose file systems ignore case. The evidence files are unchanged; git records the move as a rename.
