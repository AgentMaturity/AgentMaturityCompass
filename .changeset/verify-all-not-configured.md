---
"agent-maturity-compass": minor
---

`amc verify all` and `amc evidence verify` now report an optional part the workspace never set up (passport, A4 projects, prompt packs and the prompt scheduler, audit binder and bench exports, the schema bundle, the forecast scheduler, backups and release bundles) with the new check status `NOT_CONFIGURED` and list it in the new JSON `notConfigured` field, so a fresh workspace reads `PASS` instead of `INCOMPLETE`, while a configured part that does not verify still fails, including a signed file whose body or signature was removed.
