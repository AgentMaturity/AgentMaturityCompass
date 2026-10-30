---
"agent-maturity-compass": patch
---

Security: failure-risk indices for a named run (`amc indices --run`, the indices API) accept only a run sealed for that agent, stored under its own run id and recorded in the ledger. A sealed run copied from another agent, or one the ledger does not record, is refused instead of scored.
