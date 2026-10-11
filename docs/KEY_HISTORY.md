# Authenticated signing-key history

AMC verifies a historical signing key only when the current role key has authenticated its admission. The independently selected `.amc/keys/<role>_ed25519.pub` remains the anchor for that role. A hash chain alone cannot authorize a key: anyone who edits a history file can recompute its hashes.

## Public format

Each `<role>_history.json` is a version 1 envelope with `purpose: "amc.key-history"`, `role`, `anchorFingerprint`, positive `revision`, `entries`, and `signature`. Roles are `monitor`, `auditor`, `lease`, and `session`. Since P1-08 each signing purpose also has `<purpose>_history.json`, a version 2 envelope whose `role` is the purpose, signed under `AMC_KEY_HISTORY_ADMISSION_V2` with a canonical base64 signature; `lease` and `session` keep their version 1 role history (`docs/KEY_LIFECYCLE.md`). The fingerprint is lowercase SHA-256 of the exact PEM bytes. Entries retain their timestamps, fingerprints, PEMs, source labels and structural hash links.

The Ed25519 admission signature covers the UTF-8 bytes of `AMC_KEY_HISTORY_ADMISSION_V1`, a NUL byte, and AMC's recursively key-sorted canonical JSON for every field except `signature`. Array order is preserved. This directly signed, tagged payload is distinct from artifact digest signatures. Generic AMC digest signing accepts exactly 64 lowercase hexadecimal characters, so it cannot be used to sign an admission payload supplied as long hex.

Readers validate the strict schema, role, independently supplied anchor, key fingerprints, unique keys, hash linkage, presence of the current key, and admission signature. They do not select the anchor from the envelope. Missing, malformed, unsigned, legacy-array, or unauthenticated history contributes **no historical keys**. The current public key remains usable without an unlocked vault. Since P1-08 the revision is also an anti-rollback counter: every history AMC writes raises a mark in `<AMC home>/state/high-water.json`, and readers treat a history older than the accepted revision (`ROLLBACK_DETECTED`), or other content at that revision (`FORK_DETECTED`), as unauthenticated. Rotations also append each history revision to the workspace transparency log (`KEY_HISTORY_REVISION`).

## Existing workspaces

Older unsigned history arrays deliberately stop authorizing historical signatures. Reads, unlocks, ordinary initialization of an existing vault, and secret changes do not sign those arrays or widen their authority. Fresh vault initialization admits only the keys derived from its private keys and preserves overwritten history bytes as a backup.

Review the history file and obtain any historical fingerprints from trusted records. Compute the exact file's SHA-256, then explicitly migrate:

```bash
amc vault history migrate --role auditor --expected-sha256 <reviewed-file-sha256>
```

With no approved historical fingerprints, this keeps only the current key. To retain reviewed historical keys:

```bash
amc vault history migrate --role auditor --expected-sha256 <reviewed-file-sha256> \
  --approve-fingerprint <reviewed-key-fingerprint> <another-reviewed-key-fingerprint>
```

Migration requires the active vault key to match the current public key. It rejects changed file bytes, invalid or ambiguous approved keys, and no-sign mode. It preserves the exact original as `<role>_history.json.untrusted-<sha256>` and signs a new list containing only the current key and explicitly approved historical keys. Malformed files can be recovered using current-only migration; their contents never become authority by default. If the history file is missing, a normal unlocked vault rewrite can initialize a current-only history.

## Rotation and external pins

`amc keys rotate --purpose <p>` (and `amc vault rotate-keys`, which rotates `ledger-row` and `receipt` together) requires authenticated histories and the matching old private key. The new key is appended to its purpose history, sealed by the new key, and admitted to its role history, sealed by the role's primary key (or the new key when the primary purpose rotated), so historical signatures remain verifiable. A `key-compromise` rotation instead drops the compromised key from every history.

Each rotation writes a signed, chained `amc.key-rotation` statement per purpose (`.amc/keys/statements/<purpose>/<sequence>.json`), signed by the old and new keys, or for key-compromise by the new key and a trust-list root (`docs/KEY_LIFECYCLE.md`). Statements replace the old-key-signed `amc.monitor-key-rotation` receipts for new rotations; `verifyKeyRotationReceipt` still verifies existing receipts against an independently supplied previous fingerprint.

An external `AMC_EXPECTED_MONITOR_FINGERPRINT` or verifier option remains strict. A statement does not update it: an operator approves the new key through their external pin process, typically a new trust list.

A rotation is one key-set generation: every file is staged, `keyset.pending.json` is written, the files are renamed into place and `keyset.json` is committed last. An interruption leaves a pending generation that refuses signing and verification until `amc keys rotate --resume` rolls it forward or back from `.amc/keys/rotations/gen-<N>/`, which keeps the replaced bytes (the old encrypted vault included) and, after a rollback, what the generation had written under `discarded/`. Recovery copies retain encrypted old private keys and should follow the operator's key-retention policy.

## Notary and portable artifacts

Enabling a pinned notary explicitly admits its key with the local auditor key only after saving the signed trust configuration. Ordinary notary signing responses do not mutate key history. This preserves the existing role-wide admission model: the `source` label records provenance, not fine-grained artifact scope or revocation. A failed admission leaves the requested configuration incomplete and must be resolved explicitly; it does not make the remote key trusted.

Bundles and certificates export verified envelopes, or `null` when a role has no authenticated history. Offline verifiers authenticate those envelopes against their separately loaded direct role public keys, and stage only authenticated histories. Current-key signatures in older artifacts remain compatible; unsigned historical lists do not authorize old signers. An embedded public key establishes internal issuer consistency only. Since P0-09 PR 2, `amc bundle verify` and `amc cert verify` also require the signer to be pinned: the direct key by `--pubkey` or a trust-list entry, an older key only through a history whose anchor a trust list pins with `allowKeyHistory: true`. History authentication alone admits no issuer.

When an already-unlocked process reads a vault secret, it checks the encrypted envelope for changes made by another process. Changed payloads are authenticated and refreshed in memory without rewriting trust files or upgrading legacy role keys. Missing, damaged or differently encrypted vaults clear the cached session and fail the read. This lets evidence verification find a newly added blob key while preserving the read-only boundary.

A fresh verification process can read encrypted evidence with an explicit `AMC_VAULT_PASSPHRASE` and an existing vault. The blob reader authenticates and reads secrets in memory without unlocking the ordinary vault session or upgrading legacy keys. Its separate cache retains secrets only, expires after 30 minutes of inactivity, and checks the current passphrase and encrypted file digest on every read. Locking clears it; missing credentials or damaged vault data fail closed. Session summaries and run verification open existing ledgers as readers, so public-only inspection never initializes a vault or replaces keys.

## Trust lists

`admitKey` in `agent-maturity-compass/trust` reuses this envelope. A signed trust-list entry with `allowKeyHistory: true` names the anchor: when that key is admitted for the purpose and is neither distrusted nor revoked for key compromise, and the envelope's role signs that purpose, the older keys it lists are admitted with source `trust-list-history`. Distrust still applies to each older key. Bundle and certificate verification pass the envelopes they carry to `admitKey` (P0-09 PR 2); a `--pubkey` pin admits only that key, never its history. See `docs/TRUST_LIST.md`.
