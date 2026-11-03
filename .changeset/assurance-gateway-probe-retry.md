---
"agent-maturity-compass": patch
---

Assurance runs retry the gateway reachability probe once, so a pooled connection the idle gateway already closed no longer drops the run to the direct-provider fallback.
