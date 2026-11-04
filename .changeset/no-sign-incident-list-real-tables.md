---
"agent-maturity-compass": patch
---

`amc incident list` and `GET /api/v1/incidents` no longer query an unsigned evidence store whose `incidents` or `incident_transitions` is a view, a virtual table or has a generated column (a view built on a recursive CTE hung the list); such a store is reported unreadable and the signed incidents are still listed. `amc audit export --limit` again accepts any positive integer, as it did before the incident list's six-digit limit cap was applied to it by mistake.
