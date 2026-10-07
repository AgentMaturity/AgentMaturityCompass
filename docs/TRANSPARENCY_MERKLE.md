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
- `amc transparency merkle verify-proof proof.amcproof --pubkey <recorded-auditor.pub>`

## Console
Use `/console/transparency` for chain status + Merkle root history.

## Pinned root keys
P0-09 adds pinned issuer keys (`agent-maturity-compass/trust`, see `docs/TRUST_LIST.md`). Since PR 2, `amc passport verify` and `amc assurance cert-verify` check the inclusion proofs an artifact carries against its signed `proofs/merkle.root.json`: the root's signature must come from a key admitted for `artifact-seal` by `--pubkey` or a signed trust list, and every proof must resolve to that signed root, never to a root the proof file names for itself. Proofs without a signed root leave the artifact unanchored. Since PR 3 `amc audit binder verify` and `amc bench verify` do the same, and `verifyBenchProofBundle` itself refuses a proof whose `rootHash` differs from the signed root it is given. Since P0-51 `amc transparency merkle verify-proof` admits the signer of `proof.json`, which names the Merkle root the proof path must resolve to, only when `--pubkey` or a signed trust list pins it for `artifact-seal`; the bundled `auditor.pub` never vouches for it.
