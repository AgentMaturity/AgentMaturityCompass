# Key providers: KMS, HSM and PKCS#11

AMC signing keys live in the workspace vault unless you configure a key provider. A key provider holds a key that never leaves it: AWS KMS, Google Cloud KMS, Azure Key Vault or Managed HSM, or a PKCS#11 token such as an HSM or SoftHSM2. AMC asks the provider to sign and checks every signature it returns against the provider's public key before using it.

This page covers what P2-08 added: the provider interface, the algorithm policy, provider configuration, binding a provider key to a signing purpose, the ledger-row delegation, the notary `KEY_PROVIDER` backend, error codes and failure modes. [KEY_LIFECYCLE.md](KEY_LIFECYCLE.md) covers purpose keys, key sets and rotation.

## What this release does and does not do

- **The vault stays the default.** Without a `keys` section in `.amc/amc.config.yaml`, every purpose signs with the vault exactly as before.
- **A purpose configured to a provider never signs with the vault.** As soon as `keys.refs.<purpose>` names a provider key, `getSigningKey` refuses that purpose with `KEY_PROVIDER_HELD`, whether or not the key is bound yet, whether the provider is reachable or not.
- **Only `ledger-row` can be bound in this release.** Most AMC signers still take a vault key synchronously (`getSigningKey`). Binding any other purpose would make all of them refuse, including the transparency-log seal written by every key rotation. Those call sites have to move to `signWithPurposeKey` first (follow-up). Until then, `keys.refs` for another purpose only makes its signers refuse; remove the ref to sign with the vault again.
- **Artifact signatures can come from a provider through the notary.** The notary's `KEY_PROVIDER` backend signs every kind that `signDigestWithPolicy` sends to the notary in `trust.mode: NOTARY` (transparency and Merkle roots, certificates, bundles, BOMs, release and backup manifests and the other notary kinds), with an Ed25519 key held by the provider.
- **Protection labels are never "attested".** `protectionBasis` says where a label came from: `provider-metadata` (the provider's own key metadata) or `configured` (the operator's statement). Verifying a provider's key attestation is a follow-up.

## Algorithm policy

Defined in `src/keys/algorithmPolicy.ts`.

| Algorithm | Signed bytes | Encoding | Used when |
|---|---|---|---|
| `ed25519` (preferred) | exactly what AMC signs today: a 32-byte digest or a domain-separated payload | 64-byte Ed25519 signature | the provider offers Ed25519 |
| `ecdsa-p256-sha256` | ECDSA over P-256 with SHA-256 of the same bytes | IEEE P1363: r then s, 32 bytes each | Ed25519 is not available (Azure; HSM-protected Google keys) |

- A provider that answers in DER (AWS KMS and Google Cloud KMS for ECDSA) is converted by a strict DER parser: short-form lengths, minimal positive integers, 0 < r, s < n, no trailing bytes. Anything else is refused. Every ECDSA answer is then brought to low S (s ≤ n/2), the same signature in its one canonical form.
- One encoding per signature: Ed25519 is 64 bytes with S below the group order; ECDSA is P1363 (64 bytes) with 0 < r < n and 0 < s ≤ n/2. A DER signature, a high-S twin (r, n − s), an unreduced Ed25519 S, another curve, another key type, or an algorithm that is not the key's own never verifies.
- The algorithm always comes from the pinned key: a provider's description, an envelope's `alg` or a statement's `algorithm` must agree with it and never selects one.
- A key's identity comes from its DER SubjectPublicKeyInfo bytes: the key id is sha256 of the canonical PEM rendered from that DER (the id P1-08 already uses). PEM line breaks, CRLF, surrounding whitespace or the DER itself give the same id; a provider-reported id that is not this id is refused. This holds for digest verification (`verifyHexDigest`), signature envelopes, trust-list entries and roots, issuer admission, proofs of possession, delegations and the standalone verifier (`packages/verifier`).
- `keys.algorithmPolicy.allowed` narrows the algorithms a workspace accepts from its providers (default: both).
- AMC's own messages fit every provider's limit (the largest is a delegation or a proof of possession, under 1 KiB). AWS KMS signs raw messages of at most 4096 bytes; a longer message is refused, never hashed into another form.

### Provider matrix

From the provider facts recorded in the P2-08 issue, checked on 5 October 2026. **Not re-checked in this session (no network access).** Re-check before relying on a row; capabilities change, and AMC tests capabilities (key spec, mechanism list), not provider names.

| Provider | Algorithm | Key type and mechanism | Protection AMC reports | Source |
|---|---|---|---|---|
| AWS KMS | `ed25519` | key spec `ECC_NIST_EDWARDS25519`, `ED25519_SHA_512` with MessageType `RAW` (pure Ed25519); announced 7 Nov 2025 | `hsm` (origin `AWS_KMS` or `AWS_CLOUDHSM`), `external` (`EXTERNAL_KEY_STORE`), else `unknown` | https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html (5 Oct 2026) |
| AWS KMS | `ecdsa-p256-sha256` | key spec `ECC_NIST_P256`, `ECDSA_SHA_256`, DER answer | as above | same |
| Google Cloud KMS | `ed25519` | `EC_SIGN_ED25519` (PureEdDSA over the data); SOFTWARE protection level only | `software` | https://cloud.google.com/kms/docs/algorithms (5 Oct 2026) |
| Google Cloud KMS | `ecdsa-p256-sha256` | `EC_SIGN_P256_SHA256` over a SHA-256 digest, DER answer | the key version's protection level: `hsm`, `software` or `external` | same |
| Azure Key Vault / Managed HSM | `ecdsa-p256-sha256` | key type `EC` or `EC-HSM`, curve P-256, `ES256` over a SHA-256 digest; no Ed25519 | `hsm` for `EC-HSM`, `software` for `EC` | https://learn.microsoft.com/azure/key-vault/keys/about-keys-details (5 Oct 2026) |
| PKCS#11 | `ecdsa-p256-sha256` | `CKM_ECDSA` over a SHA-256 digest | what `AMC_PKCS11_PROTECTION` states, basis `configured`; `unknown` when unset | PKCS#11 v3.0 |
| PKCS#11 | `ed25519` | `CKM_EDDSA` (PKCS#11 v3.0), only when the token lists the mechanism; SoftHSM2 needs `--enable-eddsa` | as above | PKCS#11 v3.0; https://github.com/softhsm/SoftHSMv2 |
| file (vault) | `ed25519` | vault key, development only | `software`, basis `configured`, exportable | — |

## Configuration

The `keys` section of `.amc/amc.config.yaml` holds identifiers only: never credentials, PINs, endpoints or library paths. The file is editable by anyone who can write the workspace, so AMC reads it in two ways:

- **To refuse, as it stands.** A ref, `keys.provider` or `requireNonExportable: true` makes the vault refuse for the purposes it names, signed or not.
- **To pick a key, only when signed.** Binding a key (`amc keys rotate`) reads the ref from an `amc.config.yaml` whose signature (`amc verify --sign-config`, the `config-signature` key) verifies, from one read of the file: the bytes verified are the bytes used. After an edit, sign the file again before binding. Once bound, the key set records the ref and signing reaches the key by that record, never by the config; renewing the bound key needs no signature.

Limit: a workspace writer who rewrites the file can remove `requireNonExportable` or a ref for a purpose that is not bound yet; bound purposes are held by the key set.

```yaml
keys:
  provider: file                  # default provider for refs that name none (file is the vault)
  refs:
    ledger-row: { provider: aws-kms, id: "arn:aws:kms:eu-west-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab" }
  requireNonExportable: false     # true refuses the vault (file provider) for every purpose without a provider key
  algorithmPolicy: { allowed: [ed25519, ecdsa-p256-sha256] }
```

| Provider | `id` | `version` | Credentials and secrets (environment only) |
|---|---|---|---|
| `aws-kms` | key ARN, key id, `mrk-…` id or `alias/…`; the region comes from the ARN | none (refused) | the AWS SDK default chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, instance or pod role); `AWS_REGION` when the id is not an ARN |
| `gcp-kms` | `projects/<p>/locations/<l>/keyRings/<r>/cryptoKeys/<k>` | the cryptoKeyVersion to sign with (required) | Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` or workload identity) |
| `azure-kv` | `https://<vault>.vault.azure.net/keys/<name>[/<version>]`, or a Managed HSM, China or US Government host | optional | `DefaultAzureCredential` (environment, workload or managed identity, Azure CLI) |
| `pkcs11` | `pkcs11:token=<token label>;object=<key label>` (RFC 7512, percent-encoded) | none (refused) | `AMC_PKCS11_MODULE` (library path), `AMC_PKCS11_PIN` or `AMC_PKCS11_PIN_FILE`, optional `AMC_PKCS11_PROTECTION` (`hsm` or `software`) |

A ref whose `id` does not have its provider's shape is refused before any call, so a workspace writer cannot point AMC at another host or make it load a library. Without a `version`, Azure signs with the key's current version; AMC still checks the signature against the key the key set binds.

The provider SDKs are not installed with AMC. Install the one you use next to it:

```bash
npm install @aws-sdk/client-kms@3.1146.0                       # aws-kms
npm install @google-cloud/kms@6.2.1                            # gcp-kms
npm install @azure/keyvault-keys@4.10.2 @azure/identity@4.13.3  # azure-kv
npm install pkcs11js@2.1.7                                     # pkcs11 (compiles natively: needs a C++ toolchain)
```

A missing SDK fails with `KEY_PROVIDER_NOT_INSTALLED`, naming the package. They are not yet declared as optional peer dependencies: that needs a lockfile update with network access (follow-up).

### Least-privilege access

Grant only signing, reading the public key and, for data-key wrapping (P2-09), encrypt and decrypt. These are suggestions to check against your provider's documentation; they were not re-checked in this session.

- **AWS KMS** (key policy or IAM): `kms:Sign`, `kms:GetPublicKey` and `kms:DescribeKey` on the signing key; `kms:Encrypt` and `kms:Decrypt` on the wrapping key.
- **Google Cloud KMS** (custom role on the key): `cloudkms.cryptoKeyVersions.useToSign`, `cloudkms.cryptoKeyVersions.viewPublicKey`; for wrapping `cloudkms.cryptoKeyVersions.useToEncrypt` and `cloudkms.cryptoKeyVersions.useToDecrypt`.
- **Azure Key Vault** (access policy key permissions, or the matching data actions in an RBAC role): `get` and `sign` on the signing key; `get`, `wrapKey` and `unwrapKey` on the wrapping key (RSA, or AES on Managed HSM).
- **PKCS#11**: a user PIN for one token. The private key must be `CKA_EXTRACTABLE` false and `CKA_SENSITIVE` true; AMC refuses any other key.

## Binding a provider key to a purpose

```bash
# keys.refs.ledger-row names the provider key, then (owner mode, vault passphrase):
amc keys rotate --purpose ledger-row
amc keys list
```

For a purpose whose `keys.refs` names a provider key, `amc keys rotate` binds that key instead of generating one (`--reason`, `--overlap-days` and `--root-key` are refused):

1. AMC reads the ref from the signed config (or, to renew, from the binding), then the provider describes the key; AMC checks it is a canonical Ed25519 or P-256 key whose algorithm and id derive from its key bytes, allowed by `keys.algorithmPolicy`, not exportable and not revoked.
2. The provider signs a proof of possession (`AMC_KEY_POP_V1`) for the purpose, and AMC verifies it.
3. One key-set generation records the binding (`providers.<purpose>`: provider, ref id and version, key id, algorithm, protection and basis) and pins `.amc/keys/<purpose>-provider.pub` by digest. It is committed and marked like every P1-08 generation, so restoring an older `keyset.json` (from before the binding) is `ROLLBACK_DETECTED`, and a changed public key file refuses signing.
4. Later generations, such as a rotation of another purpose, carry the binding forward.

Running the command again keeps the generation when the configured ref is the bound one (it renews the delegation, needing no config signature). Pointing `keys.refs` at another key and running it again binds that key in a new generation (re-binding) and drops the previous provider key from the purpose's admitted keys. There is no command that moves a bound purpose back to the vault in this release.

From then on:

- `signWithPurposeKey` signs through the bound key, reached by the ref the key set records: the bound key must not be revoked, the provider must be the bound provider and describe exactly the bound key, and its signature must verify. A provider that is down refuses; neither the vault nor another provider is used instead, and an edited config changes nothing until the owner binds again.
- The bound key is admitted for its purpose (`getPurposeKeyHistory`, the workspace self-check), next to the vault key.
- `amc keys export-public --purpose <p>` prints the provider's public key, key id, algorithm and a proof of possession signed by the provider, and nothing else.
- `amc keys revoke` refuses the bound key as a key still in use; re-bind first.
- `amc keys list` shows, per purpose, `provider`, `algorithm`, `protection`, `protectionBasis` and `providerKeyId`, as the key set recorded them at binding (no provider call).

## Ledger-row delegation

The ledger signs every event, and a remote call per event is too slow and rate-limited. The vault's `ledger-row` key therefore keeps signing rows as a *delegate*, and the bound provider key certifies it:

```json
{ "delegation": { "type": "amc.key-delegation", "version": 1, "purpose": "ledger-row",
    "delegateKeyId": "<64 hex>", "delegatePublicKeyPem": "<Ed25519 SPKI PEM>",
    "notBefore": "2026-10-18T00:00:00.000Z", "notAfter": "2026-10-19T00:00:00.000Z",
    "maxEvents": 1000000, "issuerKeyId": "<64 hex>" },
  "algorithm": "ecdsa-p256-sha256", "signature": "<base64, 64 bytes>" }
```

- Signed bytes: `AMC_KEY_DELEGATION_V1`, one 0x00 byte, then the canonical statement. Only the canonical encoding is accepted.
- `amc keys rotate --purpose ledger-row` writes a fresh delegation to `.amc/keys/delegations/ledger-row.json`, valid for 24 hours from now (the maximum). Renew it at least daily; schedule the command.
- While the delegation is current, verifies under the bound provider key (which must not be revoked) and names the very key the vault serves, `getSigningKey(workspace, "ledger-row")` serves the delegate. Every refusal is decided before the vault is touched. Otherwise it refuses with `KEY_DELEGATION_INVALID`, and no new ledger connection signs until the delegation is renewed. Limit: an open ledger connection (and the JSONL session store) caches the key it loaded and keeps signing past the window until it is closed, so an expired delegation stops a long-running process such as Studio only when it reopens the ledger (follow-up: check the window per append).
- A verifier admits a delegate's row only through a delegation from a provider key it pinned, valid at the row's signing time, and only for rows up to `maxEvents` (`admitDelegatedRow`). The workspace's own verification admits the vault ledger-row key as before. Wiring delegation admission into `amc verify` and the standalone verifier is a follow-up.
- Checkpoints and other ledger-row signatures made through `signWithPurposeKey` are signed by the provider key directly.

To rotate the delegate key itself, remove `keys.refs.ledger-row`, run `amc keys rotate --purpose ledger-row` (a vault rotation), put the ref back and run it again to delegate the new key. Rows stop between the two steps.

## Notary `KEY_PROVIDER` backend

In the notary's `notary.yaml`:

```yaml
notary:
  backend:
    type: KEY_PROVIDER
    ref: { provider: pkcs11, id: "pkcs11:token=amc-notary;object=notary-signing" }
```

- The notary reaches the provider through a bridge child process (`dist/keys/providerBridge.js`), one per call, so its synchronous signing path is unchanged. The child reads credentials from the environment and answers with JSON; a failure crosses as a code and AMC's own message, never the provider's text.
- The key must be Ed25519 (AWS KMS, Google Cloud KMS software keys, or a PKCS#11 token with `CKM_EDDSA`): the artifact envelopes the notary signs are Ed25519-only in this release. Azure Key Vault and HSM-protected Google keys cannot back the notary yet.
- `attestationLevel` is `HARDWARE` only when the provider describes the key as `hsm`, and every level now carries `attestationBasis` (see [HARDWARE_TRUST.md](HARDWARE_TRUST.md)).

## Data-key wrapping

`wrapKey(ref, plaintextKey)` and `unwrapKey(ref, wrapped)` encrypt a data key under a provider-held key, for the encrypted ledger (P2-09): AWS KMS `Encrypt`/`Decrypt`, Google Cloud KMS `encrypt`/`decrypt`, Azure `wrapKey`/`unwrapKey` (`RSA-OAEP-256`, or `A256KW` on Managed HSM), PKCS#11 `CKM_AES_GCM` under a token AES key, and for development an AES-256-GCM key kept as a vault secret (file provider; creating that key is owner-mode only).

## Error codes

Every provider failure is a `KeyProviderError` with a code, the provider id and a fixed message. The provider's own error text is never copied: it can carry endpoints, account ids, paths or PINs.

| Code | Suggested HTTP status | Meaning |
|---|---|---|
| `KEY_PROVIDER_UNAVAILABLE` | 503 | unreachable, timed out, slot or token missing, or an unclassified provider error |
| `KEY_PROVIDER_AUTH_FAILED` | 503 | credentials, PIN or login refused |
| `KEY_PROVIDER_KEY_REFUSED` | 409 | key missing, disabled, exportable or extractable, of a refused algorithm, not the bound key, a ref of the wrong shape, or a signature that does not verify |
| `KEY_PROVIDER_NOT_INSTALLED` | 501 | the provider's SDK, pkcs11js or `AMC_PKCS11_MODULE` is missing |
| `KEY_PROVIDER_HELD` | 409 | the purpose's key is held by a provider; a synchronous signer cannot use it |
| `KEY_DELEGATION_INVALID` | 409 | the ledger-row delegate has no current, valid delegation |

A locked vault still fails as before ("Vault locked", which A4 maps to `A4_VAULT_LOCKED`, 423), and a revoked key with `KeyRevokedError` (`A4_KEY_REVOKED`, 409). No provider message contains "vault locked".

## Interface

For code that builds on providers (P2-09 data-key wrapping, P2-36 A4):

- `src/keys/provider.ts`: `KeyProvider`, `KeyRef`, `KeyDescription`, `KeyProtection`, `SigningAlgorithm`, `KEY_PROVIDER_IDS`, `KeyProviderError`, `KEY_PROVIDER_ERRORS`, `checkedDescription`, `signChecked`.
- `src/keys/algorithmPolicy.ts`: `SIGNING_ALGORITHMS`, `signingKeyIdentity`, `canonicalSigningKey`, `signingKeyId`, `verifyCanonical`, `verifyWithKey`, `derToP1363`, `lowS`.
- `src/keys/purposeProviders.ts`: `loadKeyProvider`, `signWithPurposeKey`, `exportPurposePublicKey`, `bindPurposeProviderKey`, `BINDABLE_PURPOSES`.
- `src/keys/delegation.ts`: `issueDelegation`, `verifyDelegation`, `admitDelegatedRow`, `encodeDelegation`.

```ts
interface KeyProvider {
  readonly id: "file" | "aws-kms" | "gcp-kms" | "azure-kv" | "pkcs11";
  describe(ref: KeyRef): Promise<KeyDescription>;
  sign(ref: KeyRef, message: Uint8Array): Promise<Uint8Array>; // 64 bytes: Ed25519, or P-256 in P1363
  wrapKey?(ref: KeyRef, plaintextKey: Uint8Array): Promise<Uint8Array>;
  unwrapKey?(ref: KeyRef, wrapped: Uint8Array): Promise<Uint8Array>;
}
```

`KeyDescription.exportable` is `true` only for the file provider (the vault); every other provider describes `false` or refuses the key.

## Testing without credentials

- `tests/keys/providerContract.test.ts` runs one contract suite against the vault and in-process fakes of AWS KMS, Google Cloud KMS, Azure Key Vault and a PKCS#11 token, and checks request shapes. Nothing touches the network.
- `tests/keys/pkcs11Softhsm.test.ts` runs against a real SoftHSM2 token when `AMC_TEST_PKCS11_MODULE` names `libsofthsm2.so` and pkcs11js is installed; the CI job `pkcs11-softhsm` does that on Ubuntu with a token, PINs and keys created per run.
- No test or script calls a real KMS. Running against a real AWS, Google or Azure key needs the operator's credentials and is the operator's step.

## Not in this release

- Binding purposes other than `ledger-row`, which needs their synchronous signers moved to `signWithPurposeKey`; moving a bound purpose back to the vault.
- ECDSA artifact envelopes from `signDigestWithPolicy` (twelve artifact schemas pin `alg: ed25519`), so the notary takes Ed25519 provider keys only.
- Delegation admission in `amc verify` and the standalone verifier; provider-signed trust lists, rotation statements and revocation lists.
- Verifying provider key attestations: labels stay `provider-metadata` or `configured`.
- Optional peer declarations for the provider SDKs, and live tests against real providers.
