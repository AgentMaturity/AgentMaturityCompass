# AMC Notary

AMC Notary is a separate signing service used to enforce a hardened trust boundary.

## What Notary does

- Signs allowed payload kinds for AMC with Ed25519, from a sealed key file, an external signer or a key held by a key provider.
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

The notary signs with an Ed25519 key held by AWS KMS, Google Cloud KMS or a PKCS#11 token (an HSM, or SoftHSM2 for testing). Set the backend in `notary.yaml`:

```yaml
notary:
  backend:
    type: KEY_PROVIDER
    ref: { provider: aws-kms, id: "arn:aws:kms:eu-west-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab" }
```

Credentials, the PKCS#11 library path and PIN come from the notary's environment ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)), never from this file. Each signature runs the provider in a child process and is checked against the provider's public key before the notary returns it. An ECDSA key (Azure Key Vault, HSM-protected Google keys) is refused here: the artifact envelopes the notary signs are Ed25519-only in this release.

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
