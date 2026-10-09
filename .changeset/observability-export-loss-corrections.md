---
"agent-maturity-compass": patch
---

Yield after observability request preparation and buffer clearing, keeping residency checks and guard writes off the recording ledger transaction stack. Reject noninteger or nonfinite metric and incident timestamps before buffering, keep eval telemetry best effort with loss accounting, and count actual buffer evictions.

This is a partial, unqualified P2-01 correction. The internal transport remains deferred until known callers carry their owning workspace; no tests or qualification are claimed.
