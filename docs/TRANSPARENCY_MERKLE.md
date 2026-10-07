# Transparency Merkle Tree

AMC keeps an append-only, hash-chained transparency log and a Merkle index over its entries for inclusion proofs. Since P1-26 the index uses the standard RFC 9162 tree for new logs, and keeps the older AMC tree only so that existing artifacts still verify.

## Storage
- `.amc/transparency/log.jsonl` (hash chain) and `log.seal.json` / `log.seal.sig` (signed head, re-signed on every append)
- `.amc/transparency/merkle/leaves.jsonl`
- `.amc/transparency/merkle/roots.jsonl`
- `.amc/transparency/merkle/current.root.json`
- `.amc/transparency/merkle/current.root.sig`
- `.amc/transparency/merkle/migration.json` / `migration.sig` (only after a migration)

## Two trees

Every signed root row (`current.root.json`, `roots.jsonl`) and every proof names its tree in `algorithm`. A row or proof without the field is `amc-legacy-v1`.

| | `rfc9162-sha256` | `amc-legacy-v1` |
|---|---|---|
| Leaf hash | SHA-256 of `0x00` and the entry hash's 32 raw bytes | SHA-256 of the text `leaf:<entry hash hex>` |
| Node hash | SHA-256 of `0x01`, left and right (raw bytes) | SHA-256 of the text `node:<left hex>:<right hex>` |
| Empty tree | SHA-256 of empty input | SHA-256 of the text `empty` |
| Odd node | promoted unchanged (split at the largest power of two below n) | paired with itself |
| Proofs | audit path checked from leaf index and tree size (RFC 9162 §2.1.3); consistency proofs (§2.1.4) | left/right flags only, no tree size, no consistency proofs |

**Why the legacy tree is ambiguous.** Because an odd last node is paired with itself, the leaf lists `[a, b, c]` and `[a, b, c, c]` have the same root, and a proof does not bind a leaf index or tree size. The legacy store compensates by binding `leafCount` and `lastEntryHash` in the signed row, but proofs on their own cannot tell those trees apart, and standard tools cannot check them. The RFC 9162 tree has neither problem, and its proofs verify with any RFC 6962/9162 implementation.

New workspaces grow `rfc9162-sha256` trees. A workspace created before P1-26 keeps its legacy tree until it is migrated.

## Which tree a workspace grows

The choice is sticky and fails closed. A log grows the legacy tree only while all of these hold: the signed current root verifies and says `amc-legacy-v1` (or has no `algorithm`), no migration record exists, and the log seal, whose signature verifies and whose `lastHash` is the log's last entry, names `merkleAlgorithm: amc-legacy-v1` (or predates the field). Anything missing, unverifiable or naming `rfc9162-sha256` means RFC 9162. The seal is re-signed on every append with the tree in use, so deleting files, restoring an older signed root or editing the cached frontier cannot move a migrated log back. Only a full rollback of the log itself could, and a public anchor ([PUBLIC_ANCHORING.md](PUBLIC_ANCHORING.md)) makes that detectable. These signatures use the workspace's own auditor keys, so they are a local audit trail; portable verdicts use pinned trust ([TRUST_LIST.md](TRUST_LIST.md)).

## Migration

`amc transparency merkle rebuild --algorithm rfc9162-sha256` migrates a legacy log:

1. The legacy root must verify against the log (run `amc transparency merkle rebuild` first if it lags).
2. AMC signs `migration.json`: `{ v, ts, legacyRoot, rfc9162Root, leafCount, lastEntryHash }`, both roots over the same entries.
3. AMC appends a `MERKLE_TREE_MIGRATED` log entry (artifact kind `merkle-migration`) naming the record's SHA-256. The append re-seals the log as `rfc9162-sha256` and rebuilds the index as an RFC 9162 tree, so the migration is part of the hash chain.

Merkle verification (`amc transparency merkle root`, certificate issuance, ledger checkpoints) reports the tree in use, checks the migration record against the log's first `leafCount` entries under both trees, and fails when a log that moved to RFC 9162 has a legacy root. `--algorithm amc-legacy-v1` on an RFC 9162 log is refused. Proofs exported before the migration keep verifying as legacy proofs against the legacy roots they carry.

## Proofs and verifiers

- `amc transparency merkle prove` writes `proof.json`, `proof.sig`, `auditor.pub` and, since P1-26, the signed `root.json` and `root.sig` the proof resolves to (the export refuses when the proof's root is not the signed current root). An RFC 9162 proof carries `algorithm`, `leafIndex` and `treeSize`. When the workspace has a public anchor, the bundle also carries `anchor.note`, `anchor.receipt.json` and `anchor.consistency.json`.
- `amc transparency merkle verify-proof` takes the tree and the tree size from the bundled signed root, never from `proof.json`; a proof naming another tree fails. A bundle without `root.json` predates P1-26 and is checked as a legacy proof only. `root.sig` and `anchor.note` are admitted like `proof.sig`: by `--pubkey` or a signed trust list pinning the key for `artifact-seal`.
- Passports, assurance certificates, audit binders and bench bundles check their inclusion proofs against the signed `proofs/merkle.root.json` they carry and take the tree and tree size from it. Without a signed root, only legacy proofs are checked (and the artifact stays unanchored).
- Session anchor proofs take the tree and tree size from the signed root file they carry.
- Ledger checkpoints (P1-25) record the tree their transparency root uses.

## Commands
- `amc transparency merkle rebuild [--algorithm rfc9162-sha256]`
- `amc transparency merkle root`
- `amc transparency merkle prove --entry-hash <hash> --out proof.amcproof`
- `amc transparency merkle verify-proof proof.amcproof --pubkey <recorded-auditor.pub>`

## Console
Use `/console/transparency` for chain status + Merkle root history.

## Pinned root keys
P0-09 adds pinned issuer keys (`agent-maturity-compass/trust`, see `docs/TRUST_LIST.md`). Since PR 2, `amc passport verify` and `amc assurance cert-verify` check the inclusion proofs an artifact carries against its signed `proofs/merkle.root.json`: the root's signature must come from a key admitted for `artifact-seal` by `--pubkey` or a signed trust list, and every proof must resolve to that signed root, never to a root the proof file names for itself. Proofs without a signed root leave the artifact unanchored. Since PR 3 `amc audit binder verify` and `amc bench verify` do the same, and `verifyBenchProofBundle` itself refuses a proof whose `rootHash` differs from the signed root it is given. Since P0-51 `amc transparency merkle verify-proof` admits the signer of `proof.json`, which names the Merkle root the proof path must resolve to, only when `--pubkey` or a signed trust list pins it for `artifact-seal`; the bundled `auditor.pub` never vouches for it.
