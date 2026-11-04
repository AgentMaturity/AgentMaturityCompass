---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1`, ledger checkpoints, freeze incidents and lifts, change envelope test results, effective-policy receipts, synchronous artifact provenance, native budget admission, executed experiment trials and the A4 effects that sign (rollback, the production lease and a deployment denial) now refuse before writing anything, and the eval import, bridge telemetry, writer fence, review timing, change envelope audit, watch attestation and raw toolset writers record plain unsigned rows in the unsigned evidence store instead of `.amc/evidence.sqlite`, where `amc eval status` now reads them; a drift check that detects a regression alerts the owner and refuses, since it cannot publish the signed freeze incident.
