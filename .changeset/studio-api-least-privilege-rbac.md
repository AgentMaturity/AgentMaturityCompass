---
"agent-maturity-compass": patch
---

Enforce a centralized least-privilege role matrix across protected Studio `/api/v1` routes. Viewers remain read-only, operators run workflows, approvers issue execution tickets, auditors verify or attest, and secrets, signing, identity, keys, policy, certificates, and control-plane changes require owners.
