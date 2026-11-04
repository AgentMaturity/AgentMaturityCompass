---
"agent-maturity-compass": patch
---

`amc incident list --limit` and `GET /api/v1/incidents?limit=` accept any positive integer again, as they did before unsigned incidents were listed apart: values of a million or more are honoured, and a value past the largest safe integer is clamped to it instead of being treated as invalid. Limits that are not plain positive integers still fall back to 50 in the API and are refused by the CLI.
