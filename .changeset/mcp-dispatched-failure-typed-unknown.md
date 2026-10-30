---
"agent-maturity-compass": patch
---

Every native MCP tool call that fails after it was sent is now `TOOL_OUTCOME_UNKNOWN` with an unknown effect, on every transport: a stdio or initialize-era timeout, a broken HTTP stream, and a result discarded by the reviewed output schema or after grant disposal. The decision uses AMC's own dispatch state only. A journaled call stays `outcome_unknown` and blocks the agent's journaled calls until reconciled; a call refused before dispatch stays an ordinary error.
