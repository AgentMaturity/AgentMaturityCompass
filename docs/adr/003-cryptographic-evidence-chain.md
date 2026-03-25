# ADR-003: Cryptographic Evidence Chain (Ed25519 + Merkle Trees)

## Status
Accepted

## Date
2026-03-01

## Context
Trust scores are only useful if they can't be tampered with. Traditional audit logs can be modified after the fact. We needed tamper-evident proof that assessment results haven't been altered.

## Decision
AMC uses a cryptographic evidence chain:

- **Ed25519 signatures** on all assessment artifacts (reports, evidence blobs, policy files)
- **Merkle tree proof chains** linking evidence events together
- **SHA-256 hashes** on report content for integrity verification
- **Vault-managed keys** with passphrase protection

Evidence is stored as signed blobs with an indexed journal. Verification is deterministic — `verifyAssuranceRun()` re-derives the Merkle root and checks signatures.

## Consequences
- **Positive**: Audit-grade evidence that meets ISO 42001 and SOC 2 requirements
- **Positive**: Third parties can verify scores without trusting AMC
- **Positive**: Tampered evidence is cryptographically detectable
- **Negative**: Vault unlock required for signing operations
- **Negative**: Key management adds operational complexity
- **Mitigation**: `--no-sign` flag for development/CI where signing isn't needed
