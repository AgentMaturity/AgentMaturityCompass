# Backups

AMC supports signed, encrypted, offline-verifiable workspace backups.

## Commands
- `amc backup create --out <file.amcbackup>`
- `amc backup verify <file.amcbackup> [--pubkey <path>]`
- `amc backup print <file.amcbackup>`
- `amc backup restore <file.amcbackup> --to <dir> --pubkey <recorded-auditor.pub> [--force]`

## Security Model
- Backup manifest is always signed (Ed25519 auditor key).
- Backup payload is encrypted with passphrase AES-256-GCM when ops policy requires encryption (default).
- Verification works offline:
  - verifies manifest signature
  - verifies encrypted payload hash
  - verifies decrypted file hashes
- Backup passphrase is read from:
  - `AMC_BACKUP_PASSPHRASE_FILE`, or
  - interactive prompt (CLI only).

## SQLite files
- Each SQLite database in the backup set (`evidence.sqlite` among them) is captured with `VACUUM INTO` from a read-only connection: one consistent snapshot, committed WAL content included, taken without stopping writers. Its `-wal`, `-shm` and `-journal` sidecars are not copied, and the manifest hashes the snapshot.
- An encrypted ledger ([EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md)) is backed up as ciphertext with only its wrapped data keys, so restoring it needs the same KeyProvider.

## Postgres session store

A workspace pinned to the Postgres session store (see [EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md)) keeps its session rows in Postgres, and `amc backup` does not copy them. Back them up with the database's own tooling (base backups with WAL archiving, or the managed service's point-in-time recovery). The workspace backup still carries what the rows need to verify and to be read: `.amc/postgres-store.json` (the chain id), the signing keys and the blobs.

## Format
`.amcbackup` contains:
- `manifest.json`
- `manifest.sig`
- `keys/auditor.pub`
- `payload/workspace.tar.gz.enc`
- `payload.sha256`

## Restore Behavior
- Restore verifies bundle before extraction.
- Every refusal is decided before anything is written: a bad signature or hash, an existing target without `--force`, and a target that holds another workspace. With `--force` the target must be the backup's own workspace (the same key set), and the backup's key set must pass this machine's anti-rollback marks for the target path; another tenant's workspace, or this one after a key rotation, is refused, so restore into a new directory instead.
- The restore is staged next to the target on the same filesystem and moved into place by rename, so a failure leaves the target as it was. Over an existing workspace, the entries it replaced (normally `.amc`) are kept in `<target>/.amc-pre-restore-*` and never deleted; remove that directory once the restored workspace checks out.
- After restore, AMC runs ops/transparency verification checks.
- If checks fail, restore still completes but workspace is marked untrusted and warning artifacts are written.

## Transparency
- `BACKUP_CREATED` and `BACKUP_RESTORED` entries are appended to the transparency log.
- Merkle root history updates alongside transparency appends.

