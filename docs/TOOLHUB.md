# TOOLHUB

ToolHub is the trusted host tool proxy inside AMC Studio.

It executes real tools outside the evaluated agent process, enforces deny-by-default policy, records observed evidence, and mints monitor-signed receipts.

## Signed Config

ToolHub policy files:

- `.amc/tools.yaml`
- `.amc/tools.yaml.sig`

If signature verification fails, ToolHub denies execution and writes `CONFIG_SIGNATURE_INVALID` audit evidence.

## Threat Model

- ToolHub runs in the trusted Studio boundary.
- Agent processes do not get signing keys.
- ToolHub rejects unsafe paths and commands before execution.
- All inputs/outputs are redacted before evidence storage.

## Commands

```bash
amc tools init
amc tools verify
amc tools list
amc tools list --json
```

`amc tools list` verifies the complete signed allowlist, derives stable tool and server identities, and groups MCP tools under their declared server. Omitted context remains native, so existing version 1 configs stay valid.

## MCP Tool Context

Declare MCP context on an allowed tool inside the signed config:

```yaml
tools:
  version: 1
  denyByDefault: true
  allowedTools:
    - name: docs.lookup
      actionClass: READ_ONLY
      context:
        kind: mcp
        server:
          id: com.example.docs
          name: Docs MCP
          version: 1.0.0
          transport: stdio
```

The stable server ID is lowercase and bounded. The supported transport values are `stdio`, `streamable-http`, `sse`, and `http`. The fields are declarations in signed ToolHub policy, not live discovery results.

The list projection uses `context.kind: mcp`, returns native and MCP-server groups in deterministic order, and shares the same derived identities with CGX. CGX records MCP server nodes and `PROVIDES` edges; it refuses to build when ToolHub context integrity is untrusted.

## List Integrity

The list projection returns zero tools and groups when the config or signature is missing, the signature is invalid, the schema is malformed, tool names or identities collide, or one server ID declares conflicting metadata. Responses expose bounded reason codes rather than paths, raw policy, allow/deny patterns, arguments, credentials, or signature material.

Every projection states `derivedView: true`, `recorded: false`, and `proofEligible: false`. It proves only declared context in the current signed ToolHub allowlist. It does not discover a live server, prove availability, verify an MCP server attestation, or prove an invocation.

## Intent -> Execute Flow

1. Agent (or operator) requests an intent:

```http
POST /toolhub/intent
```

2. Studio runs Governor checks and returns:

- `intentId`
- `effectiveMode` (`SIMULATE` or `EXECUTE`)
- `requiredExecTicket`
- guard-check receipt

3. Agent submits execute request:

```http
POST /toolhub/execute
```

4. ToolHub validates:

- signed config status
- intent expiry
- tool allowlist constraints
- governor mode decision
- execution ticket (when required)

5. ToolHub emits evidence:

- `tool_action`
- `tool_result`
- audit events for denials

Both action/result events include receipts.

## Default Safety Controls

- deny by default
- no access to `.amc/**` or vault paths
- argv denylist for dangerous patterns (`rm`, `sudo`, `chmod`, `chown`)
- host allowlist for external HTTP fetches
- optional per-tool execution ticket requirement

## Agent Tokens and Scopes

Use agent-scoped tokens for ToolHub API access:

- `toolhub:intent`
- `toolhub:execute`
- `governor:check`
- `receipt:verify`

Agent tokens cannot perform admin actions (service lifecycle, signing, target updates, bundle/cert export).

## Limitations

- ToolHub only governs actions routed through ToolHub.
- Direct host actions outside ToolHub are treated as bypass attempts and reduce maturity ceilings when detected.
- MCP context is declared policy metadata. Use AMC's separate signed MCP server risk attestation for capability, sandbox, signer, and scan proof.
