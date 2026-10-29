# Governed native MCP tools and resources

AMC can mount an explicitly configured stdio or Streamable HTTP MCP server into the native workspace tool pipeline. Discovery connects to the operator-selected server and reads its catalog. It does not grant the agent permission to call a tool.

Review the discovered catalog and pin its SHA-256 digest. Select each remote tool and its action class explicitly. Mounted tools have stable names of the form `mcp_<server-id>_<tool-name-hash>`; the catalog retains the original name and description. They still need entries in the signed AMC tool allowlist and remain subject to the existing runtime firewall, budget, approval and evidence paths. No configuration or permission is widened automatically.

At each invocation AMC re-reads the advertised catalog before dispatch. A changed digest, list-change notification, disconnect, protocol refusal, HTTP failure or the mount's own cancellation disposes that connection and its registrations. On a stdio mount, one call's own timeout or cancellation cancels only that request (AMC sends `notifications/cancelled`); the other granted tools stay usable. `timeoutMs` is an inactivity window: progress notifications from the server renew it, up to `maxTotalMs` per call (default 300000 or `timeoutMs` if larger, at most 3600000), and the result reports `amcProgressNotifications` when any arrived. Reconnection requires an explicit new mount with a reviewed catalog; stale grants are never reused automatically. Argument schemas are validated before calling the remote tool, and before a call that is not executed is simulated. A result that arrives after its grant was disposed is discarded, never replayed, and the failure says that the remote tool executed. Any tool call that fails after it was sent (a timeout, a broken stream on any transport, or a result discarded because it fails the reviewed output schema or arrives after disposal) is reported `TOOL_OUTCOME_UNKNOWN` with an unknown effect, decided from AMC's own dispatch state, never from server text. A journaled call (by default every class except `READ_ONLY` and `WRITE_LOW`) then stays `outcome_unknown` and blocks the agent's journaled calls until it is reconciled. A call refused before it was sent stays an ordinary error. Calls remain isolated to the owning toolset, agent and workspace; there is no global catalog cache.

The stdio server is a local program chosen by the operator; this is not a claim that its process or network activity is OS-sandboxed. On macOS and Linux it runs in its own process group: closing the mount ends stdin, then sends SIGTERM and, after two seconds, SIGKILL to the whole group, so processes a wrapper such as `npx` or a shell script started end too; a group that survives is reported as a cleanup failure. `amc agent-loop mcp-catalog --diagnostics` prints the last 16 KiB of the server's stderr and logging notifications, scrubbed of its configured credential values, when discovery fails; it never enters model context, tool output or the catalog digest. A server can misrepresent its own implementation, so a schema digest proves the advertised contract was pinned, not that the server obeys it. The same limit applies to remote servers: an explicitly pinned endpoint is an operator trust decision, not proof of the server's implementation.

For application composition, `discoverNativeMcpCatalog` and `mountNativeMcpServer` are exported from the main package. Mount into an existing `agentToolset` whose recorder is bound to the selected native session. Pass `requireReviewedNativeMcpGrants(...).capabilities` to `agentToolset` as `additionalCapabilities` when composing it; deferred search only includes late mounts whose implementation identities were reviewed at composition. Close mounted servers in the same finally block that closes the toolset. A completed protocol response with `isError: true` remains a failed tool result. Image, audio and resource blob content stays typed in the tool output with its media type, byte length and SHA-256; its base64 data is not placed in model-facing text. Server instructions are exposed as `serverInstructions` on the mount and `instructions` in the catalog. Their complete raw SHA-256 identity is included in the reviewed digest, including any omitted tail. The scrubbed text is bounded to 8 KiB and included as attributed, untrusted literal JSON in admitted tool descriptions. The model receives that guidance through the existing `tool_search` metadata path; it grants no authority. Instruction changes at the next handshake require a new reviewed digest. Resolved credentials and HTTP session identifiers are withheld from catalog/error output and scrubbed from tool output before recording.

## Read-only resources and deferred discovery

Mounted MCP definitions use the existing deferred exposure. Separately admit the native `tool_search` capability as `READ_ONLY` in the signed tool policy so the model can discover granted names, descriptions, argument schemas and schema digests. Discovery reads only current admitted registry metadata; it does not execute remote tools, activate hidden definitions, enroll OAuth or widen policy. Programmatic and Code Mode subcalls can use returned names through the same governed execution pipeline. WP13a does not activate schemas in the next native provider request; native provider binding still rejects unoffered tool names. Native model invocation therefore depends on the deferred-schema activation follow-up. Metadata discovery alone is not that activation.

When the server advertises resources, `mcp-catalog` also reviews its resource list and templates and reports two AMC adapter names: `resources/list` and `resources/read`. Grant either through the existing config format and separately sign its generated `mcp_<server-id>_<hash>` identity. Both adapters require `READ_ONLY`:

```json
"grants": [
  { "name": "resources/list", "actionClass": "READ_ONLY" },
  { "name": "resources/read", "actionClass": "READ_ONLY" }
]
```

Listing returns the reviewed metadata and grants no read or ordinary tool authority. Read arguments are `{ "uri": "resource://server/docs/example" }`. AMC sends that identity only to the already pinned MCP endpoint; it never fetches the resource URI directly. Existing HTTP origin, egress, OAuth and credential policies still apply.

The catalog pins resource identities, descriptions, media types and templates alongside tools. Resources and templates each allow at most 256 entries and 32 continuation pages; the combined canonical catalog is limited to 1 MiB. URI strings are limited to 2048 characters. Credentials, fragments, traversal and malformed encodings are refused. Templates accept at most eight unique whole path-segment variables under a fixed scheme and authority. Reserved expansion, query operators and encoded segment-boundary escapes are refused. A resource result must contain 1–32 items with the exact requested URI, the reviewed media type when declared, and exactly one text or blob representation.

Both raw canonical results and final rendered output are limited to 256 KiB. Typed content and `structuredContent` remain in the JSON envelope. Image, audio and blob bytes are replaced by their byte length and SHA-256 with `dataOmitted: true`; `amcLosses` records each omission. `amcProvenance` records the server, reviewed catalog digest, canonical raw result digest and byte length, and `trust: "untrusted-external"`. This is content provenance, not an authenticated server claim or execution authority. Native recording preserves the envelope; neutral event-log import retains it as self-reported, unevaluated external evidence.

Resource calls revalidate the catalog before dispatch. Reads also check catalog and HTTP recovery generation before publishing their result. Resource-list notifications invalidate grants, including notifications consumed inside HTTP response streams. Changed catalogs require operator review and a fresh mount. A read failure returns an explicit failed result; it does not fabricate empty or successful content. Request cancellation and deadlines use the existing mount lifecycle.

## CLI configuration

Create an explicit JSON file with one local server:

```json
{
  "schemaVersion": 1,
  "server": {
    "id": "local-tools",
    "command": "/absolute/path/to/server",
    "args": [],
    "envRefs": { "SERVICE_TOKEN": "MY_SERVICE_TOKEN" },
    "timeoutMs": 30000
  }
}
```

Replace the executable and credential reference with your actual configuration. Omit `envRefs` for a keyless server. Literal environment secrets are refused; `amc credentials` manages reference values separately.

```sh
amc agent-loop mcp-catalog --config mcp.json --json
```

Discovery starts that program and disposes it after reading the catalog. Review its returned digest, original tool names and generated allowlist names. Add `expectedCatalogDigest` and `grants` to the same file. Each grant has the original remote `name` and an explicit AMC `actionClass`; do not copy a server's suggestion as an authority decision. The signed tool allowlist must independently admit each generated name under that same action class.

Pass the reviewed file to `agent-loop run` or `agent-loop chat` with `--mcp-config mcp.json`, `--tools workspace` and the matching `--approve-tools <action-class>`. Choose provider/model/task explicitly as in the [native guide](START_HERE.md). All grants in one invocation must use the approval action class; use separate runs for different classes. `agent-loop run` accepts `--mcp-config` more than once to mount several servers under that same review: each file has its own pinned digest and grants, server ids must differ, and `--mcp-config-sha256`, when given, is repeated once per file in the same order. Chat pins the configuration bytes at startup and refuses later changes until the operator restarts it.

The stdio path was qualified on installed candidate `90855cf7` through native CLI and the public SDK/ACP on macOS ARM64: real authenticated approvals, exact tool effects, catalog/grant refusal, process cleanup and cold verification. The repository checkout retains the dated receipt at `AMC_OS/RESEARCH/2026-09-08-dsh-pi/installed-native-mcp-acceptance/README.md`. This is local protocol conformance with a scripted provider, not a vendor or model-quality evaluation.

## Streamable HTTP configuration

Choose the endpoint and its exact origin explicitly. Existing stdio files continue to work without a `transport` field.

```json
{
  "schemaVersion": 1,
  "server": {
    "transport": "streamable-http",
    "id": "reviewed-service",
    "url": "https://mcp.example.com/mcp",
    "origin": "https://mcp.example.com",
    "headerRefs": { "Authorization": "REVIEWED_MCP_AUTHORIZATION" },
    "timeoutMs": 30000,
    "notificationLifetimeMs": 28800000
  }
}
```

The credential reference supplies the complete header value, including its authorization scheme when needed. Store it using `amc credentials`; never place literal headers or URL credentials in this file. Omit `headerRefs` for a keyless endpoint, or use `auth` for an OAuth server (below). HTTPS is required except for explicit `http://127.0.0.1:<port>` or `http://[::1]:<port>` development endpoints. URL queries/fragments, credentials, mismatched origins, cookie/proxy headers and overrides of MCP/HTTP control headers (including `Mcp-Method`, `Mcp-Name` and `Mcp-Param-*`) are refused. Credential headers are sent only to the exact configured endpoint; redirects are never followed. No legacy HTTP+SSE fallback occurs, and OAuth is never enrolled automatically. Authentication refusal requires the operator to configure or refresh the credential reference, or to run `--authorize`, explicitly.

Run the same catalog command, review the catalog, add its digest and explicit grants, then sign matching allowlist entries. Native CLI/chat and public SDK/ACP consume this same configuration; the existing approval, budget and evidence requirements apply. Use `--mcp-config-sha256` to bind a CLI run to exact reviewed configuration bytes. Discovery contacts the remote service and disposes that connection; it does not create tool grants.

AMC uses the installed MCP TypeScript SDK Streamable HTTP transport with a constrained network wrapper. Both JSON and SSE response forms are supported. With a server that speaks an initialize-era version, the server's session ID may be assigned only by initialization and cannot change during a mount. An expired session, broken stream, changed catalog or notification invalidates the mount; automatic reconnection/resumption is disabled. Reconnect explicitly to establish a new session and revalidate the catalog and grants. Closing aborts local streams and attempts bounded remote DELETE termination; unsupported DELETE (405) or an already-expired session (404) is accepted, while other termination failures remain visible.

Response bodies are bounded to 4 MiB each and 32 MiB per mount, outgoing messages to 1 MiB, requests to 1024, concurrent requests to 8 and incoming server messages to 256. POST requests use `timeoutMs`; the optional GET notification stream has an independent `notificationLifetimeMs`, defaulting to eight hours and accepting an integer from 1 through 86,400,000 milliseconds (24 hours). A short request timeout does not expire an otherwise healthy idle notification stream. Expiry closes the mount and requires an explicit new reviewed connection; it never silently renews authority. These limits bound retained state and network activity; they do not impose a remote server sandbox. Local cancellation and DELETE acknowledgment do not prove that an already dispatched remote side effect stopped.

Primary contracts: [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) for stateless servers and [MCP Streamable HTTP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) for initialize-era servers. The 2026-07-28 client, its version negotiation and the OAuth client are AMC's own code ([ADR 010](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adr/010-mcp-2026-07-28.md)); the installed SDK implements versions up to 2025-11-25 only. The qualification below predates them and does not cover them. Implementation uses the installed `@modelcontextprotocol/sdk` transport, 1.32.1 since 2026-10-06 (1.30.0 and earlier fall in advisory GHSA-6qxp-vccf-f47h); the installed-candidate acceptance below ran on 1.30.0. The HTTP source passes 28 focused HTTP/stdio cases and both type gates. Fresh installed candidate `0af82e28` separately passed 15 checkpoint groups through native CLI and the public TypeScript SDK/ACP: real credential references, exact authenticated approvals, two tool effects, catalogue/grant/redirect/auth refusals, cancellation, five remote terminations and six independent verification receipts. The dated receipt is in the checkout at `AMC_OS/RESEARCH/2026-09-08-dsh-pi/installed-native-http-mcp-acceptance/README.md`. This covers macOS ARM64 and loopback HTTP/SSE with a scripted provider; live vendor TLS, OAuth and model-quality results are not inferred.

## Protocol versions

AMC speaks MCP 2026-07-28 (stateless: no `initialize`, no session, protocol metadata on every request) and the initialize-era versions the installed SDK supports (2025-11-25 and earlier). Without a pin, discovery and every mount first send `server/discover`; a server that answers with a 2026-07-28 `DiscoverResult` is used statelessly, and a server that does not is used through the `initialize` handshake. To pin one version, add `"protocolVersion": "2026-07-28"` (or an initialize-era version such as `"2025-11-25"`) to the `server` object; AMC then refuses any other version instead of falling back. The `mcp-catalog` output and the mount receipt record `protocol: { negotiatedVersion, mode, serverInfo }`; `serverInfo` is what the server says about itself and is not verified.

The reviewed catalog digest covers the negotiated version, tools, normalized resource identities/templates and complete instruction identity. Digests pinned before this change no longer match: run `mcp-catalog` again, review, and pin the new digest. A server that changes protocol version or era between review and mount is refused until it is reviewed again.

In 2026-07-28 mode over HTTP, each request is one POST carrying `MCP-Protocol-Version`, `Mcp-Method` and, for tool calls, `Mcp-Name`, plus `Mcp-Param-*` headers for tool parameters the server marks with `x-mcp-header`. A tool whose `x-mcp-header` annotations are invalid is left out of the catalog and listed under `excludedTools`. There is no notification stream: every call re-reads the catalog and compares it with the pinned digest. If a response stream breaks, AMC re-sends a catalog read once with a new request id. It never re-sends a tool call: the call fails with `TOOL_OUTCOME_UNKNOWN`, the mount is disposed, and the recorded result says the remote tool may have executed and was not replayed. A server that asks for more input (`input_required`) gets no answer, because AMC declares no sampling, roots or elicitation capability; the call fails and is not retried.

## OAuth for HTTP servers

An HTTP server that requires OAuth uses `auth` instead of `headerRefs`:

```json
{
  "schemaVersion": 1,
  "server": {
    "transport": "streamable-http",
    "id": "reviewed-service",
    "url": "https://mcp.example.com/mcp",
    "origin": "https://mcp.example.com",
    "auth": { "kind": "oauth2", "clientId": "registered-public-client-id", "scopes": ["tools.read"], "redirectPort": 8765 }
  }
}
```

Choose one client identity: `clientId` for a public client registered with the authorization server for the redirect URI `http://127.0.0.1:<redirectPort>/callback`; `clientIdMetadataUrl` for an HTTPS Client ID Metadata Document you host, used when the authorization server advertises support; or `"allowDynamicRegistration": true` to allow the deprecated dynamic client registration. Without `redirectPort` the callback uses a free local port, which suits only authorization servers that accept any loopback port. `scopes` adds scopes to those the server's challenge or metadata names.

Every OAuth URL comes from the server's metadata, so AMC refuses an authorization, token, registration or metadata host that resolves to a private, loopback, link-local or other non-public address, or that does not resolve. The only exceptions are a literal loopback HTTP endpoint for development, and `auth.allowPrivateNetwork: true` set by the operator for an internal deployment. The remote server's own DNS never decides this.

Authorize once in a terminal:

```sh
amc agent-loop mcp-catalog --config mcp.json --authorize
```

AMC discovers the authorization server from the server's protected-resource metadata, checks that the metadata names this server, that the authorization server's metadata names the same issuer and that it supports S256 PKCE, then prints an authorization URL on stderr. Open it in a browser; AMC never opens one. The loopback callback checks `state` and the issuer (`iss`), exchanges the code with the PKCE verifier and the server's resource indicator, stores the grant in the AMC credential store under the issuer and resource, and reads the catalog. If the server answers `insufficient_scope`, AMC asks for the union of the granted and challenged scopes, at most twice. Server error text, codes and tokens are never printed.

Later `agent-loop run` and `chat` invocations and ACP sessions rediscover the server's current issuer, use only the grant stored for that issuer and resource, refresh it when it is due, and send the token only in the `Authorization` header to the pinned endpoint. Without a usable grant they fail with `AUTH_REQUIRED` and the `--authorize` command. A refresh re-reads the stored grant under the credential store's cross-process lock and refreshes only if no other process or mount already did, so a rotating refresh token is redeemed once; the rotated grant is stored even if the caller stops waiting. During a mount, an OAuth HTTP transport renews its bearer the same way before a request once the token is within 60 seconds of expiry, for the same issuer, resource and endpoint. If the server rejects a token, the mount is disposed and the next mount refreshes or asks for `--authorize`. The `mcp-catalog` output and mount receipt record `auth: { issuer, scopes, tokenExpiresAt }`, never a token. Authorization-server endpoints must be HTTPS; literal loopback HTTP is accepted only for a loopback development MCP endpoint. Stdio servers keep using `envRefs`. Applications that call `mountNativeMcpServer` directly supply the resolved `Authorization` header themselves.

## Limits and deliberate choices

ADR 010's documented choices remain in force: every invocation rereads the catalog rather than using TTL/cache hints or `subscriptions/listen`; `input_required` fails closed without sampling, roots or elicitation; stdio termination requires a new reviewed mount. The protected-resource same-origin path-prefix relaxation and lack of a pinned authorization issuer in config remain documented limitations.

Fixture-owned HTTP servers and callback-driver clients have observed request/response/socket closure. The product OAuth callback still calls `closeAllConnections()` and nonawaited `close()`; its internal server-close event was not observed. Public configuration resolution also retains its normal inherited environment and user dotenv layers, even with explicit credential paths. Direct fixture stores disable those layers. The evidence claims stay within those boundaries.

A mount receipt for an OAuth server records the reviewed protocol and catalog and the issuer, scopes and expiry, never a token. This one comes from the synthetic loopback OAuth fixture; the issuer port is that run's, and its grant declared no expiry:

```json
{
  "serverId": "oauth_fixture",
  "catalogDigest": "25592d15431056566b4dde61e8de7fa3ceabbf6c4a25d497b21cb49446d11d48",
  "protocol": {
    "negotiatedVersion": "2026-07-28",
    "mode": "stateless",
    "serverInfo": {
      "name": "synthetic-oauth-catalog",
      "version": "1"
    }
  },
  "auth": {
    "issuer": "http://127.0.0.1:50185/issuer/path",
    "scopes": [
      "read"
    ],
    "tokenExpiresAt": null
  }
}
```
