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

## Format
`.amcbackup` contains:
- `manifest.json`
- `manifest.sig`
- `keys/auditor.pub`
- `payload/workspace.tar.gz.enc`
- `payload.sha256`

## Restore Behavior
- Restore verifies bundle before extraction.
- After restore, AMC runs ops/transparency verification checks.
- If checks fail, restore still completes but workspace is marked untrusted and warning artifacts are written.

## Transparency
- `BACKUP_CREATED` and `BACKUP_RESTORED` entries are appended to the transparency log.
- Merkle root history updates alongside transparency appends.

