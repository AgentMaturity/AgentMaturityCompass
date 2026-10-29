---
"agent-maturity-compass": patch
---

Continue forecast refresh when the latest transform plan is malformed or cannot be verified. Report the plan input as source_unavailable with its parse or verification problem, omit untrusted task recommendations, and leave ETA unknown while preserving other forecast calculations.

The plan is used only when the newest sealed transparency record for its agent or node (TRANSFORM_PLAN_CREATED or TRANSFORM_PLAN_UPDATED) names its planId and exact bytes. A restored older plan or revision, a plan with no record, an unverifiable log, or an unverifiable plan-archive entry is source_unavailable.
