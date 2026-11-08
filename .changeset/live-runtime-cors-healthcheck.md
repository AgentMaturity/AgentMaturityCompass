---
"agent-maturity-compass": patch
---

Studio now refuses to start when an `AMC_CORS_ALLOWED_ORIGINS` entry is not an origin (`scheme://host[:port]`, with no path, query or credentials) and names the entry; before, such a value started and every native request then failed with a 500. `amc studio healthcheck` now probes the address the running Studio recorded in `.amc/studio/state.json`, so it follows a default-port fallback or the signed LAN port, and uses the configured address only when Studio wrote no state.
