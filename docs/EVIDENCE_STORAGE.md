# Evidence storage

How AMC stores evidence at rest, which keys protect it, and what is not claimed. Design and trade-offs: [ADR 018](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adr/018-encrypted-ledger-worm-postgres.md) (proposed; Sid approval pending).

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

## WORM export

Signed retention segments (`amc retention run`) can be exported to an object store under a compliance-mode retention lock: "WORM export designed for SEC 17a-4-style retention". AMC makes no claim that an export meets any rule; the record-keeping duties need the D-08 experts.

```bash
npm install @aws-sdk/client-s3          # optional peer, loaded only for S3 targets
amc evidence-stores worm-export --bucket <object-lock-bucket> --retain-days 2190 [--prefix ws1/] [--region eu-west-1]
amc evidence-stores worm-verify --index <downloaded index object> --objects <download dir> --trust-list <signed trust list>
```

- Every segment, its manifest and its signature are uploaded as content-addressed objects (`objects/<sha256>`) with `ObjectLockMode: COMPLIANCE`, a retain-until date, a SHA-256 checksum and `If-None-Match: *`. Then a signed `worm-export-index.json` names each object's key, sha256, retain-until and version id.
- A bucket without Object Lock is refused before any upload. Every object is HEAD-checked after upload; anything not in compliance mode, or retained for less than requested, is refused.
- An object already at our key is accepted only if HEAD (with `ChecksumMode: ENABLED`) shows compliance mode, a retain-until at least as late as requested, a SHA-256 checksum equal to ours and, where one was recorded, the same version id. Anything else (for example an object planted under our key) refuses the export; it is never overwritten.
- Nothing is deleted and no retention is shortened. Re-running the export uploads only objects the bucket does not already hold.
- Offline verification needs the downloaded objects and a signed trust list that pins the workspace's artifact-seal key: a key carried in the export never vouches for itself. It checks every object's sha256, every manifest signature, and the event-hash chain inside and across segments (keyless, as for encrypted rows).
- Compliance-mode locks cannot be shortened or removed, even by the account owner. Test with a dedicated bucket and a short retention.
- S3 Object Lock ships first. Azure immutable blobs and GCS bucket lock fit the same `WormTarget` interface and are not implemented. MinIO, a possible local object-lock target for CI, is AGPL-3.0, so CI uses the `filesystem-test` target until that licence is accepted.

## Guard events

Guard events still default to DUAL_WRITE: every event goes to `.amc/guard_events.sqlite` (authoritative for reads) and to `amc_guard_events` in `evidence.sqlite`. Retention with `retention.pruneGuardEventsAfterDays` now prunes both copies through P2-01's hold-aware deletion gate, so they stay in parity.

```bash
amc evidence-stores parity      # must report identical
amc evidence-stores backfill    # copies rows written before dual-write, if parity reports them missing
amc evidence-stores cutover     # refused unless parity is identical; records .amc/guard-events-stage.json
```

After cutover the workspace reads and writes guard events in `evidence.sqlite` only. The legacy file is left untouched, so reverting is a setting change: delete `.amc/guard-events-stage.json` or set `AMC_GUARD_EVENTS_STAGE=DUAL_WRITE` (the variable overrides the record in both directions). A new workspace is cut over the same way; parity of two empty stores is identical.

## Backups

Backups capture each SQLite file with `VACUUM INTO`, a consistent snapshot taken from a read transaction, so appends during a backup cannot tear it. WAL and shared-memory sidecars are not copied. An encrypted ledger is backed up as ciphertext with only its wrapped keys, so restoring it needs the KeyProvider. See [BACKUPS.md](BACKUPS.md).

## Schema versions

An AMC refuses a ledger migrated by a newer AMC: "ledger schema version N is newer than this AMC; restore the pre-upgrade backup or upgrade AMC". Migration 14 (P2-09) lets `canonical_payload_inline` change once, from plaintext to its `amcenc:v1:` ciphertext; every other immutable column stays protected.

## What is not claimed

- Field encryption hides inline payload content from someone who reads the database file. It does not hide `meta_json`, row counts, timing or sizes.
- Key protection is whatever the KeyProvider describes ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)); the file provider is a development option.
