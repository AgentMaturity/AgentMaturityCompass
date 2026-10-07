---
"agent-maturity-compass": patch
---

Under an active compiled plan, a native session no longer offers the model tools that the plan's `toolPipeline.visibleTools` omits. The filter uses the plan the session pinned at start, and `run_code` stays offered in Code Mode. The `compiled-policy` guard is still the enforcement point and still denies a call to a hidden tool. With no active plan, the offered tools are unchanged.

`amc policy controls` and `GET /api/v1/policy/controls` now take their unbound guardrails from the guardrail enforcement table, not from a hand-kept list. They list 9 unbound guardrails, down from 11: `tool-call-allowlist` and `cost-budget-limit` are enforced by the native tool pipeline and are no longer listed. `human-approval-gate` stays listed, because it is enforced only in a session whose compiled policy requires approvals. Each unbound row's `reason` is now the table's reason.
