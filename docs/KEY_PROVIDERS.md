# Key providers: KMS, HSM and PKCS#11

AMC signing keys live in the workspace vault unless you configure a key provider. A key provider holds a key that never leaves it: AWS KMS, Google Cloud KMS, Azure Key Vault or Managed HSM, or a PKCS#11 token such as an HSM or SoftHSM2. AMC asks the provider to sign and checks every signature it returns against the provider's public key before using it.

This page covers the provider interface, algorithm policy, purpose binding and rotation, scoped ledger-row delegation, asynchronous producer and notary paths, error codes and retained limits. [KEY_HISTORY.md](KEY_HISTORY.md) covers authenticated key history. The repository source guide `docs/KEY_LIFECYCLE.md` covers purpose keys, key sets and rotation.

## What this release does and does not do

- **The vault stays the default.** Without a `keys` section in `.amc/amc.config.yaml`, every purpose signs with the vault exactly as before.
- **A provider-held purpose has no vault fallback.** `getSigningKey` refuses direct private-key use with `KEY_PROVIDER_HELD`, whether or not the configured provider is reachable or already bound. The explicit exception is the bound ledger-row purpose: its local delegate is served only under the current provider-signed scoped delegation, live key gates and quota. That authorization is not a fallback when remote signing fails.
- **Binding has a limited owner surface.** `bindPurposeProviderKey` supports `ledger-row` and `session`; `config-signature` has a separate candidate-config owner transition. This does not enable every purpose or every consumer. Synchronous private-key consumers refuse a provider-held purpose. Removing an editable ref never releases a committed binding or enables a vault fallback.
- **Artifact signatures can come from a provider through the notary.** In `trust.mode: NOTARY`, the notary's `KEY_PROVIDER` backend signs allowed kinds with an Ed25519 or ECDSA P-256 key held by the provider. `signDigestWithPolicyAsync` supplies the asynchronous policy/transport path; the trust-certificate CLI and HTTP producer use it and bind their signed issuer metadata to the actual described signer. Existing synchronous policy and SDK APIs remain. Each other producer and admission edge needs its own integration evidence; support in the notary alone does not qualify every artifact producer or bind the workspace's `artifact-seal` purpose.
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
- A key is parsed as SubjectPublicKeyInfo and rendered as canonical SPKI PEM. Its key id is SHA-256 of the UTF-8 bytes of that canonical PEM, as in P1-08; it is not SHA-256 of the raw DER. Equivalent PEM formatting and DER input therefore resolve to the same id. A provider-reported id that disagrees is refused. Digest verification, envelopes, issuer admission, proofs of possession, delegations and the standalone verifier use this identity.
- `keys.algorithmPolicy.allowed` narrows the algorithms a workspace accepts from its providers (default: both).
- Raw provider signing preserves the requested bytes and enforces provider limits; AWS KMS RAW messages above 4096 bytes refuse. Trust lists, key-rotation statements, revocation lists and root-rotation statements also support an explicit envelope `signatureVersion: 2`: a distinct v2 digest tag, NUL and SHA-256 of the complete v1 tagged payload. The inner record remains version 1. Absent `signatureVersion` keeps the exact v1 bytes; unknown versions, mixed holder modes and downgrade substitutions refuse. This is a declared wire format, never an implicit hash of an oversized v1 request. The repository source guide `docs/KEY_LIFECYCLE.md` lists the exact tags.

### Provider matrix

From the provider facts recorded in the P2-08 issue, checked on 5 October 2026. **Historical source facts; not independently re-verified as a complete matrix during this implementation.** Re-check before relying on a row; capabilities change, and AMC tests capabilities (key spec, mechanism list), not provider names.

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
- **To pick a key, only through its owner transition.** Ledger-row/session binding reads a new ref from one verified snapshot of `amc.config.yaml`; renewal can reuse the committed ref without a new config signature. The dedicated config-signature transition has the current config authority endorse the exact candidate before publishing the new binding and candidate pair. Once bound, signing reaches the provider by the committed key-set record. Current editable key policy can narrow or refuse signing; it is not independent positive authority.

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
# From an AMC source checkout, install the unpublished optional wrapper locally:
npm install --install-links ./packages/key-provider-pkcs11 pkcs11js@2.1.7
# pkcs11js compiles natively and needs a C++ toolchain.
```

A missing SDK fails with `KEY_PROVIDER_NOT_INSTALLED`, naming the package. The pinned SDKs and the local PKCS#11 wrapper are optional peer dependencies. Ordinary installation omits the SDKs and pkcs11js; native loading occurs only when the wrapper loader is called. The wrapper is a local package, with no registry publication claimed.

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

For `ledger-row` or `session` whose `keys.refs` names a provider key, `amc keys rotate` binds that key instead of generating one. The generic provider branch refuses `--reason`, `--overlap-days` and `--root-key`; it does not silently ignore them. `config-signature` uses its separate candidate-config transition and supports ordinary rotation reasons/overlap, while provider compromise and pinned-root recovery remain explicitly refused.

1. AMC reads the ref from the signed config (or, to renew, from the binding), then the provider describes the key; AMC checks it is a canonical Ed25519 or P-256 key whose algorithm and id derive from its key bytes, allowed by `keys.algorithmPolicy`, not exportable and not revoked.
2. The provider signs a proof of possession (`AMC_KEY_POP_V1`) for the purpose, and AMC verifies it.
3. A genuine change of effective signing key prepares a separate P1-08 rotation statement with signatures by the previous and next holders. A proof of possession or a delegation chain does not replace that statement. Preparation happens before the short synchronous publication lock; publication rechecks the exact predecessor, key-set generation, identities/refs, current refusal policy, revocations and live delegation window.
4. One key-set generation records the binding (`providers.<purpose>`: provider, ref id and version, key id, algorithm, protection and basis), public key, exact-purpose issuer history, statement and any delegation archive. It is committed and marked like every P1-08 generation. An older key set or changed pinned file refuses.
5. Later generations, such as a rotation of another purpose, carry the binding forward.

Renewal or re-binding commits a new generation. The same canonical public key, including a changed alias that still resolves to it, does not create a fake key-rotation statement. A different key requires the genuine previous/next statement; an unavailable old holder refuses the transition. Immutable histories and delegation archives retain previous issuers for their exact purpose rather than dropping them or admitting them through a broader role history. Retired keys are not automatically revoked. The current key cannot be revoked while bound; explicit retirement/revocation and independently updated portable trust remain separate operations. There is no supported provider-to-vault unbind command.

From then on:

- `signWithPurposeKey` signs through the bound key, reached by the ref the key set records: the bound key must not be revoked, the provider must be the bound provider and describe exactly the bound key, and its signature must verify. A provider that is down refuses; neither the vault nor another provider is used instead, and an edited config changes nothing until the owner binds again.
- The bound key is admitted for its purpose (`getPurposeKeyHistory`, the workspace self-check), next to the vault key.
- `amc keys export-public --purpose <p>` prints the provider's public key, key id, algorithm and a proof of possession signed by the provider, and nothing else.
- `amc keys revoke` refuses the bound key as a key still in use; re-bind first.
- `amc keys list` shows, per purpose, `provider`, `algorithm`, `protection`, `protectionBasis` and `providerKeyId`, as the key set recorded them at binding (no provider call).

## Ledger-row delegation and verification

The ledger signs every event, and a remote call per event is too slow and rate-limited. The vault's `ledger-row` key therefore keeps signing rows as a *delegate*, and the bound provider key certifies it:

```json
{ "delegation": { "type": "amc.key-delegation", "version": 2, "purpose": "ledger-row",
    "delegateKeyId": "<64 hex>", "delegatePublicKeyPem": "<Ed25519 SPKI PEM>",
    "notBefore": "2026-10-18T00:00:00.000Z", "notAfter": "2026-10-19T00:00:00.000Z",
    "maxEvents": 1000000, "issuerKeyId": "<64 hex>",
    "scope": { "workspaceId": "acme-prod", "sequence": 1, "previousDelegationSha256": null,
      "starts": { "sqlite-evidence": { "count": 0, "head": "GENESIS" },
        "jsonl-evidence": { "count": 0, "head": "GENESIS" },
        "sqlite-outcome": { "count": 0, "head": "GENESIS_OUTCOME" } },
      "checkpoints": { "sequence": 0, "sha256": null } } },
  "algorithm": "ecdsa-p256-sha256", "signature": "<base64, 64 bytes>" }
```

- New owner bindings issue scoped v2 delegations: `AMC_KEY_DELEGATION_V2`, NUL and the canonical delegation. Legacy v1 bytes retain their v1 tag. The first signed scope fixes the legacy cutover using actual stream/checkpoint heads; later scopes chain by digest and sequence. It cannot authorize a different workspace or expand another purpose.
- `amc keys rotate --purpose ledger-row` writes a fresh delegation to `.amc/keys/delegations/ledger-row.json`, valid for 24 hours from now (the maximum). Renew it at least daily; schedule the command.
- While the delegation is current, verifies under the bound provider key (which must not be revoked) and names the very key the vault serves, `getSigningKey(workspace, "ledger-row")` serves the delegate. Delegation authorization is checked before vault access; the served key identity is checked again after reading it. Invalid delegation refuses with `KEY_DELEGATION_INVALID`. SQLite and JSONL writers recheck authorization on every key use, including warmed writers; only PEM parsing is cached. Lock, expiry, revocation and keyset rollback refuse the next signature.
- SQLite evidence, JSONL evidence and SQLite outcome events share one durable use sequence/quota for a delegation. Signed row markers bind the delegation digest and use sequence. Checking a selected subset alone cannot establish the global quota: public operational readers validate actual global prefixes and selected row preimages/membership, with independently supplied or loaded trust. Internal writer self-checks do not turn self trust into anchored public admission.
- The maintained checkpoint producer signs directly through the bound ledger-row provider. Its verifier uses the authenticated legacy boundary and exact-purpose historical issuer candidates; post-boundary omission or vault/delegate fallback refuses. Main operational readers and standalone cryptographic formats have focused coverage, while reserved A4 consumers and portable transport of complete global quota context remain integration limits.

In a workspace with a key set and no committed `ledger-row` provider binding, legacy row and seal readers retain monitor keys explicitly enrolled by the owner as `source: "imported"`. The entries come from the same successfully authenticated history read; local receipt-rotation keys and an edited source label without a valid history signature gain no ledger authority. This compatibility does not prove historical provenance or independent authorship. An unpinned JSONL run can remain internally consistent while run verification stays unanchored and unsuccessful; explicit trust denials remain refusals. It does not add checkpoint keys or change checkpoint authority.

First provider binding requires the existing row and seal prefix to verify under exact ledger-purpose authority. A prefix supported only by imported monitor-role keys refuses with `KEY_DELEGATION_INVALID` before provider work and is checked again before final publication. No key is automatically copied into purpose history. Supporting that cutover would require a separate explicit migration protocol.

Delegate-key rotation is not supported by removing a ref: the committed provider binding continues to hold the purpose and vault rotation refuses. Coherent delegate rotation and provider compromise/root recovery remain owner-integration work. Renew before expiry; expired, revoked, rolled-back or exhausted delegation state refuses.

## Maintained asynchronous producers

`session` signing is direct provider signing, not ledger delegation. Maintained ticket, pairing/session, outcome-contract, workorder and signed-users producers have asynchronous paths. Tools init/reviewed signing and action-policy initialization also use the bound config-purpose signer. Publication rechecks the exact predecessor, committed purpose authority and current refusal policy after signing, plus the actual caller's authorization where supplied. Initializers and ticket/workorder issuers mirror their existing owner-mode command gates at entry and final publication/return; this does not add an agent-mode prohibition to `tools sign` or invent one for users. Signed-users HTTP mutations retain fixed provider/revocation/locked-vault status responses without exposing password verifiers or provider text. Default signed bytes and synchronous compatibility APIs remain, subject to the documented provider-held refusal.

Ticket and work-order CLI commands and direct asynchronous APIs support provider signing. The existing Studio routes for issuing tickets, creating work orders and expiring work orders also support provider signing. They revalidate the same credential, identity and current roles before returning a ticket or publishing a work-order body or revocation marker; a failed recheck refuses the operation. Direct workflow-handler calls without that trusted callback retain synchronous vault behavior and return `KEY_PROVIDER_HELD`/409 for provider-held config keys before publication.

Governor override activation signs the existing domain-tagged config-purpose payload; canary activation additionally signs its artifact-seal record before publication. Both recheck their captured authorities and the override-specific no-sign refusal in the final publication phase. The asynchronous policy signer also enforces its own declared no-sign rule at entry and after its wait. These checks do not impose a new global rule on every synchronous signing API.

Plugin initialization uses the actual policy-selected config signer or required notary, preserves existing installed rows and complete signed pairs, and checks its captured policy inputs before publication. Required-notary records are authenticated against the currently selected policy pin; a carried `signer.type` label never authorizes them. Changing or removing that pin can refuse historical plugin records. Plugin publication explicitly refuses no-sign mode even with an unlocked vault; generic synchronous policy SDK behavior is retained separately.

This scope does not qualify cold Studio supervision as a whole. The conditional plugin/action/tools startup handoffs use their asynchronous initializers, while `up`/workspace/bootstrap, other missing configuration/blob initialization, signature repair and compound policy writers still need coherent migrations. Approval cold bootstrap and other unmigrated consumers still need separate integrations. Native installed-lock admission uses the same exact-purpose/current-notary verifier on its bounded file snapshot. This does not migrate native execution approvals or compound plugin installation. No new endpoint or general-purpose binder is implied. Normal `revocation-list` binding remains refused pending lease-store and native-task integration, even though asynchronous key/certificate revocation APIs exist.

Audit-packet generation awaits the checked artifact-purpose signer and rechecks the captured key-set generation and current refusal policy immediately before its atomic archive write. Its existing four-field manifest signature and default Ed25519 signed bytes are preserved. Caller arguments are copied before the first await. A locked no-sign ephemeral key cannot publish a packet whose signature fails under the committed public key; an unlocked valid file key retains its existing no-sign behavior. This producer migration does not enable general artifact-purpose binding or change the separate synchronous transparency consumers.

Assurance-certificate issuance awaits the existing checked policy signer. It keeps the original certificate, envelope, latest-copy and hash formats, and verifies/parses the captured assurance-policy bytes from one read. The policy body/signature, run and findings must remain byte-identical through preparation; packaged run/findings hashes use those captured bytes. The original signer and complete trust policy are rechecked after awaits and before archive publication. Synchronous transparency publication remains a separate integration limit.

BOM signing has a maintained asynchronous direct API and CLI path. It preserves the default Ed25519 sidecar and independently admitted verification contract. The producer captures caller paths and exact input/destination bytes, signs outside the short sidecar lock, then checks current owner mode, selected signer, complete trust policy, committed purpose generation and file preimages after the trusted final callback. Same-file, hardlink and input-symlink aliases of the signature output are refused before Sign and before publication. The optional HTTP callback is supplied by trusted dispatch code only; absent callback retains the existing synchronous route. Registry forwarding for this new callback remains reserved and pending. Synchronous transparency publication occurs after the sidecar is written and its lock released. A later log failure reports BOM_TRANSPARENCY_PUBLICATION_INCOMPLETE with the published sigFile and original cause; the sidecar is retained, with no automatic rollback or recovery claim.

Adapter capability receipts have asynchronous builder, maintained issuer, CLI and root SDK issuer paths. They retain the existing v1 receipt, digest and signature envelope. The issuer captures actual adapter definition/configuration/hook inputs and checks them again after signing; the final receipt checks its original signer and committed purpose authority after parsing. Runtime probing remains the existing synchronous bounded operation. A trusted direct HTTP callback checks authority before and after signing; absent callback retains synchronous behavior and provider-held refusal. The shared HTTP registry forwarding remains reserved and pending. Provider-backed notary support does not enable general workspace artifact-purpose binding.

## Notary `KEY_PROVIDER` backend

In the notary's `notary.yaml`:

```yaml
notary:
  backend:
    type: KEY_PROVIDER
    ref: { provider: pkcs11, id: "pkcs11:token=amc-notary;object=notary-signing" }
```

- The maintained notary server and asynchronous CLI/API paths use `loadNotarySignerAsync`: `KEY_PROVIDER` calls the provider's Promise interface in the notary process, pins the checked public description/ref, requires nonexportability and verifies every returned signature. It does not enter the synchronous provider bridge or export private key material. Payload signing and the mandatory signing-log seal finish before the server returns a successful `/sign` response.
- The asynchronous log signs outside its short file lock, then compares the exact log/seal/signature predecessor before publishing. A concurrent append requires fresh preparation; a changed or incomplete authenticated state refuses. The three files are individually replaced, with no cross-file crash-atomicity claim.
- Existing synchronous SDK APIs, including `loadNotarySigner`, `signDigestWithPolicy`, synchronous notary log functions and `notaryStatusCli`/`notaryPubkeyCli`/`notarySignCli`/`notaryAttestCli`, remain compatible. Their `KEY_PROVIDER` route still uses `dist/keys/providerBridge.js` and can block its caller. The async wrappers for `FILE_SEALED` and `EXTERNAL_SIGNER` retain their existing local/external implementation; the external script protocol and synchronous native PKCS#11 calls are not made nonblocking merely by returning a Promise.
- The key may be Ed25519 or ECDSA P-256. Responses, attestations, log verification, shared artifact envelopes and the standalone verifier use the matching key algorithm. ECDSA signatures must be canonical low-S P1363; DER and high-S artifact signatures refuse. The old `EXTERNAL_SIGNER` script protocol remains Ed25519.
- `attestationLevel` is `HARDWARE` only when the provider describes the key as `hsm`, and every level now carries `attestationBasis` (see [HARDWARE_TRUST.md](HARDWARE_TRUST.md)).

### Asynchronous workspace-to-notary transport

`signDigestWithPolicyAsync` uses native HTTP/HTTPS or the configured Unix-domain socket. TCP destinations pass the existing workspace `bridge` egress policy and `resolveAndCheck`/`decideEgress`; the chosen allowed address is pinned for that request, and workspace egress is checked again after DNS. A DNS name does not grant a private or loopback address; use an explicit configured IP literal where the egress policy allows it. Unix sockets use local IPC without DNS or TCP. No transport follows redirects.

One 30-second transport deadline starts before DNS and covers the response body, which is capped at 1 MiB. Native DNS work may finish later; both late outcomes are consumed, and a timed-out resolution cannot open a socket. This is a per-request transport bound, not a deadline for every provider operation or an entire multi-step producer.

The asynchronous policy signer captures the signer descriptor and enforcement policy, checks current key revocation/operator distrust, verifies the response against the original signer and digest, then rechecks the descriptor, policy and refusals after the remote wait. A notary's transport pin does not create workspace purpose authority. Public artifact verification still requires independently admitted signer trust.

## Data-key wrapping

`wrapKey(ref, plaintextKey)` and `unwrapKey(ref, wrapped)` encrypt a data key under a provider-held key, for the encrypted ledger (P2-09): AWS KMS `Encrypt`/`Decrypt`, Google Cloud KMS `encrypt`/`decrypt`, Azure `wrapKey`/`unwrapKey` (`RSA-OAEP-256`, or `A256KW` on Managed HSM), PKCS#11 `CKM_AES_GCM` under a token AES key, and for development an AES-256-GCM key kept as a vault secret (file provider; creating that key is owner-mode only).

## Error codes

Remote provider failures are `KeyProviderError` values with a code, provider id and a fixed message. File-provider signing preserves the vault’s existing lock, revocation and rollback errors across its async boundary. The provider's own error text is never copied: it can carry endpoints, account ids, paths or PINs.

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
- `src/keys/purposeProviders.ts`: `loadKeyProvider`, `signWithPurposeKey`, `exportPurposePublicKey`, `bindPurposeProviderKey`.
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
- Default tests use owned in-process keys or local child processes and never call a real KMS. A separate local macOS SoftHSM2 run exercised P-256, extractability refusal and EdDSA with three passing tests. That software-token run is not Ubuntu CI or hardware qualification. Real AWS, Google or Azure keys require the operator’s credentials.

## Not in this release

- General binding of every workspace purpose, provider-to-vault unbinding, delegate-key rotation, or provider compromise/root recovery. Direct `artifact-seal`, `revocation-list`, `receipt` and `lease` binding is not enabled by low-level async APIs.
- Complete provider-backed producer integration and truthful signer metadata for every artifact format; shared-envelope support does not substitute for those producer checks.
- Complete reserved A4/approval/lease integration and portable transport of global delegated-use context. Provider trust-list/root authoring, rotation statements and async key/certificate revocation have implemented paths; this does not release reserved owners or qualify normal revocation-list provider binding.
- Verifying provider key attestations: labels stay `provider-metadata` or `configured`.
- Live tests against real cloud or hardware providers and an executed Ubuntu SoftHSM CI job. The local job definition is not a CI pass.

The recorded implementation evidence is focused source, whole-file native/compiled tests, owned local transport/process witnesses and measured guard mutations. It is not a final full-suite, hosted-CI, live-cloud, hardware-attestation or every-purpose qualification claim. Optional SDK source/type checks establish the pinned API shapes only.

Benchmark export has a maintained asynchronous direct API, CLI and root SDK path. It preserves the raw four-field bench.sig and default archive members while selecting the existing artifact-seal purpose provider. The producer captures arguments, actual run/configuration/BOM/assurance inputs and destination preimages, prepares the archive, and checks current purpose authority, no-sign mode and exact file preimages after the trusted final callback. Direct HTTP selects async only with a trusted callback; absent callback keeps the synchronous route. Additional registry forwarding remains reserved and pending. Synchronous transparency follows archive publication and may still fail afterward; no archive/log atomicity, general artifact binding or end-to-end P-256 export is claimed.

Local run-report seal verification selects authenticated artifact-seal purpose history. Distinct config-signature and revocation-list rotation keys in the broader auditor union do not gain report authority. Explicitly owner-imported historical auditor entries remain eligible only while the committed artifact purpose is unbound; their source label comes from the authenticated history envelope. Raw report/hash/signature bytes are unchanged. This local integrity predicate does not establish independent issuer admission, revocation or distrust status.

Outcome report publication has a maintained awaitable producer, CLI and Studio report route. It preserves existing scoring, raw artifact-purpose seal and JSON/Markdown bytes. Actual contract/baseline/fixed-window ledger inputs are captured before signing with the SQL connection closed; the final trusted actor, committed purpose and exact input/destination pair are checked before the short synchronous publication. Studio reauthenticates the same actor against the existing route role list after Sign. A later Markdown or synchronous transparency failure reports OUTCOME_REPORT_PUBLICATION_INCOMPLETE with confirmed published files and original cause; no pair/log/crash atomicity or automatic rollback is claimed.

The awaitable outcome-report path explicitly refuses AMC_NO_SIGN=1 before provider signing and again before publication. The retained synchronous producer keeps its existing behavior; raw diagnostic/assurance no-sign handling is a separate contract.
