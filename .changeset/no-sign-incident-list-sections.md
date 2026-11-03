---
"agent-maturity-compass": patch
---

`amc incident list` and `GET /api/v1/incidents` now list unsigned (`AMC_NO_SIGN=1`) incidents in their own section under their own cap instead of merging them into the signed list, so a planted unsigned row can no longer push signed incidents out; signed and unsigned OPEN CRITICAL incidents are always shown past the limit, unsigned rows dated in the future or before the workspace are counted and not shown, an unsigned store that is not a regular file inside the workspace is never opened, and a `limit` that is not a positive integer falls back to 50 in the API and is refused by the CLI.
