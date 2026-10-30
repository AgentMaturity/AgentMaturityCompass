---
"agent-maturity-compass": patch
---

sdk-api: `AMCNativeClientOptions.mcpConfig` and `mcpConfigSha256` now accept either one string or an array of strings (one reviewed MCP config and its pin per server, GAP-WP21c). The committed API snapshot `sdk/api/native.api.md` is refreshed to match. Existing single-string callers are unchanged.
