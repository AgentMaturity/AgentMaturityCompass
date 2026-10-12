---
"agent-maturity-compass": patch
---

A4 Activate's up-front key checks name the P1-08 purpose keys their later signers use. The release and production-lease effects check the `lease` key and the `revocation-list` key (which signs every lease revocation), and a `DENY` of the deployment approval checks the `revocation-list` key, instead of the auditor role's `artifact-seal` key. A rollback checks both `artifact-seal` (its grant, freeze, Enforce restore and receipt) and `revocation-list` (its lease revocations). A revoked key now refuses these before their first side effect, as a locked vault already did: before, a revoked `revocation-list` key let the production lease be minted and let a `DENY` be recorded with its staging lease still live (409 `LEASE_REVOKE_FAILED`). The `DENY` and rollback refusals still answer 423 `A4_VAULT_LOCKED` for a revoked key.
