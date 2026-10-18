# Pi tool_call control

Hook provider: `pi` (installed with `amc connect hooks install --provider pi`; it is not an `amc adapters` id)  
Package export: `agent-maturity-compass/pi` (`createAmcPiExtension`)  
Qualified Pi: the `pi` CLI of `@earendil-works/pi-coding-agent` 1.0.2 and 1.0.4 (see [Qualification](#qualification))

AMC ships an optional Pi extension. In control mode it sends every Pi `tool_call` to AMC's loopback hook control route, applies AMC's decision, and AMC records each decision as a signed receipt bound to an authorization record. In observe mode it records requested and finished tool calls without arguments or output. This page states exactly where that enforcement starts and ends.

## Warning: extensions run with full rights

Pi has no sandbox, and every Pi extension, AMC's included, runs inside the Pi process with the operating-system rights of the account that started Pi. AMC's extension decides whether Pi's own tool calls run. It does not contain Pi, other extensions or the commands an allowed call starts. For containment run Pi in a container or VM (Pi's own `docs/security.md`).

## What AMC may claim

- Control mode: "enforced at Pi's `tool_call` hook", per mapped tool, for qualified Pi versions only, in a Pi session registered under the current installation, and only while Pi's tool registry names Pi's own built-in for that tool name.
- Not covered: OS containment; effects that bypass `tool_call` (another extension's own I/O, Pi Durable, Codemode-internal calls unless step 2 confirms they emit `tool_call`).
- Not covered: an extension that rewrites Pi's tool registry itself. AMC denies a mapped tool name when Pi's registry does not name Pi's built-in for it (an extension tool registered under a built-in's name), but extensions run in Pi's process with full rights.
- AMC cannot see sessions where Pi did not load the extension; they are reported as not governed.
- A session registration is a lease-holder attestation: registration made with the session lease and matching on-disk extension and Pi digests. A process holding the lease can still attest without Pi. AMC cannot prove Pi executed the hook; it can prove only that every allowed call went through AMC with a signed receipt.
- Pi ask is always denied until an AMC approval path exists.
- Observe mode and `tool_result` data: "observed", never "enforced".
- A receipt proves AMC signed a decision, not that Pi honoured it; the pinned-version conformance run supports that.

What step 2 found for these lines:

- Codemode-internal calls do emit `tool_call`, with `parentToolCallId` set and a call id of the form `<parent>/<n>` (confirmed against both qualified versions; the events are in `tests/fixtures/harness-hooks/pi/<version>/events.jsonl`). In control mode AMC denies the `codemode` tool itself, so no Codemode script runs.
- Pi Durable is pi-agent-core's `AgentHarness` durable execution (the `replay` policy on an `AgentTool`). The `pi` CLI's unbundled dist does not use `AgentHarness`; AMC's extension does not see it. It stays not covered.
- A Pi tool call cannot carry an AMC approval, and a confirmation in Pi's UI is not one, so AMC denies every Pi call that needs approval, in every mode (receipt state `denied`, `capabilityLossy: true`).

## Per-tool claims

| Pi tool | AMC evaluates it as | Lowest class the signed config may give it | Claim in control mode |
|---|---|---|---|
| `read` | `fs.read` on every location Pi may open for `input.path` (required), its macOS name variants included | `READ_ONLY` | enforced at Pi's `tool_call` hook |
| `grep`, `find`, `ls` | `fs.read` on the location Pi opens for `input.path`, else the working directory | `READ_ONLY` | enforced at Pi's `tool_call` hook |
| `write`, `edit` | `fs.write` on the location Pi opens for `input.path` (required) | `WRITE_LOW` | enforced at Pi's `tool_call` hook |
| `bash` | the shell command plan of `input.command`: `process.spawn` per command, `git.*` for git subcommands | `WRITE_HIGH` for `process.spawn`; `git.*` keep their signed classes | enforced at Pi's `tool_call` hook |
| `powershell`, `codemode`, `tool_search`, MCP tools, any extension tool, any other name | not mapped | none | denied (the deny is enforced at the hook) |
| effects outside `tool_call` | not seen | none | not covered |

A mapped name whose tool in Pi's registry is not Pi's built-in (`sourceInfo.path` other than `builtin:<name>`) is denied. A signed ToolHub config that gives a mapped tool a lower class than this table is denied, never treated as permission.

AMC evaluates the location Pi opens, not the string the model wrote, so ToolHub's path lists and its protected `.amc` floor apply to the real target. It resolves a path as Pi 1.0.2 and 1.0.4 do (`dist/utils/paths.js`, `dist/core/tools/path-utils.js`): Unicode spaces become spaces, a leading `@` is stripped, `file://` URLs are converted and the rest resolves against Pi's working directory. It then follows symlinks as the OS does, with the case the file system stores. AMC denies a path it cannot resolve as Pi does: `~` and `~/…` (Pi expands them with its own HOME), a file URL Pi rejects, a dangling symlink, any path on Windows, and any call from a Pi whose working directory is not the AMC workspace. Under AMC's default signed policies `read` is allowed inside `./workspace/**`, `write` and `edit` need one approval (so Pi denies them) and `bash` runs `process.spawn`, which needs an exec ticket (so Pi denies it). Widening that posture is an operator decision.

## Install

```bash
amc up                                                   # the loopback Bridge control needs
amc connect hooks install --provider pi --agent my-agent --mode control --dry-run   # with the `pi` you run on PATH
amc connect hooks install --provider pi --agent my-agent --mode control
amc connect hooks status --provider pi
amc connect hooks health --provider pi
amc connect hooks lifecycle --agent my-agent --action <action-id>
amc connect hooks remove --provider pi
```

`--mode observe` is the default. The installer writes:

- `.pi/extensions/amc.js`: imports AMC's `dist/adapters/pi/amcPiExtension.js` by absolute path and starts it for this workspace and mode. It reads Pi's `VERSION` itself, because Pi resolves its own module only for files it loads directly.
- `.amc/hooks/pi.lease`: a dedicated lease (`hook:observe`, plus `hook:control` in control mode), mode `0600`.
- `.amc/hooks/pi.json` and `.sig`: a manifest signed by the workspace auditor key. It binds the SHA-256 of `.pi/extensions/amc.js` and of AMC's extension module, the lease, the Bridge origin, the qualified versions and the public keys of AMC's `receipt` signing purpose (P1-08) at install. In control mode it also binds the Pi install sessions must run: the `@earendil-works/pi-coding-agent` package behind `pi` on `PATH` (the `piPackageDir` option names it programmatically), its version and one SHA-256 over its `package.json` and the directory holding its `bin.pi` entry (`dist/bundle`, the code the CLI runs). With no Pi found it binds none, and no session can register.
- the managed `.gitignore` block for `.amc/hooks/`.

`status` reports an edited extension file, a changed AMC module, changed AMC receipt keys or a changed, upgraded or removed Pi install as `drifted`; reinstall to bind them. A reinstall starts with no registered sessions, so running Pi sessions must restart. `remove` deletes only these files and the `.pi` directories the install created, and revokes the lease.

### Pi must load the extension

Pi loads `.pi/extensions/` only for a trusted project (Pi's `docs/security.md`, "Understand project trust"). Print, JSON and RPC modes skip it unless the project is trusted (`/trust`), `defaultProjectTrust` is `"always"`, or the run passes `--approve`. `pi -e .pi/extensions/amc.js` loads it explicitly. If Pi does not load it (trust declined, `--no-extensions` without `-e`, a load error), nothing is enforced and AMC records nothing. The conformance run pins this: with `--no-approve` a write that AMC would deny runs, and AMC records no decision. `hooks health` showing no events for a project you expect to be controlled is the signal.

## Session registration: a lease-holder attestation

A claim for a Pi session comes only from a registration AMC recorded for that session under the current installation. In control mode the extension registers each Pi session at `session_start` (and, if that failed, before the session's first call): `{ hook_event_name: "session_start", pi: { version, mode, sessionId, extensionSha256 } }`, where `extensionSha256` is the SHA-256 of the extension module that is running. AMC refuses a registration from an installation that is not a signed control installation, or for another agent. It then measures the disk itself and refuses any mismatch with the signed manifest: the installed `.pi/extensions/amc.js`, AMC's extension module, and the bound Pi install (version and digest). The session must report the bound Pi's version. Otherwise AMC records a registration (`amc.pi-session-registration/v1`: agent, SHA-256 of the session id, the Pi version read from disk, module digest, AMC's digest of the Pi install, the manifest's digest, mode, qualified or not, request digest) with a `work_accepted` receipt signed by the `receipt` purpose key. The extension accepts it only if that receipt verifies under the pinned keys and binds what it sent. Re-registering a session with other values is a conflict.

What a registration is: registration made with the session lease and matching on-disk extension and Pi digests. What it is not: proof that Pi ran. A process holding the lease can still attest without Pi. AMC cannot prove Pi executed the hook; it can prove only that every allowed call went through AMC with a signed receipt.

- A call in a Pi session without a verified registration under the current installation is denied: the session is not governed, and nothing reads "enforced".
- A call naming another Pi version than its session registered is denied.
- Every call rechecks the installed `.pi/extensions/amc.js`, AMC's extension module and the bound Pi install against what the session registered. Each file is opened without following a final symlink and hashed from that descriptor; its digest is cached per process, with no expiry, only for exactly the descriptor's (device, inode, size, mtime, ctime) in nanoseconds. A changed, renamed, deleted, unreadable or symlinked file, or any stat or read error, denies the call as not governed, with an advisory receipt, never one marked enforced. Installing, removing and registering clear the cache.
- A registration whose ledger row or receipt fails verification counts as none: the call is denied and `status` reports the workspace invalid.
- `amc connect hooks status|health --provider pi` derive the claim from registrations under the current manifest: `enforced_at_pi_tool_call` when the installation's status is `installed` and at least one such session runs a qualified Pi, otherwise `not_governed` (observe installations read `observed`). A drifted, expired or invalid installation, or a reinstall no session has registered under yet, reads `not_governed`. They always add: AMC cannot see sessions where Pi did not load the extension; they are reported as not governed.

## How a decision is made and bound

1. On `tool_call` the extension checks the event shape (`toolName`, `toolCallId`, plain-object `input`). It requires the input to be plain JSON data (no getters, proxies, class instances, symbol keys, array holes or non-finite numbers) and freezes it in place, all the way down, before anything is sent. Pi runs that very object (pi-agent-core `prepareToolCall` passes the same `args` to the hook and to `execute`), so no code can change what runs while AMC decides or afterwards: a mutation throws, and Pi blocks a throwing handler. It then posts an `action.requested` observation, which AMC must answer as recorded, and `{ hook_event_name: "tool_call", tool_name, tool_input, pi: { version, mode, sessionId, toolCallId, parentToolCallId, nonce, cwd, builtinTool } }` to `/bridge/hooks/control/v1` with the lease, where `cwd` is Pi's working directory and `builtinTool` says whether Pi's registry (`getAllTools()`) names Pi's own built-in for this tool. Its wait is bounded at 5 s.
2. AMC derives the action id from Pi's session id and call id (an id the payload names is ignored), refuses a Pi version outside the qualified set (an unreadable one included), a working directory other than the workspace and a mapped name that is not Pi's built-in, maps the tool with the table above at the locations Pi opens, and evaluates the signed ToolHub config, Action Policy and Approval Policy.
3. AMC requires a verified registration of this Pi session for this Pi version (above); without one the call is denied.
4. An allow binds a P1-02 authorization record: principal and delegation from the hook lease, normalized-argument and policy digests, idempotency key = Pi's call id, execution id = AMC's action id. A record that cannot bind (expired lease, a class the lease does not cover) denies.
5. Pi's response is `{ block: false, requestSha256 }` or `{ block: true, reason, requestSha256 }`, where `requestSha256` is the digest of the exact request. AMC records a v2 `action_state` receipt (`authorized` or `denied`, with the record digest and `enforcement: { level: "enforced", boundary: "pi:tool_call" }` only for a registered session of a qualified Pi) whose body digest covers that response. Receipts are signed with P1-08's `receipt` purpose key.
6. The extension allows only if the receipt verifies under a `receipt` purpose key pinned at install and binds this action, call id, request digest and state, and only if the input still serialises to what it sent.

Each request carries a fresh nonce, so a decision is single-use: re-sending the same call (for example from a restarted Pi) is a conflict, never a second decision, and the call is blocked. Any error, timeout, HTTP error (a 409 included), a request observation AMC did not record, a latched workspace, malformed or unbound answer, bad signature, missing or non-`0600` lease, missing or mismatched manifest, unrecognised event, input that is not plain data or Bridge outage blocks the call with `AMC control unavailable; action denied.` Observe mode never blocks.

On `tool_result` the extension posts `action.completed` or `action.failed` without arguments, output or error text. In control mode it then posts the outcome to the control route: `{ hook_event_name: "tool_result", pi: { sessionId, toolCallId }, tool_name, tool_input, isError, ingressRecorded, decisionReceiptSha256 }`, where `ingressRecorded` says whether the observed ingress recorded the outcome and `decisionReceiptSha256` is the digest of the decision receipt the extension verified for this call. AMC accepts it as the call's outcome only when it names that decision, comes with the lease that obtained it and its session is still registered; otherwise it records it as unmatched and refuses it (409). It normalizes the input the way it did when deciding and records `amc.pi-post-execution/v1` (decision, authorized and reported argument digests, `authorizationMismatch`), signed and verified as written; the input itself is never stored. An outcome reported with `ingressRecorded: false` is recorded and refused (422). These are observations, never enforcement: the call already ran, so an outcome AMC did not record is reported in Pi, and `hooks lifecycle` shows the mismatch or conflict.

## When AMC cannot record evidence

Pi follows the rules of Claude Code's hooks ([Claude Code hooks](claude-code-hooks.md#when-amc-cannot-record-evidence)), with the same shared latch and intake caps.

- **Audit latch.** If AMC's own writer fails (a disk, signing or chain fault) while recording a Pi session registration, a decision or an outcome for a registered session, the Bridge latches the workspace's hooks: every later hook request of that workspace, any session, event or provider, is refused, so every Pi `tool_call` is blocked and Pi is told the workspace is latched. The latch is kept in `<AMC home>/state/hook-audit-latch/`, so a restart, a new session or a later successful write does not clear it. Only the owner clears it: `amc connect hooks health --provider pi --recover-latch` (owner mode, vault passphrase) records the recovery as verified evidence first. Restart the Bridge afterwards.
- **Repeats.** AMC records one outcome per call. The same outcome sent again for the same decision is answered as recorded and not written twice; any other repeat is kept beside the first, flagged (`conflictOf`) and refused (409). The extension never counts a 409 as recorded: a request observation that conflicts with one already recorded blocks the call before any decision.
- **Intake caps.** Outcomes are capped per session (120 a minute), per lease (360) and per workspace (1,200); session registrations per lease (30) and per workspace (60, shared with Claude Code), counted per lease and workspace, so new sessions cannot reset a cap. An outcome over a cap is listed in a signed summary row, its call reads `observationNotRecorded: "rate-limited"` in `hooks lifecycle`, and the capped scope's `tool_call` decisions are denied until its minute passes. Decision rows are never capped.
- **Input never latches.** A malformed, oversized, unauthenticated, replayed or conflicting outcome, one reported with `ingressRecorded: false`, or one from a session without a verified registration is refused and never trips the latch.

## Limits

- AMC decides before Pi executes and cannot recheck at execution the way AMC's own tool pipeline does; the receipt records the decision, the conformance run supports that Pi honours it.
- Pi runs `tool_call` handlers in load order (project `.pi/extensions`, then `~/.pi/agent/extensions`, then configured and `-e` paths) and stops at the first block. An extension loaded before AMC can change the input AMC sees (AMC decides on what it sees, which is what runs). Once AMC's handler starts, no code can change the input, but a later handler can block the call or act outside `tool_call`.
- AMC resolves paths when it decides; Pi opens them when it runs. A symlink swapped in between is outside the hook (OS containment is not covered).
- Pi waits on a handler without a limit; AMC bounds its own wait (5 s). A handler from another extension can still hang a call.
- Qualification covers the `pi` CLI, whose bundle embeds its agent runtime. Embedding Pi through its SDK resolves `@earendil-works/pi-agent-core` from `node_modules` (1.1.0 on 2026-10-12) and reports mode `print`; it is not qualified.
- Receipts and registrations are signed with the workspace's `receipt` purpose key: a local audit trail, not a portable verdict.
- Decision latency on the qualification machine is above the 50 ms p95 overhead target (see below).
- An outcome the Bridge never received (it was unreachable) latches nothing; Pi reports it, and the next call is blocked only while the Bridge stays unreachable.
- Outcomes are authenticated by the lease, not by the session: a lease holder can push another session of the same lease into backpressure for a minute.

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

`tests/conformance/piToolCall.conformance.test.ts` (`AMC_PI_CONFORMANCE=1`) runs each pinned `pi` CLI against a local scripted model endpoint (an OpenAI-compatible stream on loopback; no live model). The record is `qualification/2026-10-18-P1-22/pi-conformance.json` (the run after the evidence-latch follow-up; the first run is `qualification/2026-10-12-P1-22/`), hashed by that folder's `receipt.json`. The matrix below is generated from it by `npm run gen:pi-conformance-matrix`.

<!-- pi-conformance-matrix:start -->
Run 2026-10-18T01:09:51.514Z on local macOS arm64 (not CI), AMC commit `0edf4a93666c`.

| Case | Pi 1.0.2 | Pi 1.0.4 |
|---|---|---|
| Allowed `read` runs; recorded Pi version | yes; 1.0.2 | yes; 1.0.4 |
| Allowed `read` outcome recorded, bound to its decision | yes | yes |
| Writer fault on an outcome: next call ran; ran after owner recovery | no; yes | no; yes |
| Session registered before its first call; claim | yes; enforced_at_pi_tool_call | yes; enforced_at_pi_tool_call |
| `write` needing approval: file created | no | no |
| Denied `bash`: effect | no | no |
| Unmapped extension tool: effect | no | no |
| `codemode` tool: effect | no | no |
| `@`-prefixed `read` runs; read through a symlink into `.amc` | yes; no | yes; no |
| Extension tool under a built-in's name (`find`): effect | no | no |
| Codemode nested call emits `tool_call` (parent id) | yes (call_codemode_probe/1) | yes (call_codemode_probe/1) |
| Bridge stopped: tool ran | no | no |
| Decision receipts verified cold | 124 verified, 0 failed | 124 verified, 0 failed |
| Limit, untrusted project: write ran; AMC decisions; registrations | yes; 0; 0 | yes; 0; 0 |
| Decision latency p50 / p95 (ms, n) | 58.2 / 107.8 (100) | 62.3 / 91.1 (100) |
<!-- pi-conformance-matrix:end -->

A new Pi release is blocked (`AMC has not qualified Pi <version>`) until it passes this run and is added to `QUALIFIED_PI_VERSIONS` (`src/adapters/pi/piVersions.ts`).

Related: [Pi callback telemetry](../PI_CALLBACK_TELEMETRY.md) (passive, self-reported) and [`amc connect hooks`](../../README.md#observe-or-control-native-provider-actions).
