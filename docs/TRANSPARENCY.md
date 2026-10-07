# Transparency Log

AMC maintains an append-only transparency log for issuance and governance events.

## Files
- `/.amc/transparency/log.jsonl`
- `/.amc/transparency/log.seal.json`
- `/.amc/transparency/log.seal.sig`

Entries are hash-chained (`prev` -> `hash`) and seals are auditor-signed.

## Tracked Events
Examples:
- cert issuance/revocation
- bundle export
- benchmark export
- BOM signing
- policy signing / policy-pack application
- approval-related policy issuance records

## Commands
- `amc transparency init`
- `amc transparency verify`
- `amc transparency tail --n 50`
- `amc transparency export --out transparency.amctlog`
- `amc transparency verify-bundle transparency.amctlog --pubkey <recorded-auditor.pub>` (the bundled `auditor.pub` never vouches for the seal; without a pin it exits 1)

## Enforcement
If chain or seal verification fails:
- verification reports explicit errors
- issuance paths can be blocked (e.g. cert issuance)
- trust/integrity penalties apply in diagnostics.
