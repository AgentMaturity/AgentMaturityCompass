---
"agent-maturity-compass": major
---

Breaking: `amc verify all` and `amc evidence verify` gain the check status `NOT_CONFIGURED` and the JSON field `notConfigured` for an optional part the workspace never set up, and a part reads `NOT_CONFIGURED` only when an authenticated record shows it was never configured (the verified transparency log for the passport policy, the prompt scheduler and prompt packs, the verified ledger for A4 projects), so a part whose signed files were deleted fails, and a missing transparency log is skipped rather than recreated, which reads `INCOMPLETE`.
