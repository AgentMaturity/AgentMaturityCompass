---
"agent-maturity-compass": minor
---

Add read-only, evaluator-backed control simulation for Runtime Firewall, Action Policy, and Approval Policy controls. Expose exact matched rules and structured conditions through `amc policy simulate <controlId> [--json]` and `POST /api/v1/policy/simulate` without persisting input or generating proof receipts; fail closed on missing, malformed, unsigned, or tampered control state.
