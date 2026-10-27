# ADR 018: Encrypted ledger, WORM export and a Postgres HA option

Status: **proposed; Sid approval pending**. Item: P2-09 (four stacked branches `rtd/p2-09a-ledger-encryption`, `rtd/p2-09b-worm-export`, `rtd/p2-09c-guard-events-cutover`, `rtd/p2-09d-postgres`). The spec asks for Sid's approval before code; the code was written against this proposal so that review has something concrete to approve or reject. Nothing below is approved until Sid records it.

## Context

The evidence ledger is one plaintext SQLite file (`src/ledger/ledgerConnection.ts`, `.amc/evidence.sqlite`). Inline payloads (`payload_inline`, `canonical_payload_inline`) and `meta_json` are plaintext TEXT. Blobs are already AES-256-GCM (`src/storage/blobs/blobEncryptor.ts`). P2-08 added `KeyProvider.wrapKey`/`unwrapKey` (`src/keys/provider.ts`) for file, AWS KMS, Google Cloud KMS, Azure Key Vault and PKCS#11.

Two facts shaped the decision and were verified in code, not assumed:

- The event hash covers the inline payload itself: `canonicalMetadataForHash` (`src/ledger/eventHash.ts`) includes `payload_inline`, and every verifier recomputes `event_hash` from `canonical_payload_inline ?? payload_inline`. Encrypting "after hashing" therefore cannot keep keyless verification for a hash computed over plaintext.
- A trigger (`protect_evidence_immutable`, migration 5) forbids any change to `canonical_payload_inline`.

## Decision 1: encryption mode — option A (field encryption)

AES-256-GCM on the inline payload, with AAD `evidence_events:{row id}:payload_inline:{key version}`, stored as `amcenc:v1:{keyVersion}:{nonce}:{ciphertext}:{tag}` (base64url). Both inline columns hold the same ciphertext. `meta_json` stays plaintext (see "meta_json review").

- **Write path.** With `opsPolicy.encryption.ledgerEncryptionEnabled: true` the payload is encrypted before the row's hash is computed, so the event hash covers the stored ciphertext. `payload_sha256` still covers the plaintext and is part of the hash. Third parties verify the chain and every signature with no key; checking payload bytes against `payload_sha256` needs the key or a plaintext export. This deviates from the spec's wording ("encrypt after hashing") to meet its stated goal (keyless verification); see Consequences.
- **Existing rows.** `amc evidence-stores encrypt` encrypts rows written before the switch in place. Their hashes covered plaintext and cannot change (signatures, receipts, the chain head). Migration 14 relaxes the trigger exactly once per row: `canonical_payload_inline` may go from a non-`amcenc:` value to an `amcenc:v1:` value. Verifying those rows recomputes the hash after decryption; without the key, verification fails for them with the reason stated. The migration writes a signed receipt with the chain head before and after (equal by construction, and checked).
- **Keys.** A 256-bit data key per version, wrapped by a KeyProvider key and stored in `.amc/keys/ledger-dek.json` (`{ v, activeVersion, keys: WrappedDataKey[] }`), signed with the config-signature key like blob key metadata. Rotation adds a version (old rows keep theirs); rewrap re-wraps every version without touching ciphertext. The default wrapping key is the file provider's vault-held AES key `ledger-dek` (development); `--key-provider`/`--key-ref` name a KMS, Key Vault or PKCS#11 key.
- **Synchronous ledger.** Appends are synchronous; providers are asynchronous. The ledger uses an in-memory cache primed by `getActiveDataKey`; a cold cache unwraps synchronously, through the vault for the file provider and through the P2-08 provider bridge (one child process per key version per process) for remote providers. Any failure is a `KeyProviderError`: the append is denied with that reason and no row is written. Verification still runs.
- **Reads.** `readEventPayload` (`src/session/eventPayload.ts`), the shared payload read path, decrypts. Raw SQL readers of `payload_inline` see ciphertext; see Consequences.

Criteria and how A and the alternatives fare:

| Criterion | A: field AES-GCM | B: page encryption | C: volume only |
| --- | --- | --- | --- |
| Keyless chain verification of exports | Yes for rows written encrypted; migrated rows need the key | Export must be decrypted first; chain unchanged | Unchanged (nothing is encrypted by AMC) |
| The seven `meta_json` queries | Unchanged (meta stays plaintext) | Unchanged | Unchanged |
| Native module | Current `better-sqlite3` 12.11.1 | A fork: `better-sqlite3-multiple-ciphers` 13.0.3 (MIT) or SQLCipher builds (`@journeyapps/sqlcipher` 6.0.0, BSD-3-Clause, async API) | None |
| Prebuilt binaries on Linux AMD64/ARM64, macOS ARM64, Windows x64, Node 22 and 24 | As today | Not verified: check each fork's release assets; the P2-06 platform matrix must re-qualify | n/a |
| `doctor` native-module probe | Unchanged | Must learn the fork | n/a |
| Rekeying | Rewrap is cheap; re-encryption of rows is a follow-up | `PRAGMA rekey` rewrites the file | Operator's tooling |
| Latency | One AES-GCM per inline payload; plus one unwrap per process | Per page | None |
| Protects | Inline payload content | Everything, including `meta_json` | Disk at rest only |

Licences and versions were read from the npm registry on 2026-10-27. Advisory history was not checked in this session; check with `npm audit` and GitHub advisories before approving. B stays the upgrade path if `meta_json` content must be hidden too.

### meta_json review

`meta_json` carries ids, trust tiers, receipts, hashes and adapter metadata that the seven SQL statements filter on (`bankV1.ts`, `actionEvidenceLogic.ts`, `evalImporters.ts`, `exporter.ts`, `sqliteMaintenance.ts`). Some writers put free text there (for example tool argument summaries). Option A does not hide those. This is recorded, not solved; moving content-bearing keys out of `meta_json` is a follow-up per writer.

## Decision 2: WAL-safe backups

SQLite files in a backup are captured with `VACUUM INTO` from a read-only connection: one transactionally consistent database, committed WAL frames included, no writer lock. Their `-wal`, `-shm` and `-journal` sidecars are not copied. The spec names `better-sqlite3`'s `db.backup()`; it returns a Promise, and `createBackup` is synchronous, so `VACUUM INTO` (synchronous, same consistency) is used in both the synchronous and the asynchronous backup. Encrypted ledgers back up as ciphertext with only wrapped keys, so a restore needs the KeyProvider.

## Decision 3: schema downgrade guard

`runMigrations` refuses a database whose `schema_migrations` holds a version newer than the binary knows: "ledger schema version N is newer than this AMC; restore the pre-upgrade backup or upgrade AMC". P2-06's RB-2 depends on it.

## Decision 4: WORM export (branch b)

S3 Object Lock in compliance mode first, behind a `WormTarget` interface (`s3-object-lock`, `azure-immutable-blob`, `gcs-bucket-lock`, `filesystem-test`). `@aws-sdk/client-s3` (3.1157.0, Apache-2.0) loads lazily only when configured and is not added to `package.json`. MinIO, a candidate local object-lock target for CI, is AGPL-3.0; no MinIO job is added until Sid accepts that licence for CI-only use. CI uses the `filesystem-test` target. Wording: "WORM export designed for SEC 17a-4-style retention"; AMC makes no claim that an export meets 17a-4.

## Decision 5: Postgres approach (branch d) — option 1

Synchronous calls into a Postgres client running in a worker thread, the caller blocking on `Atomics.wait`. This keeps the synchronous session-store contract (`src/persistence/sessionEventStore.ts`), so "model-visible ⊆ logged" needs no new argument. One writer per chain is enforced by the database: `UNIQUE (chain_id, prev_event_hash)` plus a `FOR UPDATE` lock on the chain head. During a primary loss appends fail closed with a typed error and resume after promotion. Option 2 (async contract) needs the kill-mid-turn proof and changes every caller; option 3 (asynchronous replication of signed segments) gives no write failover. Option 1's risk is a blocked event loop during network stalls; the append has a timeout and p95 latency must be measured against the 50 ms local-authorization budget.

Driver: `pg` 8.23.1 (MIT; SCRAM-SHA-256 and TLS through Node `tls`) over `postgres` 3.4.9 (Unlicense), because `pg` exposes `ssl` options directly and is the more widely deployed. Neither is installed in this checkout; the backend loads `pg` as an optional peer, like the PKCS#11 wrapper loads `pkcs11js`. The connection string comes from the file named by `AMC_POSTGRES_URL_FILE`. TLS with full verification and SCRAM are required. HA platforms (CloudNativePG, Patroni, a managed service) are the operator's choice.

Mirrored tables are a data list (`evidence_events`, `sessions`, `runs`) that A4 (P2-36) extends with `a4_*` and `action_*`.

## Consequences

- Deviation: the hash covers the ciphertext for rows written encrypted. Readers that recompute hashes from row columns (`ledgerVerification`, `a4Verify`, `a4AuditReader`, `sessionRootDescriptor`) need no change for those rows. For migrated rows only `ledgerVerification` decrypts; `src/a4` is P2-36's to change.
- Raw SQL readers of `payload_inline` outside `readEventPayload` see ciphertext when encryption is on. They are listed in `docs/EVIDENCE_STORAGE.md` as a follow-up; encryption is off by default, so no existing workspace changes.
- Migration 14 means an AMC without it refuses an upgraded ledger (the downgrade guard working as designed).
- Zeroizing keys in Node is best effort. Keys and wrapped blobs are never logged.

## Needs a human

Sid approves or rejects this ADR, provides one object-lock bucket for the recorded WORM run, and runs the Postgres failover once against the HA setup he chooses.
