---
"agent-maturity-compass": patch
---

Reconciliation now checks an already-aborted signal before asking the system of record. A canceled lookup leaves the execution unresolved, records no settlement, and uses the existing unknown-result backoff. In-flight cancellation and the 30-second lookup deadline are unchanged.
