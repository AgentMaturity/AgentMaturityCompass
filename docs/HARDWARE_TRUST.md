# Notary signing boundary and hardware labels

AMC supports a hardened signing boundary through **AMC Notary**. In Notary mode, critical signatures are produced by a separate process and verified offline with pinned public keys. Whether that process's key sits in hardware is a label with a stated basis, never a verified fact: AMC does not verify hardware attestations.

## Why this exists

The main risk is not only bad model output, but compromised signing trust:
- an evaluated agent trying to forge “official” artifacts
- a compromised Studio process trying to rewrite history
- key exfiltration from the app process

Notary reduces this by moving signing away from Studio and enforcing a fail-closed trust policy.

## Threat model

### Protected against
- Agent-side tampering of signed artifacts.
- Studio-side signing bypass when `trust.mode=NOTARY` is enforced.
- Silent key substitution via pinned Notary fingerprint checks.
- Replay/unauthorized signing attempts (HMAC-authenticated Notary API + signed Notary log).

### Not fully protected against
- Full host compromise of both Studio and Notary plus vault/passphrase compromise.
- Hardware vendor trust failures when using external signer integrations.
- A false `hardware` claim by an external signer: its level is provider-reported.

## Attestation levels and their basis

AMC emits a signed Notary attestation with a level and the basis of that level (P2-08):
- `SOFTWARE`, basis `configured`: the file-sealed key backend.
- `HARDWARE` or `SOFTWARE`, basis `provider-reported`: an external signer's own `hardware` claim (`HSM|TPM|KMS|SMARTCARD|ENCLAVE|OTHER`). AMC checks that its signatures verify, not that the claim is true.
- `HARDWARE` or `SOFTWARE`, basis `provider-metadata` or `configured`: a key held by a key provider ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)). `HARDWARE` only when the provider's key metadata (AWS KMS origin, Google protection level, Azure `EC-HSM`) or, for PKCS#11, the operator's `AMC_PKCS11_PROTECTION` says `hsm`.

No basis is "attested". `HARDWARE` is operational evidence of where the key is said to be, as strong as its basis, and not a security guarantee by itself.

## Fail-closed behavior

When `trust.mode=NOTARY` and required checks fail (Notary unavailable, fingerprint mismatch, insufficient attestation level), AMC:
- returns `503` on `/readyz`
- blocks critical issuance/signing flows (certs, bundles, release manifests, lock/signature artifacts)
- logs and surfaces explicit trust failure reasons

## Verification model

All critical artifacts remain offline-verifiable through:
- signature envelope (`alg`, `pubkey`, `fingerprint`, `sig`)
- Notary trust pinning (`trust.yaml`)
- transparency + Merkle updates tied to issuance events

This strengthens physical/virtual trust bridging for risk assurance and continuous renewal.
