---
"agent-maturity-compass": minor
---

Add deterministic, read-only policy regression suites through `amc policy test <file> [--json]`. Suites reuse AMC's production control simulator, fail closed on untrusted policy state, exclude raw inputs and paths, remain ineligible as runtime or maturity evidence, and run as a built-distribution CI gate with an uploadable report.
