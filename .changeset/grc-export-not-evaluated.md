---
"agent-maturity-compass": minor
---

`amc export grc` no longer marks controls PASS, PARTIAL or FAIL from maturity, coverage or run flags. Controls are "not evaluated" until evidence is bound to them; the manifest (schema v2) carries claim kinds and five status dimensions. Schema v1 never shipped on npm. The export now reads the agent's newest run by timestamp, whatever that run's own status says, never another agent's run, and checks its seal: a run whose seal does not verify is untrusted and at most self-reported. SARIF output holds findings about the run only, under `AMC-GRC-*` rule ids. See `docs/GRC_EXPORT.md`.
