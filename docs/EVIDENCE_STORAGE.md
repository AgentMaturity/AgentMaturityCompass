# Evidence storage

How AMC stores evidence at rest, which keys protect it, and what is not claimed. Design and trade-offs: [ADR 018](adr/018-encrypted-ledger-worm-postgres.md) (proposed; Sid approval pending).

## Modes

| Mode | Where | Default |
| --- | --- | --- |
| SQLite ledger | `.amc/evidence.sqlite`, one writer, WAL | Yes |
| Encrypted inline payloads | Same file; `payload_inline` and `canonical_payload_inline` hold `amcenc:v1:` ciphertext | Off |
| Encrypted blobs | `.amc/blobs/`, AES-256-GCM | On (`blobEncryptionEnabled`) |

## Ledger encryption

Turn it on in the signed ops policy, then create the data key and encrypt existing rows:

```yaml
opsPolicy:
  encryption:
    ledgerEncryptionEnabled: true   # optional key; absent means off
```

```bash
amc ops sign                     # re-sign the edited policy, as for any ops-policy change
amc evidence-stores encrypt      # creates data key version 1 if none, encrypts existing inline payloads, writes a signed receipt
amc evidence-stores encrypt --key-provider aws-kms --key-ref arn:aws:kms:...   # wrap the first data key under a KMS key
amc evidence-stores encrypt --rotate-key   # new data key version for new rows; old rows keep theirs
amc evidence-stores encrypt --rewrap [--key-provider P --key-ref R]   # re-wrap every version; no ciphertext changes
```

- **Keys.** Each data key is 256 bits and is stored only wrapped by a P2-08 KeyProvider key ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)), in `.amc/keys/ledger-dek.json`, signed with the config-signature key. A changed or unsigned key file is refused. The default wrapping key is a vault-held AES key named `ledger-dek` (file provider, development only).
- **Anti-rollback.** The key file carries a `sequence` that rises on every rotation and rewrap. The highest sequence seen is kept in `<AMC home>/state/high-water.json` (P1-08's store, outside the workspace), so an older validly signed key file is refused (`ROLLBACK_DETECTED`). Independently, the ledger refuses to encrypt under a key version older than the newest version already in its ciphertexts, which covers a machine without the mark.
- **What is encrypted.** The inline payload of each evidence row, with AAD binding table, row id, column and key version: a ciphertext copied to another row or column does not open. Blobs were already encrypted. `meta_json` is not encrypted: it carries ids, tiers, receipts and hashes that queries read, and some writers put free text in it.
- **Verification without keys.** Rows written with encryption on hash their ciphertext, so the hash chain and every signature verify with no key, and an altered ciphertext fails verification. Checking payload bytes against `payload_sha256` needs the key or a plaintext export. A verifier whose key is out of reach (provider unreachable, vault locked) lists those rows in `payloadsNotEvaluated`: they are not errors and are not verified. A missing or rolled-back key file, a key version the file does not hold, a ciphertext that does not open, or a `payload_inline` that does not match `canonical_payload_inline` is a verification error.
- **Rows encrypted by the migration.** Their hashes covered plaintext. Verification decrypts them where the key is available; without it they fail verification with the reason "a row encrypted after hashing needs the ledger key or a plaintext export to verify". The migration receipt (`.amc/ledger-encryption/migration-<ts>.json`) records row counts, key version and the chain head before and after, which match.
- **Key provider unavailable.** An append that needs the data key and cannot get it is denied with the provider's error code, and no row is written. Verification still runs.
- **Reading payloads.** `readEventPayload` (`src/session/eventPayload.ts`) decrypts. Code that reads `payload_inline` with its own SQL sees ciphertext when encryption is on. Known readers to move onto `readEventPayload` before enabling encryption where they matter: `src/wire/workAcceptance.ts`, `src/agent/foreignSubagentRunner.ts`, `src/studio/nativeTaskValidation.ts`, `src/diagnostic/runner.ts`, `src/cli-trace-commands.ts`, `src/catalog/evidence/mappingAdapter.ts`, `src/budgets/nativeBudgetUsage.ts`, `src/actions/actionJournal.ts`, `src/session/surfaceCompaction.ts`, `src/session/spill/spillEvidence.ts`, `src/score/productionReadiness.ts`, `src/drift/continuousMonitor.ts`, `src/diagnostic/gates.ts`, `src/dashboard/build.ts`, `src/compliance/evidenceBinding.ts`, `src/audit/binderCollector.ts`, `src/assurance/executed/evidence.ts`, `src/acp/acpCommittedUpdates.ts`, and `src/a4` (P2-36).
- **Zeroization.** Plaintext keys live in process memory and are zeroized on exit or `closeLedgerDataKeys()`. In Node this is best effort. Keys and wrapped keys are never logged.

## Backups

Backups capture each SQLite file with `VACUUM INTO`, a consistent snapshot taken from a read transaction, so appends during a backup cannot tear it. WAL and shared-memory sidecars are not copied. An encrypted ledger is backed up as ciphertext with only its wrapped keys, so restoring it needs the KeyProvider. See [BACKUPS.md](BACKUPS.md).

## Schema versions

An AMC refuses a ledger migrated by a newer AMC: "ledger schema version N is newer than this AMC; restore the pre-upgrade backup or upgrade AMC". Migration 14 (P2-09) lets `canonical_payload_inline` change once, from plaintext to its `amcenc:v1:` ciphertext; every other immutable column stays protected.

## What is not claimed

- Field encryption hides inline payload content from someone who reads the database file. It does not hide `meta_json`, row counts, timing or sizes.
- Key protection is whatever the KeyProvider describes ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)); the file provider is a development option.
