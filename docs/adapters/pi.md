# Pi tool_call control

Hook provider: `pi` (installed with `amc connect hooks install --provider pi`; it is not an `amc adapters` id)  
Package export: `agent-maturity-compass/pi` (`createAmcPiExtension`)  
Qualified Pi: the `pi` CLI of `@earendil-works/pi-coding-agent` 1.0.2 and 1.0.4 (see [Qualification](#qualification))

AMC ships an optional Pi extension. In control mode it sends every Pi `tool_call` to AMC's loopback hook control route, applies AMC's decision, and AMC records each decision as a signed receipt bound to an authorization record. In observe mode it records requested and finished tool calls without arguments or output. This page states exactly where that enforcement starts and ends.

## Warning: extensions run with full rights

Pi has no sandbox, and every Pi extension, AMC's included, runs inside the Pi process with the operating-system rights of the account that started Pi. AMC's extension decides whether Pi's own tool calls run. It does not contain Pi, other extensions or the commands an allowed call starts. For containment run Pi in a container or VM (Pi's own `docs/security.md`).

## What AMC may claim

- Control mode: "enforced at Pi's `tool_call` hook", per mapped tool, for qualified Pi versions only.
- Not covered: OS containment; effects that bypass `tool_call` (another extension's own I/O, Pi Durable, Codemode-internal calls unless step 2 confirms they emit `tool_call`).
- Observe mode and `tool_result` data: "observed", never "enforced".
- An `ask` answered in Pi's UI is a provider-local prompt, not AMC approval quorum; quorum policies deny.
- A receipt proves AMC signed a decision, not that Pi honoured it; the pinned-version conformance run supports that.

What step 2 found for these lines:

- Codemode-internal calls do emit `tool_call`, with `parentToolCallId` set and a call id of the form `<parent>/<n>` (confirmed against both qualified versions; the events are in `tests/fixtures/harness-hooks/pi/<version>/events.jsonl`). In control mode AMC denies the `codemode` tool itself, so no Codemode script runs.
- Pi Durable is pi-agent-core's `AgentHarness` durable execution (the `replay` policy on an `AgentTool`). The `pi` CLI's unbundled dist does not use `AgentHarness`; AMC's extension does not see it. It stays not covered.
- A Pi tool call cannot carry an AMC approval, and a confirmation in Pi's UI is not one, so AMC denies every Pi call that needs approval, in every mode (receipt state `denied`, `capabilityLossy: true`).

## Per-tool claims

| Pi tool | AMC evaluates it as | Lowest class the signed config may give it | Claim in control mode |
|---|---|---|---|
| `read` | `fs.read` on `input.path` (required) | `READ_ONLY` | enforced at Pi's `tool_call` hook |
| `grep`, `find`, `ls` | `fs.read` on `input.path`, else the working directory | `READ_ONLY` | enforced at Pi's `tool_call` hook |
| `write`, `edit` | `fs.write` on `input.path` (required) | `WRITE_LOW` | enforced at Pi's `tool_call` hook |
| `bash` | the shell command plan of `input.command`: `process.spawn` per command, `git.*` for git subcommands | `WRITE_HIGH` for `process.spawn`; `git.*` keep their signed classes | enforced at Pi's `tool_call` hook |
| `powershell`, `codemode`, `tool_search`, MCP tools, any extension tool, any other name | not mapped | none | denied (the deny is enforced at the hook) |
| effects outside `tool_call` | not seen | none | not covered |

A signed ToolHub config that gives a mapped tool a lower class than this table is denied, never treated as permission. Under AMC's default signed policies `read` is allowed inside `./workspace/**`, `write` and `edit` need one approval (so Pi denies them) and `bash` runs `process.spawn`, which needs an exec ticket (so Pi denies it). Widening that posture is an operator decision.

## Install

```bash
amc up                                                   # the loopback Bridge control needs
amc connect hooks install --provider pi --agent my-agent --mode control --dry-run
amc connect hooks install --provider pi --agent my-agent --mode control
amc connect hooks status --provider pi
amc connect hooks health --provider pi
amc connect hooks lifecycle --agent my-agent --action <action-id>
amc connect hooks remove --provider pi
```

`--mode observe` is the default. The installer writes:

- `.pi/extensions/amc.js`: imports AMC's `dist/adapters/pi/amcPiExtension.js` by absolute path and starts it for this workspace and mode. It reads Pi's `VERSION` itself, because Pi resolves its own module only for files it loads directly.
- `.amc/hooks/pi.lease`: a dedicated lease (`hook:observe`, plus `hook:control` in control mode), mode `0600`.
- `.amc/hooks/pi.json` and `.sig`: a manifest signed by the workspace auditor key. It binds the SHA-256 of `.pi/extensions/amc.js` and of AMC's extension module, the lease, the Bridge origin, the qualified versions and AMC's monitor public keys at install.
- the managed `.gitignore` block for `.amc/hooks/`.

`status` reports an edited extension file, a changed AMC module or changed AMC receipt keys as `drifted`; reinstall to bind them. `remove` deletes only these files and the `.pi` directories the install created, and revokes the lease.

### Pi must load the extension

Pi loads `.pi/extensions/` only for a trusted project (Pi's `docs/security.md`, "Understand project trust"). Print, JSON and RPC modes skip it unless the project is trusted (`/trust`), `defaultProjectTrust` is `"always"`, or the run passes `--approve`. `pi -e .pi/extensions/amc.js` loads it explicitly. If Pi does not load it (trust declined, `--no-extensions` without `-e`, a load error), nothing is enforced and AMC records nothing. The conformance run pins this: with `--no-approve` a write that AMC would deny runs, and AMC records no decision. `hooks health` showing no events for a project you expect to be controlled is the signal.

## How a decision is made and bound

1. On `tool_call` the extension checks the event shape (`toolName`, `toolCallId`, plain-object `input`), posts an `action.requested` observation, then posts `{ hook_event_name: "tool_call", tool_name, tool_input, pi: { version, mode, sessionId, toolCallId, parentToolCallId, nonce } }` to `/bridge/hooks/control/v1` with the lease. Its wait is bounded at 5 s.
2. AMC derives the action id from Pi's session id and call id (an id the payload names is ignored), refuses a Pi version outside the qualified set (an unreadable one included), maps the tool with the table above and evaluates the signed ToolHub config, Action Policy and Approval Policy.
3. An allow binds a P1-02 authorization record: principal and delegation from the hook lease, normalized-argument and policy digests, idempotency key = Pi's call id, execution id = AMC's action id. A record that cannot bind (expired lease, a class the lease does not cover) denies.
4. Pi's response is `{ block: false, requestSha256 }` or `{ block: true, reason, requestSha256 }`, where `requestSha256` is the digest of the exact request. AMC records a v2 `action_state` receipt (`authorized` or `denied`, with the record digest and `enforcement: { level: "enforced", boundary: "pi:tool_call" }` for qualified versions) whose body digest covers that response.
5. The extension allows only if the receipt verifies under an AMC monitor key pinned at install and binds this action, call id, request digest and state. It then freezes the call's input: a Pi handler that runs after AMC and tries to change it throws, and Pi blocks a throwing handler.

Each request carries a fresh nonce, so a decision is single-use: re-sending the same call (for example from a restarted Pi) is a conflict, never a second decision, and the call is blocked. Any error, timeout, HTTP error, malformed or unbound answer, bad signature, missing or non-`0600` lease, missing or mismatched manifest, unrecognised event or Bridge outage blocks the call with `AMC control unavailable; action denied.` Observe mode never blocks.

On `tool_result` the extension posts `action.completed` or `action.failed` without arguments, output or error text. These are observations, never enforcement.

## Limits

- AMC decides before Pi executes and cannot recheck at execution the way AMC's own tool pipeline does; the receipt records the decision, the conformance run supports that Pi honours it.
- Pi runs `tool_call` handlers in load order (project `.pi/extensions`, then `~/.pi/agent/extensions`, then configured and `-e` paths) and stops at the first block. An extension loaded before AMC can change the input AMC sees (AMC decides on what it sees, which is what runs). One loaded after AMC cannot change an allowed call's input, but it can block it or act outside `tool_call`.
- Pi waits on a handler without a limit; AMC bounds its own wait (5 s). A handler from another extension can still hang a call.
- Qualification covers the `pi` CLI, whose bundle embeds its agent runtime. Embedding Pi through its SDK resolves `@earendil-works/pi-agent-core` from `node_modules` (1.1.0 on 2026-10-12) and reports mode `print`; it is not qualified.
- Receipts are signed with the workspace's monitor key: a local audit trail, not a portable verdict.
- Decision latency on the qualification machine is above the 50 ms p95 overhead target (see below).

## Confirmed Pi contract

Sources are the published npm tarballs (`@earendil-works/pi-coding-agent` 1.0.2, gitHead `cd32f7725fdbddbaecdff5b1e68491563394e0ca`; 1.0.4, gitHead `7c10bd4337495ee613f2224843ecdf349b80d1df`), read from the installed package, plus the conformance run. The GitHub links point at those gitHeads; the tarball files were what AMC read.

| Question | Answer | Source |
|---|---|---|
| Register a `tool_call` handler; its fields | `pi.on("tool_call", (event, ctx) => …)`; `event.toolName`, `event.toolCallId`, `event.parentToolCallId` (nested calls only), `event.input` | [`docs/extensions.md`](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/extensions.md#events-and-concurrency); `dist/core/extensions/types.d.ts` (`ToolCallEventBase`, `ToolCallEvent`) |
| Value that blocks; value that allows | return `{ block: true, reason }`; return nothing or `{ block: false }`. Pi turns the reason into the tool's error result | `types.d.ts` `ToolCallEventResult`; agent runtime `prepareToolCall` (`beforeResult?.block`), embedded in `dist/bundle/chunks` |
| Async handlers, wait limit, throw or hang | awaited in order with no wait limit; a throwing handler blocks the call; a hanging one hangs it | `extensions.md` "Errors and cleanup"; `dist/core/agent-session.js` `_beforeToolCall`; `runner.js` `emitToolCall` |
| Order across extensions | load order, first block wins; `event.input` is mutable and later handlers see earlier changes, with no re-validation | `extensions.md` "Events and concurrency"; `types.d.ts` `ToolCallEvent` comment; `loader.js` `discoverAndLoadExtensions` |
| Ask the user; detect non-interactive modes | `ctx.ui.confirm(title, message)`; `ctx.mode` is `tui`, `rpc`, `json` or `print` (SDK sessions report `print`), `ctx.hasUI` is true in TUI and RPC. AMC uses neither for approval: Pi asks are denied | `types.d.ts` `ExtensionUIContext`, `ExtensionMode`; `runner.js` (`mode = "print"`) |
| Codemode and extension tools emit `tool_call`; `tool_result` fields | yes, both; nested calls through `ctx.executeTool()` carry `parentToolCallId`. `tool_result` has `toolName`, `toolCallId`, `parentToolCallId`, `input`, `content`, `structuredContent`, `isError`, `details`, `usage` | `extensions.md` "Tools"; `agent-session.js` `_executeNestedToolCall`; conformance fixtures |
| How a project loads an extension; trust; Pi's version | `.pi/extensions/*.js` from the working directory; gated by project trust; `VERSION` from `@earendil-works/pi-coding-agent`, resolved for files Pi loads directly but not for nested ESM imports (found in the conformance run) | [`docs/security.md`](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/packages/coding-agent/docs/security.md#project-trust); `loader.js`; `virtual-modules.js` |

Built-in tool inputs used by the mapping (identical in 1.0.2 and 1.0.4): `bash { command, timeout? }`, `read { path, offset?, limit? }`, `edit { path, edits[] }`, `write { path, content }`, `grep { pattern, path?, … }`, `find { pattern, path?, limit? }`, `ls { path?, limit? }` (`dist/core/tools/*.js`).

## Qualification

`tests/conformance/piToolCall.conformance.test.ts` (`AMC_PI_CONFORMANCE=1`) runs each pinned `pi` CLI against a local scripted model endpoint (an OpenAI-compatible stream on loopback; no live model). The receipt is `qualification/2026-10-12-P1-22/receipt.json`. The matrix below is generated from it by `npm run gen:pi-conformance-matrix`.

<!-- pi-conformance-matrix:start -->
Run 2026-10-11T20:16:23.081Z on local macOS arm64 (not CI), AMC commit `a9e49d491899`.

| Case | Pi 1.0.2 | Pi 1.0.4 |
|---|---|---|
| Allowed `read` runs; recorded Pi version | yes; 1.0.2 | yes; 1.0.4 |
| `write` needing approval: file created | no | no |
| Denied `bash`: effect | no | no |
| Unmapped extension tool: effect | no | no |
| `codemode` tool: effect | no | no |
| Codemode nested call emits `tool_call` (parent id) | yes (call_codemode_probe/1) | yes (call_codemode_probe/1) |
| Bridge stopped: tool ran | no | no |
| Decision receipts verified cold | 105 verified, 0 failed | 105 verified, 0 failed |
| Limit, untrusted project: write ran; AMC decisions | yes; 0 | yes; 0 |
| Decision latency p50 / p95 (ms, n) | 39.3 / 54.6 (100) | 37 / 56 (100) |
<!-- pi-conformance-matrix:end -->

A new Pi release is blocked (`AMC has not qualified Pi <version>`) until it passes this run and is added to `QUALIFIED_PI_VERSIONS` (`src/adapters/pi/piVersions.ts`).

Related: [Pi callback telemetry](../PI_CALLBACK_TELEMETRY.md) (passive, self-reported) and [`amc connect hooks`](../../README.md#observe-or-control-native-provider-actions).
