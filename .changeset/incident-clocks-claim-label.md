---
"agent-maturity-compass": patch
---

`GET /api/v1/incidents/:id/clocks` responses now carry claim fields (`claimKind`, `statusDimensions`, `claimLabel`), like the `amc_incident_clocks` MCP tool. Clock deadlines are computed from operator-stated times, so the result is regulated and reads as not evaluated. It is never a filing or a compliance verdict.
