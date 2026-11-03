---
"agent-maturity-compass": patch
---

`amc verify all` and `amc evidence verify` now report an optional part the workspace never set up (passport, A4 projects, the schema bundle, the forecast and prompt schedulers, backups and release bundles) as `NOT_CONFIGURED` and list it in the JSON `notConfigured` field, so a fresh workspace reads `PASS` instead of `INCOMPLETE`, while a configured part that does not verify still fails and a prompt scheduler state file without its signature now fails.
