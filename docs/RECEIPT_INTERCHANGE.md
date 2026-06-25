# AMC Receipt Interchange

AMC Receipt Interchange is the external verifier format for signed AMC receipt rows.

- Schema version: `amc.receipt.interchange.v1`
- Intended consumers: Passport, API, Fleet, auditors, and partner systems
- Supported receipt kinds: `score`, `policy`, `tool`, `audit`, `lifecycle`
- Signature algorithm: `ed25519`

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
6. Verify the `ed25519` signature over the receipt without the `signature` object.

Missing payload, evidence, event reference, source citation, or signature material must fail closed.
