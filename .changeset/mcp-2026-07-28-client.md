---
"agent-maturity-compass": major
---

Breaking: the native MCP client speaks MCP 2026-07-28 and authenticates HTTP servers with OAuth 2.1; every pinned MCP catalog digest must be reviewed again.

- Discovery and mounts send `server/discover` first. A server that answers as a 2026-07-28 server is used statelessly: no `initialize`, no session, protocol metadata on every request, and over HTTP the `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and `x-mcp-header` parameter headers. Any other server is used through the `initialize` handshake as before. A new optional `protocolVersion` in the MCP config pins one version and refuses the rest.
- The catalog digest now covers the negotiated protocol version, so digests pinned before this release no longer match. Run `amc agent-loop mcp-catalog --config <file>` again, review the catalog and pin the new `expectedCatalogDigest`.
- `mcp-catalog` output gains `protocol` (negotiated version, `stateless` or `legacy`, and the server's self-reported identity), `auth`, and `excludedTools` for tools whose `x-mcp-header` annotations are invalid. `mountNativeMcpServer` returns a `receipt` with the same protocol and OAuth facts and never a token.
- A broken 2026-07-28 response stream re-sends a catalog read once with a new request id. A tool call is never re-sent: it fails with `TOOL_OUTCOME_UNKNOWN`, the mount is disposed and the recorded result says the remote tool may have executed. A server asking for more input (`input_required`) gets no answer and the call fails; AMC declares no sampling, roots or elicitation capability.
- HTTP servers may set `auth: { "kind": "oauth2", ... }` instead of `headerRefs`. `amc agent-loop mcp-catalog --config <file> --authorize` prints an authorization URL (it never opens a browser), checks the protected-resource metadata, the authorization server's issuer, S256 PKCE, `state` and `iss`, sends the resource indicator, stores the grant in the AMC credential store under the issuer and resource, and steps up scopes at most twice. Runs, chat and ACP sessions use or refresh the stored grant, or fail with `AUTH_REQUIRED` and that command. Dynamic client registration is off unless `allowDynamicRegistration` is true.
- `headerRefs` may no longer name `Mcp-Method`, `Mcp-Name` or `Mcp-Param-*` headers. Origin pinning, redirect refusal and the stdio catalog pins are unchanged.

The 2026-07-28 client and the OAuth client are AMC's own code; the installed MCP SDK implements protocol versions up to 2025-11-25 only. Executable fixture tests for these paths have not been run yet. See `docs/adr/010-mcp-2026-07-28.md`.
