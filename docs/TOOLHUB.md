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

### Consequential Studio dispatch (P1-54)

ToolHub journals every `EXECUTE` above `READ_ONLY` and `WRITE_LOW` before dispatch. `SIMULATE`, reads and low-impact writes retain their existing execution path. The journal opens once per service and runs its existing startup recovery. If it cannot open or write before dispatch, the call is denied with `journal_unavailable`; it never falls back to an unjournaled effect. The service exposes `close()` for callers that own its lifetime; the existing Studio process owns it until process exit.

Each intent has a deterministic execution ID: `exec_` plus the first 32 hexadecimal characters of SHA-256 over `toolhub:<workspaceId>:<intentId>`. The journal's unique execution row provides at-most-once dispatch per intent, including concurrent attempts. A repeated intent is denied with `intent_already_dispatched:<executionId>`. The existing journal guards refuse unresolved executions and possible duplicate argument digests; an unknown effect is settled through reconciliation or operator resolution, never by retrying the intent.

A repeated-intent denial does not overwrite the original in-memory execution record. Execution lookup continues to describe the admitted attempt; the retry receives its own denial evidence. Invalid protected facts do not make intent creation throw: dispatch still binds authorization and refuses invalid facts before any effect.

Approval creation binds the normalized arguments and protected facts from `authorizationIntentFor`. Dispatch builds the existing authorization record locally, persists `requested` and `authorized`, rechecks authority and consumes approvals, then commits `started` before invoking the executor. Execution tickets are checked again immediately before start. The shared authorization contract has no execution-ticket authority member: ticket facts remain in ToolHub evidence, and ticket-only records retain the helper's local OS principal attribution. This does not establish an authenticated Studio human identity. Cross-store approval consumption and journal start retain the existing pipeline's crash boundary; writer fencing and resume rules remain P2-12 work.

The journal mints and records the key. The built-in `http.fetch` executor delivers a declared `http-header` key and replaces a caller's header with the same name, case-insensitively. The overwrite is labelled as agent-supplied metadata. Header carriers on other built-in executors are denied with `idempotency_http_header_carrier_unsupported:<tool>`. Built-in ToolHub executors do not deliver arbitrary named argument keys, so argument carriers are denied before approval consumption or start with `idempotency_argument_carrier_unsupported:<tool>:<name>`. The dispatch helper can inject a declared argument for an explicitly capable run adapter; this is not a delivery claim for today's built-ins. A tool without a carrier still receives a journal key; AMC does not promise exactly-once delivery.

The execute response adds `action: { executionId, state, evidenceComplete }`. A body exception whose effect is uncertain returns HTTP 200 through the existing route with `allowed: true` and `result.outcomeUnknown: true`; `allowed` means admitted, not successful. `FINANCIAL`, `DATA_EXPORT` and `IDENTITY` results without an effect declaration also remain `outcome_unknown`. A proven pre-request HTTP failure (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`) or `DefiniteFailureError` records `completed` with `effect: not_applied`. Unknown result evidence uses `success: null` and emits no success measurement.

Process and Git executors preserve termination signals and spawn error codes. A signal or abnormal spawn error, including output-buffer exhaustion, yields `outcome_unknown` with `process_terminated`. `ENOENT` and `EACCES` establish a failed spawn with `not_applied`; a normally terminated non-zero exit is not body success and cannot emit work-order completion. The native pipeline's shared process-result adapter preserves the same distinction through its existing exception handling.

`http.fetch` rejects response errors and incomplete response closure. It has a 30-second idle timeout and a 60-second total deadline, including slow responses that keep sending data. A reset, timeout or incomplete response can follow an applied effect, so journaled dispatch records an unknown outcome rather than claiming `not_applied`. These bounds also apply to the native pipeline's shared HTTP executor.

A result recorder or heartbeat failure sets `evidenceComplete: false`. A post-dispatch journal write failure leaves the durable row for recovery and blocks further consequential calls in the process. An action response with `evidenceComplete: false`, including a denial before a journal row could be written, is not proof of a persisted transition. ToolHub still attempts the existing denial audit and refuses the effect even if that recorder is unavailable.

**Qualification pending:** this is coding-only source work. No tests, evaluations, builds, typechecks, lint, CI, live effects or interoperability checks have been executed for P1-54. At-most-once, fault, recovery, carrier and recorder behavior await qualification.

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
