---
"agent-maturity-compass": patch
---

Add `amc api key create`, `amc api key list`, and `amc api key revoke` for local programmatic API key management. Keys are displayed only once on creation; the persisted store keeps hashed secret material and public metadata under `.amc/auth/api-keys.json`.
