---
"agent-maturity-compass": patch
---

Studio's anonymous `/readyz` now answers `status`, the reason codes (each reason up to its first `:`) and `ts` (LIVE-RUNTIME-14). The messages after each code, which could name signature errors and paths, and the full `checks` object go only to a signed-in user or the admin token. Probes keep working: they read `status` and the codes.
