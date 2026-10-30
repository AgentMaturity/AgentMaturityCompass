---
"agent-maturity-compass": patch
---

Native agent tool calls now meet the governor's signed Action Policy (`.amc/action-policy.yaml`) the way ToolHub does (AXR-02). A new `action-policy` guard runs after the budgets guard: with the policy signed, a call the policy denies is refused, an EXECUTE held by a freeze or an exhausted budget is refused (as ToolHub refuses it at execution), and a call the policy otherwise downgrades runs as SIMULATE; with the policy present but unsigned or tampered (or removed while its signature remains), every governed call is refused; with no policy, native calls behave as before and `amc agent run`, setup and `amc doctor` report "action policy: not configured". Because `amc init` signs the default policy, an agent without an observed diagnostic run now has its EXECUTE calls run as SIMULATE until the policy's evidence conditions are met, as on ToolHub.
