---
"agent-maturity-compass": major
---

Breaking: `amc verify all` and `amc evidence verify` gain the check status `NOT_CONFIGURED` and the JSON field `notConfigured` for an optional part the workspace never set up, and a part reads `NOT_CONFIGURED` only when authenticated records show it was never configured (the verified, anchored evidence ledger and the verified transparency log for the passport policy and the prompt and forecast schedulers, the verified ledger and the verified log for prompt packs and for A4 projects), so a part whose signed files were deleted fails, a transparency log older than the ledger's configuration witnesses fails as rolled back, an A4 project that either record shows was created and the ledger no longer holds fails, and a missing transparency log or seal is skipped rather than recreated, which reads `INCOMPLETE`.
