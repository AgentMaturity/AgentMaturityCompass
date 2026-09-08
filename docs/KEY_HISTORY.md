# Authenticated signing-key history

AMC verifies a historical signing key only when the current role key has authenticated its admission. The independently selected `.amc/keys/<role>_ed25519.pub` remains the anchor for that role. A hash chain alone cannot authorize a key: anyone who edits a history file can recompute its hashes.

## Public format

Each `<role>_history.json` is a version 1 envelope with `purpose: "amc.key-history"`, `role`, `anchorFingerprint`, positive `revision`, `entries`, and `signature`. Roles are `monitor`, `auditor`, `lease`, and `session`. The fingerprint is lowercase SHA-256 of the exact PEM bytes. Entries retain their timestamps, fingerprints, PEMs, source labels and structural hash links.

The Ed25519 admission signature covers the UTF-8 bytes of `AMC_KEY_HISTORY_ADMISSION_V1`, a NUL byte, and AMC's recursively key-sorted canonical JSON for every field except `signature`. Array order is preserved. This directly signed, tagged payload is distinct from artifact digest signatures. Generic AMC digest signing accepts exactly 64 lowercase hexadecimal characters, so it cannot be used to sign an admission payload supplied as long hex.

Readers validate the strict schema, role, independently supplied anchor, key fingerprints, unique keys, hash linkage, presence of the current key, and admission signature. They do not select the anchor from the envelope. Missing, malformed, unsigned, legacy-array, or unauthenticated history contributes **no historical keys**. The current public key remains usable without an unlocked vault. A valid envelope revision is signed metadata; it is not an independently persisted anti-rollback counter.

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

`amc vault rotate-keys` requires authenticated monitor history and the matching old private key. It appends the new key and signs the admitted list with the new key. Historical monitor signatures remain verifiable under the new current anchor.

Rotation also saves an old-key-signed version 1 `amc.monitor-key-rotation` receipt, binding the previous and next PEMs/fingerprints and SHA-256 hashes of the exact previous and next history files. Its signing domain is `AMC_MONITOR_KEY_ROTATION_V1` followed by NUL and canonical JSON excluding `signature`. `verifyKeyRotationReceipt` requires an independently supplied previous fingerprint. It proves the recorded transition; callers must separately match its history hashes to the retained history files.

An external `AMC_EXPECTED_MONITOR_FINGERPRINT` or verifier option remains strict. A rotation receipt does not automatically update it. An operator can inspect the receipt and approve the new fingerprint through their existing external pin process.

Before publishing a rotation, AMC saves the old encrypted vault, metadata, monitor public key and authenticated history; the new monitor key/history; and the signed receipt under `.amc/keys/rotations/<timestamp>-<new-fingerprint>/`. The next encrypted vault is saved before the active vault changes. The directory is owner-only, and saved files are mode 0600. Publication spans multiple files: an interruption can leave history unavailable, but readers never repair or authorize it implicitly. For explicit recovery, stop writers and restore a coherent old snapshot (encrypted vault, metadata, monitor public key and monitor history), or use the staged next encrypted vault and next monitor public key/history after checking the receipt and file hashes. Keep the external pin consistent with the chosen state. Recovery snapshots retain encrypted old private keys and should follow the operator's key-retention policy.

## Notary and portable artifacts

Enabling a pinned notary explicitly admits its key with the local auditor key only after saving the signed trust configuration. Ordinary notary signing responses do not mutate key history. This preserves the existing role-wide admission model: the `source` label records provenance, not fine-grained artifact scope or revocation. A failed admission leaves the requested configuration incomplete and must be resolved explicitly; it does not make the remote key trusted.

Bundles and certificates export verified envelopes, or `null` when a role has no authenticated history. Offline verifiers authenticate those envelopes against their separately loaded direct role public keys, and stage only authenticated histories. Current-key signatures in older artifacts remain compatible; unsigned historical lists do not authorize old signers. An embedded public key establishes internal issuer consistency. Independent issuer identity still requires an external trust anchor; history authentication does not create one.
