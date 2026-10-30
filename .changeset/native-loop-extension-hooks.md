---
"agent-maturity-compass": patch
---

Add governed native-loop observer and deny-only pre-tool hooks for signed executable extensions. Hooks receive frozen redacted metadata and retain existing execution approval, digest, confinement and timeout checks. Observer exceptions are isolated and reported; deny hooks cannot override policy, approvals, arguments or modes.
