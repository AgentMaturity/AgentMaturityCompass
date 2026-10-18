---
"agent-maturity-compass": patch
---

Add the source-checkout `deploy:verify` command, which fails closed unless governed receipt signatures verify against explicitly pinned monitor keys. Redact loaded lease text from public verifier result values and safely display non-scalar receipt metadata. Preserve verifier and credential-presence CLI execution when invoked through symlinks. This does not establish live deployment or full receipt-schema equivalence.
