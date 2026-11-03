---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1` ops audits (deletion-gate decisions and kill-switch alerts among them) are written to the unsigned evidence store instead of `.amc/evidence.sqlite`, and `amc incident list` and `GET /api/v1/incidents` also show incidents opened in the unsigned store, such as an unsigned kill's, with an `unsigned` label.
