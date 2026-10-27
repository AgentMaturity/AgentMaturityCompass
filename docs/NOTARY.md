# AMC Notary

AMC Notary is a separate signing service used to enforce a hardened trust boundary.

## What Notary does

- Signs allowed payload kinds for AMC from a sealed Ed25519 key file, the fixed Ed25519 external-signer protocol, or an Ed25519/ECDSA P-256 key held by a key provider.
- Provides signed runtime attestations (`.amcattest`).
- Maintains its own append-only, hash-chained signing log.
- Authenticates Studio->Notary requests via HMAC headers.

Notary can run without Studio and has an independent data directory.

## Quick start

```bash
# 1) Initialize notary state (defaults to ~/.amc-notary)
amc notary init

# 2) Start notary
amc notary start

# 3) Inspect status and pubkey
amc notary status
amc notary pubkey

# 4) Generate and verify attestation bundle
amc notary attest --out /tmp/current.amcattest
amc notary verify-attest /tmp/current.amcattest --pubkey <recorded-notary.pub>  # the key printed by `amc notary pubkey`, recorded out of band
```

## Enable Notary trust mode in workspace

```bash
# pin the notary public key and require SOFTWARE or HARDWARE attestation
amc trust enable-notary \
  --base-url http://127.0.0.1:4343 \
  --pin /path/to/notary.pub \
  --require HARDWARE

amc trust status
```

When enabled, AMC checks:
- Notary reachability
- pinned fingerprint match
- attestation level policy

If checks fail, readiness is fail-closed and critical signing operations are blocked.

## Signing backends

## 1) File-sealed key backend

- Notary stores encrypted private key material at rest.
- Passphrase is required via `AMC_NOTARY_PASSPHRASE_FILE` (or interactive CLI in local mode).

## 2) External signer backend

Notary can delegate signing to an external executable using deterministic CLI protocol:

```text
<cmd> sign --kind <KIND> --payload-sha256 <hex> --payload-b64 <base64> --out <json>
```

AMC includes testable reference script:
- `/Users/sid/AgentMaturityCompass/scripts/fake-external-signer.mjs`

## 3) Key provider backend (P2-08)

The notary signs with an Ed25519 or ECDSA P-256 key held by AWS KMS, Google Cloud KMS, Azure Key Vault or a PKCS#11 token (hardware, or SoftHSM2 for software-token tests). Set the backend in `notary.yaml`:

```yaml
notary:
  backend:
    type: KEY_PROVIDER
    ref: { provider: aws-kms, id: "arn:aws:kms:eu-west-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab" }
```

Credentials, the PKCS#11 library path and PIN come from the notary's environment ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)), never from this file. The maintained server uses `loadNotarySignerAsync` to call `KEY_PROVIDER` through its Promise interface in the notary process. The checked ref/public description is pinned, exportable keys refuse, and every signature is checked against that public key. The response algorithm comes from the verified public key. P-256 signatures use low-S IEEE P1363; DER and high-S artifact signatures refuse.

The server awaits payload signing and its mandatory log seal before returning `/sign` success. Log sealing occurs outside the short publication lock; publication rechecks the exact log/seal/sidecar predecessor and retries a concurrent append. Partial cross-file publication fails verification; there is no transaction across all three file replacements.

The maintained notary CLI commands and crypto/export HTTP handlers use their asynchronous status, public-key, sign and attestation functions. Existing synchronous SDK exports remain, including `loadNotarySigner`, `notaryStatusCli`, `notaryPubkeyCli`, `notarySignCli` and `notaryAttestCli`; their `KEY_PROVIDER` route still uses a bridge child and can block. The fixed external script implementation and native synchronous token calls retain their existing execution behavior.

Workspace artifact producers can use `signDigestWithPolicyAsync`. Its native HTTP/HTTPS transport enforces workspace `bridge` egress and checked DNS/address pinning, follows no redirects, caps response bodies at 1 MiB, and starts a 30-second request deadline before DNS. Late DNS completion cannot open a socket after timeout. Configured Unix sockets use local IPC. The signer/policy/revocation/distrust checks run again after the remote wait. See [KEY_PROVIDERS.md](KEY_PROVIDERS.md#asynchronous-workspace-to-notary-transport) for the precise boundary.

The trust-certificate CLI and HTTP producer use this asynchronous policy path and bind their issuer metadata to the actual selected signer. Other artifact producers and public admission edges require their own integration evidence; the backend alone does not qualify all of them or enable direct workspace `artifact-seal` provider binding. Owned fake-provider and local-transport tests do not establish live cloud/HSM, CI, hardware-attestation or all-producer qualification.

## Attestation level and its basis

Every `/readyz`, `/pubkey`, `/sign` answer and attestation carries `attestationLevel` and `attestationBasis`:

| Backend | `attestationLevel` | `attestationBasis` |
|---|---|---|
| `FILE_SEALED` | `SOFTWARE` | `configured` |
| `EXTERNAL_SIGNER` | `HARDWARE` when the signer claims `hardware: true` | `provider-reported`: the signer's own claim, not checked by AMC |
| `KEY_PROVIDER` | `HARDWARE` only when the provider describes the key as `hsm` | `provider-metadata` (KMS key metadata) or `configured` (a PKCS#11 token's `AMC_PKCS11_PROTECTION`) |

No basis is "attested": AMC does not verify hardware attestations. `trust enable-notary --require HARDWARE` checks the level only, so with an external signer it relies on that signer's own claim.

## Auth and isolation

- Notary endpoints require HMAC request auth for signing/log access.
- Shared auth secret is stored in vault (`vault:notary/auth`).
- Agents cannot use leases to call Notary endpoints.

## Deployment notes

Compose and Helm include Notary wiring:
- Compose: `/Users/sid/AgentMaturityCompass/deploy/compose`
- Helm: `/Users/sid/AgentMaturityCompass/deploy/helm/amc`

Recommended:
- keep Notary on internal-only network
- persist Notary data dir separately from workspace
- rotate pinning and secrets with controlled change windows

## Key rotation / re-pinning

When Notary key changes:
1. export new Notary pubkey (`amc notary pubkey`)
2. update trust pin (`amc trust enable-notary --pin ...`)
3. verify status (`amc trust status`)
4. confirm readiness and trust page health

## Operations runbook

- Monitor:
  - `amc notary status`
  - `amc notary log-verify`
  - Studio `/readyz`
- Back up:
  - Notary dir (`~/.amc-notary` or `AMC_NOTARY_DIR`) securely
- Validate:
  - periodic attestation generation/verification
  - trust pin and clock skew checks remain healthy
