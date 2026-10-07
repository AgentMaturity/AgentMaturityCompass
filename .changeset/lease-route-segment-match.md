---
"agent-maturity-compass": patch
---

Security: a lease's route allowlist now matches on a path-segment boundary, the same rule the gateway uses for routes since P1-24. A lease for `/dsh` covers `/dsh` and `/dsh/...` but no longer `/dsh2`.
