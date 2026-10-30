---
"agent-maturity-compass": patch
---

Authorization argument normalization now rejects ambiguous NFC keys, normalizes signed binding-field names consistently, and refuses a protected field whose normalized name overlaps an idempotency argument. Valid decimal, metadata and idempotency behavior remains unchanged under `amc.args/v1`. Approvals involving previously unbound Unicode fields can be refused; correct ambiguous declarations and request a fresh approval.
