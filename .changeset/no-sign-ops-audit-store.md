---
"agent-maturity-compass": patch
---

Under `AMC_NO_SIGN=1` ops audits (deletion-gate decisions and kill-switch alerts among them) are written to the unsigned evidence store instead of `.amc/evidence.sqlite`, and `amc incident list` and `GET /api/v1/incidents` also show incidents opened in the unsigned store, such as an unsigned kill's, with an `unsigned` label. The lists merge unsigned incidents by creation time, always keep an unsigned OPEN CRITICAL incident even past the limit (`unsignedPinnedPastLimit` in the API, a line in the CLI), and read at most 500 of them; an unsigned store that cannot be read (not a database, a missing table or column, a malformed row) shows no unsigned incidents with `unsignedUnreadable: true` and a warning instead of failing the list.
