---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1`, ledger checkpoints, freeze incidents and lifts, kill switch records, change envelope test results, effective-policy receipts, synchronous artifact provenance, native budget admission and executed experiment trials now refuse before writing anything, and the eval import, bridge telemetry, writer fence, review timing, change envelope audit, watch attestation and raw toolset writers record plain unsigned rows in the unsigned evidence store instead of `.amc/evidence.sqlite`.
