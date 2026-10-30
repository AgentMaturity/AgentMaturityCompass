---
"agent-maturity-compass": patch
---

SDK callers can now read each reviewed MCP server's status and see why a startup was refused (GAP-WP21d).

- ACP adds the read-only `_amc/session/mcp` method, advertised as `mcpStatus: "amc-mcp-status-v1"`. It returns each mounted server's id, catalog digest, protocol, auth issuer/scopes/expiry, granted tool names, local registration `state` and `execution: "not-evaluated"`. This is the same projection chat's `/mcp` shows; env values, headers, tokens and config content are never included. The TypeScript SDK exposes it as `AMCNativeClient.mcpStatus(sessionId)` and the Python SDK as `AmcAgent.mcp_status(session_id)`.
- The Python SDK's `mcp_config` and `mcp_config_sha256` now accept lists, with the same pairing rules as the TypeScript SDK. An unpaired or malformed entry raises `ValueError` before anything is spawned.
- When `amc acp` refuses its launch configuration (an unreviewed, tampered, duplicate or unpaired MCP config, or a grant class mismatch), it now answers the client's first request with JSON-RPC error -32003 and `data.reason` set to a stable code such as `mcp-config-tampered`, then exits 2. The TypeScript SDK raises `AMCNativeStartupRefusedError` and the Python SDK raises `AmcStartupRefusedError`, each carrying `reason` and the runtime's fixed message, where callers previously saw a generic "output closed" error. Any other startup failure carries `startup-refused` and a generic message, because its text may name paths.

sdk-api: adds `AMCNativeClient.mcpStatus`, `AMCNativeMcpStatus` and `AMCNativeStartupRefusedError`. The snapshot also records WP21c's widening of `mcpConfig`/`mcpConfigSha256` to `string | readonly string[]`.
