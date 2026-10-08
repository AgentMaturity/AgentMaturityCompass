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
amc tools sign
amc tools list
amc tools list --json
```

`amc tools list` verifies the complete signed allowlist, derives stable tool and server identities, and groups MCP tools under their declared server. Omitted context remains native, so existing version 1 configs stay valid.

After reviewing intentional edits, `amc tools sign` validates and signs the existing YAML without replacing its grants or comments. Missing or malformed policy is refused without replacing its signature. `--json` returns signature metadata. Use `tools init` only when you intend to create the default policy.

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

## Protected facts and effects

A consequential tool's signed entry names the argument that carries each protected fact an approval binds
(`bindingFields`, P1-02) and may declare its effect (`effects`, P1-04):

```yaml
tools:
  allowedTools:
    - name: payments.send
      actionClass: FINANCIAL
      bindingFields: { amount: amount, currency: currency, recipient: payee }
      effects:
        repeatable: false
        idempotency: { carrier: http-header, name: Idempotency-Key }
        reconcile: { adapterId: payments-ledger }
```

- `bindingFields` maps the roles `amount`, `currency`, `recipient`, `destination`, `resourceId` and `resourceVersion` to
  argument names. `FINANCIAL` tools must name amount, currency and recipient, and `DATA_EXPORT` tools destination, or
  every call is denied `binding_fields_missing`. An amount is a decimal string, never a JSON number.
- `effects.repeatable` is true only when repeating the effect is harmless. It is recorded for the resume rules (P2-12);
  AMC dispatches an execution at most once either way.
- `effects.idempotency` names where AMC's per-execution key travels. With `http-header`, the body receives
  `idempotencyKey` and `idempotencyHeader` on its execution and sends the key on that header; `http.fetch` does so,
  replacing any value passed. With `argument`, AMC writes the key into the named argument, overwriting what the model
  passed (kept as agent-supplied metadata), and leaves that argument out of the arguments digest. It may not be a
  binding field.
- `effects.reconcile.adapterId` names the adapter `reconcile()` asks when an execution's outcome is unknown. Without
  one, an operator settles it with `amc action resolve` under dual control ([RECEIPTS](RECEIPTS.md#reconciliation-and-operator-resolution)).

ToolHub's own `runTool` path is not journaled yet and carries no keys (P1-54).

## Native shell mount grants

A native `bash` tool accepts `command` and optional `timeoutMs`; it does not supply a file path to the generic path validator. Configure reviewed shell write mounts separately in its existing signed entry:

```yaml
- name: bash
  actionClass: WRITE_HIGH
  nativeSandbox:
    kind: linux-bwrap
    writableDirectories:
      - workspace/output
  deny:
    argvRegexDenylist:
      - '(^|\s)rm\s+-rf(\s|$)'
      - '(^|\s)sudo(\s|$)'
      - '(^|\s)curl(\s|$)'
      - '(^|\s)wget(\s|$)'
```

Merge this into the reviewed `allowedTools` list, preserve existing command restrictions, then run `amc tools sign` and `amc tools verify`. Each mount must be an existing, exact relative workspace directory: no glob, symlink, escape, or `.amc` authority directory. An empty list grants no host writes. The OS backend continues to deny socket networking and apply its own filesystem restrictions. `kind: os-native` selects Bubblewrap on Linux and Seatbelt on macOS; the optional `egress.allowHosts`, `readDeny` and `maxProcesses` fields are described in [Sandbox mode](SANDBOX.md#shell-egress-allowlist).

`nativeSandbox` is an enforcement requirement, not metadata granting every caller permission. Only the immutable native shell binding (Bubblewrap on Linux; Seatbelt on macOS unless the kind is `linux-bwrap`) can satisfy it. ToolHub's legacy executors, callers on other platforms and replacement tools refuse the requirement. Admission pins the verified policy digest and the selected tool; changing the signed policy before launch refuses the call. The native session records the actual confinement outcome.

Existing `allow.paths` and `deny.paths` retain their ordinary per-call meaning and still require path arguments. They are never converted into shell mount grants or bypassed by `nativeSandbox`. Filesystem tool grants remain independent. See [Ubuntu prerequisites and qualification limits](NATIVE_SANDBOX_UBUNTU.md).
