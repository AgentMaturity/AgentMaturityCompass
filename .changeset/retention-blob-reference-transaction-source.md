---
"agent-maturity-compass": patch
---

Keep retention's final blob-reference snapshot and unlink inside an immediate evidence-database transaction after acknowledged hold admission. Changed or ineligible references retain the blob, do not count as pruning, and record a skipped outcome after the transaction. This follows source feedback from Claude; filesystem publication, rollback recovery and concurrency qualification remain open. No tests or qualification ran.
