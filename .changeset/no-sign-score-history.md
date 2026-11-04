---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1`, ops audits (`appendOpsAuditEvent`, which records deletion-gate decisions among others) are written as plain unsigned rows with no receipt instead of being refused, so gated deletions such as removing a stale console-snapshot signature keep working in unsigned local diagnostics; the rows carry `unsigned`, which ledger verification rejects. Score history snapshots are likewise written with the signature `unsigned` instead of being signed with the ledger-row key, and `verifyIntegrity` reports them as `signature invalid`. The A4 comment schema in `website/openapi.yaml` now lists the `via` field.
