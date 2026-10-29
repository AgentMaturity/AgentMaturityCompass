---
"agent-maturity-compass": patch
---

Continue forecast refresh when the latest transform plan is malformed or cannot be verified. Report the plan input as source_unavailable with its parse or verification problem, omit untrusted task recommendations, and leave ETA unknown while preserving other forecast calculations.
