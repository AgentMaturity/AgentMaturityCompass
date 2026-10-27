# AMC Receipt Interchange

AMC Receipt Interchange is the external verifier format for signed AMC receipt rows.

- Schema version: `amc.receipt.interchange.v1`
- Intended consumers: Passport, API, Fleet, auditors, and partner systems
- Supported receipt kinds: `score`, `policy`, `tool`, `audit`, `lifecycle`
- Signature algorithms: `ed25519` or `ecdsa-p256-sha256` (P-256, SHA-256, low-S IEEE P1363; DER and other algorithms refuse)

## Envelope

Every receipt contains:

- `schemaVersion`
- `receiptId`
- `kind`
- `issuedAt`
- `issuer`
- `subject`
- `eventRef`
- `payload`
- `payloadHash`
- `evidenceRefs`
- `sourceCitations`
- `signature`

## External verifier

An external verifier should:

1. Confirm `schemaVersion` is `amc.receipt.interchange.v1`.
2. Confirm `kind` is one of `score`, `policy`, `tool`, `audit`, or `lifecycle`.
3. Recompute `payloadHash` from canonical JSON.
4. Check required payload fields for the selected kind.
5. Verify `eventRef`, `evidenceRefs`, and `sourceCitations` are present.
6. Match `signature.algorithm` to the public key's own supported algorithm. Match `signature.publicKeyFingerprint` to the first 16 lowercase hexadecimal characters of SHA-256 of that exact public-key PEM's UTF-8 bytes (the interchange v1 convention). Verify the canonical signature over the receipt without the `signature` object.

`issuer.keyFingerprint` is signed issuer provenance supplied by the caller. It is not the actual signer binding; that binding is `signature.publicKeyFingerprint` plus a valid signature under a verifier-supplied key. These checks prove signature integrity and do not independently grant issuer authority.

Missing payload, evidence, event reference, source citation, or signature material must fail closed.
