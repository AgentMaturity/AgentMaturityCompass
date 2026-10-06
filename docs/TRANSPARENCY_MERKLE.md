# Transparency Merkle Tree

AMC keeps the existing append-only transparency log and adds a Merkle index for inclusion proofs.

## Storage
- `.amc/transparency/log.jsonl` (hash chain)
- `.amc/transparency/merkle/leaves.jsonl`
- `.amc/transparency/merkle/roots.jsonl`
- `.amc/transparency/merkle/current.root.json`
- `.amc/transparency/merkle/current.root.sig`

## Guarantees
- Every transparency entry hash becomes a Merkle leaf.
- Current root is signed by auditor key.
- Inclusion proofs are offline-verifiable.
- Invalid root signature blocks cert issuance.

## Commands
- `amc transparency merkle rebuild`
- `amc transparency merkle root`
- `amc transparency merkle prove --entry-hash <hash> --out proof.amcproof`
- `amc transparency merkle verify-proof proof.amcproof`

## Console
Use `/console/transparency` for chain status + Merkle root history.

## Pinned root keys (planned)
P0-09 adds pinned issuer keys (`agent-maturity-compass/trust`, see `docs/TRUST_LIST.md`). Once its PR 2 and PR 3 wire the verifiers, a signed root counts only when its key is admitted for `artifact-seal` by `--pubkey` or a signed trust list, and bench inclusion proofs are checked against the signed root. Until then these commands behave as before.
