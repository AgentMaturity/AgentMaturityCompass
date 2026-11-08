---
"agent-maturity-compass": patch
---

The `workflow` tool reports an unknown effect (`TOOL_OUTCOME_UNKNOWN`) only from a node's recorded state: a checkpoint parked as unknown, an unconfirmed or abandoned dispatch, a result commit that failed after its dispatch, a node blocked by an unsettled child, or a new run id refused over an unresolved run. It no longer reads failure reason text, which can quote delegate labels a model chose (the depth refusal names the `runAs` chain), so such a label can no longer turn a refusal before any dispatch into an unknown effect. Each such failure in the tool's `failed` list carries `unknown: true`; reason texts are unchanged.
