---
"agent-maturity-compass": major
---

Lease revocation lists are now published only as a verified pair. `amc lease revoke`, `amc lease resign-revocations` and the first-store bootstrap in `amc lease issue` sign the exact list bytes and check that signature against the auditor key history before writing anything; a locked vault or `AMC_NO_SIGN=1` (ephemeral keys) now refuses with "would not verify" and leaves both files unchanged. Before, `amc lease issue` with a locked vault left an unsigned `revocations.json` behind, and a revoke under `AMC_NO_SIGN=1` published a list that every consumer then refused. Both files are written under temporary names and renamed list-first, under the same lock `amc lease revoke` takes. A crash between the two renames still leaves a pair that does not verify, so every consumer refuses every lease until the owner runs `amc lease resign-revocations` (docs/LEASES.md).
