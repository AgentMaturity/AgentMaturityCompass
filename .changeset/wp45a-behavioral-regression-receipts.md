---
"agent-maturity-compass": patch
---

Fail closed on skipped, pending, duplicate, or unverified prompt-injection regression fixtures. Resolve signed evidence against ledger integrity and bind the evidence payload to each suite or fixture's claims. Add auditor signatures through the existing asynchronous signing provider path and verify receipt semantics and workspace trust on admission.

Require each incident regression test to fail on a pre-fix build and pass on a distinct post-fix build, with separate run IDs and ordered timestamps. Sign and verify incident closure receipts without granting closure for missing or failed evidence.

Hash-only receipts remain readable but cannot verify as regression or closure evidence. Prompt-injection callers must provide the ledger workspace and attest the canonical suite or fixture payload before signing the receipt. Incident receipts retain original boundary fields so verification can recheck missing evidence without relying on display labels.
