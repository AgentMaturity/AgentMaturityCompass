---
"agent-maturity-compass": patch
---

A reviewed MCP server that cannot be mounted at `session/new` (an unconfigured credential reference or a refused OAuth authorization) now answers with the startup refusal code -32003 and a stable `data.reason` (`mcp-credential-unavailable`, `mcp-oauth-refused`) instead of a generic -32603. The TypeScript SDK's `newSession` and the Python SDK's `new_session` raise `AMCNativeStartupRefusedError` / `AmcStartupRefusedError` with that reason.
