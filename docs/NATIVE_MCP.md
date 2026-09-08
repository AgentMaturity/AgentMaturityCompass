# Governed native MCP tools

AMC can mount an explicitly configured local MCP server into the native workspace tool pipeline. Discovery starts the operator-selected executable and reads its catalog. It does not grant the agent permission to call a tool.

Review the discovered catalog and pin its SHA-256 digest. Select each remote tool and its action class explicitly. Mounted tools have stable names of the form `mcp_<server-id>_<tool-name-hash>`; the catalog retains the original name and description. They still need entries in the signed AMC tool allowlist and remain subject to the existing runtime firewall, budget, approval and evidence paths. No configuration or permission is widened automatically.

At each invocation AMC re-reads the advertised catalog before dispatch. A changed digest, list-change notification, disconnect, timeout or cancellation disposes that connection and its registrations. Reconnection requires an explicit new mount with a reviewed catalog; stale grants are never reused automatically. Argument schemas are validated before calling the remote tool. Calls remain isolated to the owning toolset, agent and workspace; there is no global catalog cache.

The implementation starts with stdio. The configured server is a local program chosen by the operator; this is not a claim that its process or network activity is OS-sandboxed. A server can misrepresent its own implementation, so a schema digest proves the advertised contract was pinned, not that the server obeys it. Streamable HTTP origins/authentication remain separate work. ACP does not advertise MCP support until its complete execution path is qualified.

For application composition, `discoverNativeMcpCatalog` and `mountNativeMcpServer` are exported from the main package. Mount into an existing `agentToolset` whose recorder is bound to the selected native session. Close mounted servers in the same finally block that closes the toolset. A completed protocol response with `isError: true` remains a failed tool result. Credential environment values are kept out of catalog/error output and scrubbed from tool output before recording.

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

Pass the reviewed file to `agent-loop run` or `agent-loop chat` with `--mcp-config mcp.json`, `--tools workspace` and the matching `--approve-tools <action-class>`. Choose provider/model/task explicitly as in the [native guide](START_HERE.md). All grants in one invocation must use the approval action class; use separate runs for different classes. Chat pins the configuration bytes at startup and refuses later changes until the operator restarts it.

The stdio module and CLI integration are implemented under AMC-1515. Final combined validation is pending; no executed MCP fixture or platform acceptance is claimed yet.
