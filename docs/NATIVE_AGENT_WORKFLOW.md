# Your first native AMC workflow

This workflow requires the current **1.2.0 source build**. Follow [the source installation](INSTALL.md#option-b-from-github-development) first; the published npm package and GitHub release are 1.1.1 and predate these native commands.

AMC runs its own model loop with workspace tools, approval gates, sessions, context compaction and MCP connections. It does not need DSH, Pi or another agent runtime. Use this path to request an answer, work with explicitly permitted files, continue a recorded conversation and inspect its evidence. A first score is a baseline; it is not an agent task.

For a browser workflow, open **Native Tasks** in Studio. It runs the same native AMC runtime with selected-agent ownership, bounded turns, cancellation, approval links and resumable sessions. See [Run native AMC tasks in Studio](NATIVE_STUDIO_TASKS.md) for setup, recovery and the browser's tool boundaries.

Installed local exercises cover file editing, terminal chat and extensions, TypeScript/Python session lifecycle, and governed stdio/HTTP MCP calls with real approvals. They use scripted local providers; live-provider quality, broader platforms and human usability remain separate measurements. The corrected native Linux shell and Streamable HTTP MCP each have separate installed acceptance receipts.

## Inspect and set up

From the project directory where you want to work:

```sh
amc agent-loop guide
```

Choose a provider by rerunning the guide with `--provider`, or open `amc agent-loop chat` and answer its terminal prompts. The guide inspects local workspace markers and credential metadata. It creates no workspace, opens no session, starts no service or watcher, and makes no provider call. A `ready` result means local configuration is present, not that a credential authenticates or a model is available. `--json` returns structured next-action arguments and their working directory.

If the guide reports a missing workspace, initialize explicitly with `amc init --minimal`, then rerun it. For installation, use [the source build instructions](INSTALL.md#option-b-from-github-development).

| Provider choice | Meaning | Default credential reference |
|---|---|---|
| `openai` | OpenAI Chat Completions | `OPENAI_API_KEY` |
| `openai-responses` | Explicit OpenAI Responses route | `OPENAI_API_KEY` |
| `anthropic` | Anthropic Messages | `ANTHROPIC_API_KEY` |
| `stub` | Local recording demonstration; no real model answer | None |

Real providers require a model ID you choose and can access. Responses currently supports text and function-tool exchanges; unsupported reasoning replay, media and hosted-tool output are refused. Selecting another provider does not silently fall back to `stub`.

Guide and chat accept the same explicit `--base-url` origin as run and retain it in every task and resume command. They reject embedded credentials, paths, query strings and fragments before generating a command. For a custom Responses server, `--base-url` is the server origin, for example `http://127.0.0.1:8080`. AMC appends `/v1/responses`; do not include `/v1` or `/responses` in that option. The server must implement the supported Responses contract; an OpenAI-compatible Chat endpoint alone is insufficient.

Store a credential using its reference name, with the value entered at the masked prompt or through stdin:

```sh
amc credentials set OPENAI_API_KEY
amc credentials describe OPENAI_API_KEY
```

Never put the value in a command argument. `describe` reports configuration metadata without printing the secret. Lookup precedence is environment, managed credential file, project `.env`, then user `.env`. If you use `--credentials-home` or `--credentials-file` with the guide/run/chat commands, use the matching `--home` or `--file` with `credentials`. Follow the guide's exact generated action when file paths or permissions need attention.

**Select the native agent explicitly with `--agent reviewer`.** Guide, run and chat use the same selection order as AMC: the explicit flag, `AMC_AGENT_ID`, `.amc/current-agent`, then `default`. The guide pins the resolved identity in its next native command. Chat pins it for all turns, inspections and authenticated approval requests, even if the current-agent file changes while the terminal is open. Tools, budgets, MCP and delegates receive that same identity; selecting an agent does not create or widen its grants. Resume requires the original signed session identity and refuses a mismatch before recovery or dispatch. Fork creates a fresh conversation under the selected identity with verified parent lineage; it does not copy the parent conversation.

## Run and continue a task

For an interactive real task, select the route and let chat ask for your model ID:

```sh
amc agent-loop chat --provider openai-responses --tools none
```

After local setup is present, enter a task such as “Explain how to distinguish an artifact signature from evidence that a task succeeded.” This requests a real model answer and can incur provider charges. With `--tools none`, the model cannot inspect your repository; supply relevant content yourself. Chat displays the selected session, model, demonstration status and tool scope. You can bound each request/turn with `--max-tokens` and `--max-steps`.

To exercise recording locally without a provider:

```sh
amc agent-loop run "Check the recording path." --provider stub --max-steps 2
```

The stub output demonstrates orchestration and evidence recording, not model capability. For a real single-turn command, use the concrete `agent-loop run` action produced by `guide` after you select a real provider/model and configure its credential. Human output includes a verification next step; `--json` retains the structured run summary.

Chat runs each turn through the existing governed `agent-loop run` path with `--keep-open`. It requires a terminal and does not implement an alternate runner. Live text is labeled provisional until the model request settles into recorded evidence; interrupted or truncated previews are not a completion verdict. For scripted turns, add `--stream` to `agent-loop run`: previews go to stderr, while `--json` keeps the final structured result on stdout.

| In chat | Behavior |
|---|---|
| `/inspect` | Shows the current recorded conversation and event structure. It is not a verification verdict. |
| `/verify` | Runs the native evidence verifier for the selected session. |
| `/compact` | Lists current context origins, then asks for a reviewed range, your UTF-8 summary file and a reason. Records compaction while retaining raw evidence. |
| `/extensions` | Lists loaded native extensions, their command names and reviewed digests. |
| `/load` / `/unload` | Prompts for an already signed manifest path or a loaded extension ID. Changes future turns; existing history remains. |
| `/fork` | Queues a child for the next task. No child is created until that task is submitted. The child has verified parent lineage and a new conversation; parent messages are not copied. |
| `/exit` | Leaves chat; a successfully released, unsealed session can be resumed later. |
| Ctrl-C | Requests cancellation of the active command, or exits at the input prompt. Read the resulting status; cancellation is not successful task completion. |

These built-in slash commands prompt for any needed inputs. Loaded extension commands accept text arguments. Outside chat, use the actual session ID printed by the run with `amc session show SESSION_ID` or `amc agent-loop verify SESSION_ID`. The `session` group is an explicit operator inspection/recovery surface and may be hidden from top-level help.

## Handoff, verification and limits

Resume an eligible session with `agent-loop run --session SESSION_ID` or `agent-loop chat --session SESSION_ID`, alongside your chosen provider/model options. A one-shot run normally seals its session; add `--keep-open` when you intend a later handoff. Chat uses that option for its turns. There is no separate `session release` CLI command: native run cleanup performs the signed handoff when requested. `amc session verify` reports an authenticated completed handoff as `released` even after it ages; `interrupted` means the unclosed session has no accepted completed handoff and needs inspection. A release does not seal the session or hide an unfinished turn. Applications using the [native SDK](NATIVE_SDK.md) can explicitly call `session.release()` before closing the client.

A live writer cannot be displaced by a second process. Closed sessions cannot resume; `--fork-from SESSION_ID` starts a new child from a verified parent reference. The current source supports eligible native SQLite and JSONL resume/recovery under their original backend, signed ownership, agent, configuration and evidence checks. It does not migrate a session between backends or accept unsupported ownership history. Recovery of a demonstrably dead local owner's incomplete turn preserves unknown outcomes and does not retry a possibly executed tool. Read [Session Resume](SESSION_RESUME.md) before using recovery options; `--force` does not override a live or unknown owner.

Verification checks the recorded evidence and its trust anchor. It does not judge the answer correct, certify policy compliance or award maturity by itself. Keep artifact validity, execution outcome and score readiness separate. See [Evidence Trust](EVIDENCE_TRUST.md) and [After the First Score](AFTER_FIRST_SCORE.md).

## Compact context without erasing evidence

Between turns, use `/compact` in chat. Review the listed origin event IDs, choose a contiguous range, write the replacement summary to a local UTF-8 file, and provide its path and your reason when prompted. AMC does not send the conversation to an external summarizer. The next native turn reads the compacted surface; original signed rows remain available for reconstruction and verification.

Outside chat, `amc session compact SESSION_ID --list --json` returns stable origin IDs and `headEventHash`. Apply a reviewed change with `session compact` using `--origins` for the ordered comma-separated IDs, `--summary-file` for your file, `--reason` for the rationale, and `--expect-head` for that exact listed hash. The command must acquire and release an eligible existing writer. A changed head, live owner, closed or interrupted session, reordered/foreign origins or a growing summary refuses the edit.

The default operation summarizes a range. `--replace` preserves one entry's role, kind and tool-result outcome; `--drop` removes a complete range from model context and excludes `--summary-file`. Incomplete tool pairs cannot be dropped. Receipts report measured payload bytes, not estimated tokens, money saved or answer quality. Use `/verify` separately after the edit.

## Reuse a reviewed native composition

Use chat's `--preset` option to select an existing signed profile from `.amc/agents.yaml`. Explicit provider/model, persona and bound options take precedence over profile defaults. Without either an explicit provider/model or a signed choice, chat asks for them; it never guesses a live model or falls back to a demo after failure. A changed or unverifiable selected profile requires a new reviewed chat.

`--persona` supplies an explicit native persona. `--delegate` enables in-process child agents only with workspace tools and an independently signed `delegate` tool grant. `--delegate-scope` narrows the child's action classes, and `--max-delegation-depth` bounds actual nesting. Nested children inherit non-widening scopes, signed approval requirements, per-turn limits and parent cancellation; existing budgets and write scopes still apply. Foreign-delegate and code-mode profiles are refused by this chat surface rather than silently changed. These controls do not establish the quality of a delegated answer.

Use repeatable `--delegate-stop` conditions to bound each delegation's lifetime, for example `--delegate-stop timeout-ms:60000`. Native run/chat and signed presets preserve these conditions through the composed child capability. See [Native delegation limits](NATIVE_DELEGATION_LIMITS.md) for turn counting, timeout settlement, explicit reset and the distinction between cancellation and confirmed process shutdown. This new implementation is awaiting combined qualification; the earlier installed receipts above do not qualify it.

For reusable context files and named prompt commands, see [Native Extensions](NATIVE_EXTENSIONS.md). Inspect and explicitly sign the manifest with AMC's existing workspace authority, then select its path with `--extension` or chat `/load`. Loading pins both manifest and content; it cannot load executable hooks, select credentials or grant tools. `/unload` removes future contributions while preserving signed history.

## Enable workspace and MCP tools deliberately

Use `--tools workspace` only after reviewing the signed firewall and `.amc/tools.yaml` allowlist, including permitted paths and write scope. Missing setup is reported before a task starts. `amc firewall enable` and `amc tools init` initialize their policies; `tools init` can overwrite an existing tools file, so inspect existing policy first. After intentional edits, re-sign with `amc tools sign`, then inspect the result with `amc tools list`. Signing validates the existing YAML and preserves its bytes and grants; it does not initialize defaults. `--json` returns signature metadata or a refused result. Review `.amc/budgets.yaml` separately and use `amc budgets sign` to sign its existing limits without replacing them. See [ToolHub](TOOLHUB.md) for policy structure.

For code review, grant only the tools you need. A signed native subset such as `fs.read`, `glob` and `grep`, each with `READ_ONLY`, can run without `fs.write`, `fs.edit` or `bash`. Preserve the existing path restrictions and protected-path exclusions when editing the policy, then sign the reviewed file. Native model requests show only the available signed tools; guessing an absent tool does not grant it. Empty, unverifiable or incompatible grants remain unavailable. Read-only tools still pass through the existing firewall, budgets, approval and evidence controls.

`fs.edit` replaces exactly one occurrence of its `find` text with its `replace` text, byte for byte: `$$`, `$&`, `` $` `` and `$'` are written as typed, never expanded as replacement patterns. It refuses when the text is absent or appears more than once, and requires the agent to have read the unchanged file first. `fs.write` and `fs.edit` write through a temporary file in the same directory that is fsynced and then renamed over the target, keeping the replaced file's mode, so an interrupted write leaves the previous contents in place. A file the caller may not write, such as one with mode 0444, is refused with EACCES and left unchanged, as an in-place write would be.

`--approve-tools ACTION_CLASS` requests the signed approval gate before tool execution under that class. Configure the approval policy and authorized decision path using [Approvals](APPROVALS.md). A grant or approval does not widen signed path scopes, budgets or other controls. Available sandbox backends and actual process confinement are different facts; Code Mode still refuses an unconfined process. This guide does not promise an OS sandbox for arbitrary extensions or MCP servers.

Native chat's approval prompt accepts a **private session-file path** for an existing authenticated local user. From the same AMC workspace, log in with an ACTIVE account from its signed users configuration. For example, if the account is named `reviewer` and the destination does not exist:

```sh
amc approvals login --username reviewer --token-file "$HOME/amc-reviewer.session" --ttl-minutes 15
```

The password prompt is masked. Login prints the actual identity, roles, expiry and canonical file path; it never prints the password or session token. Supply that path when chat requests the approval session, then review the exact pending request. The file is created exclusively with private permissions (0600); an existing destination is refused. Each login defaults to 15 minutes and accepts 5–60 minutes, matching the existing session API's minimum. Use `--json` for metadata, or explicitly select `--password-stdin` for redirected input of at most 4096 UTF-8 password bytes; passwords are never command arguments. Input keeps whitespace and removes only one optional final line ending.

Login does not create an account, assign OWNER or grant approval authority. An administrator provisions signed local accounts through the existing `amc user init` first-owner setup and `amc user add` workflow; use `amc user list` to inspect existing accounts before setup. Existing request roles, quorum, policy, revocation and expiry still apply. The installed stdio MCP acceptance exercised this login and an authenticated decision against the exact pending request before allowing the tool effect.

For a local or remote MCP server, follow [Native MCP](NATIVE_MCP.md):

1. Create an explicit server JSON configuration. Stdio uses a selected executable and credential references in `envRefs`; Streamable HTTP uses a pinned endpoint/origin and `headerRefs`. Store secrets through the credential service.
2. Run `amc agent-loop mcp-catalog --config mcp.json --json`. This connects to the configured server and disposes the connection after discovery; it is not part of the read-only guide.
3. Review the catalog digest and original/generated tool names. Pin `expectedCatalogDigest`, choose each remote tool/action-class grant, and independently add the exact generated names and matching classes to signed tool policy.
4. Supply `--mcp-config mcp.json`, `--tools workspace` and the matching `--approve-tools ACTION_CLASS` to run/chat. All grants in that invocation must match the approval class. No allowlist is widened automatically.

Changed catalogs/configuration, missing grants or broken connections refuse dispatch. Mounts belong to the selected session and are disposed at exit/cancellation; no old connection grants are reused automatically. The native client supports stdio and Streamable HTTP, with separate installed CLI/SDK acceptance for each transport.

## Embed the native runtime

The [native SDK](NATIVE_SDK.md) lets Node and Python applications own a local AMC process. The TypeScript entry point is `AMCNativeClient` from `agent-maturity-compass/sdk/native`. Use `newSession()` and `session.prompt()` for multiple turns, iterate committed response updates, request cancellation, and call `closeAndVerify()` for a separate cold-verification receipt. Use explicit `session.release()` followed by `resumeSession()` for an eligible handoff.

SDK updates are committed response blocks, not a claim that every provider token is already verified. The SDK's ACP configuration is its own supported surface: consult its guide for provider and tool options rather than assuming every `agent-loop run` flag exists there. Closing, releasing and verifying have different effects; choose the operation that matches the application's intended session lifecycle.

## Public task validation

A completed model turn does not establish that its result works. AMC can run explicitly selected public checks after a normal turn, using its existing signed `bash` tool pipeline, budgets, approval gate, timeout and cancellation controls. Check results are separate from both the turn ending and cryptographic evidence verification. These are AMC-native functions and require no DSH or Pi runtime.

Create an operator-owned JSON file containing the checks you intend to run:

```json
{
  "schemaVersion": 1,
  "checks": [
    { "id": "unit", "title": "Public unit tests", "command": "npm test", "timeoutMs": 120000 }
  ]
}
```

Select checks explicitly; merely providing the file does not select every command:

```sh
amc agent-loop run "Implement the requested change" --provider PROVIDER --model MODEL --tools workspace --validation-config ./public-checks.json --validate unit --json
```

Repeat `--validate ID` to select up to eight checks. Use `--validation-config-sha256 DIGEST` to pin the reviewed file bytes. Interactive `agent-loop chat` supports the same options and keeps the digest pinned across its child turns. The native SDK accepts `validationConfig`, `validationConfigSha256` and `validate: ["unit"]`; its result exposes `validation`. ACP returns the same result under `_meta["dev.agentmaturity.amc"].validation` and advertises `taskValidation` support. Missing metadata from an older peer is unavailable, never a validation pass.

The separate states are **not-requested**, **pending**, **passed**, **failed** and **unavailable**. A known nonzero check exit fails validation; denied execution, cancellation, timeout, missing confinement or an unknown outcome remain unavailable. Selecting a check grants no shell authority. Native Linux shell confinement and all existing signed policy checks still apply. The CLI returns a nonzero exit when requested validation does not pass, even if the model turn ended `complete`.

Validation records bind the current turn, selected IDs, configuration digest, actual call identity and output event. They do not insert synthetic model calls into the conversation or send hidden evaluator answers to the model. This version performs no automatic repair continuation. Passing the operator's public checks establishes only those checks' outcomes, not general correctness.

## Optional: bring external history and share portable evidence

External capture and imports supplement AMC evidence; they do not supply AMC's native execution features. Skip this section when you only need the standalone runtime.

Optional DSH capture (`docs/adapters/deepseek-harness.md` in the source checkout) uses an operator-installed, signed hash-pinned launcher in headless mode. Configure its gateway route/model and approved launch file explicitly. Process output is not native tool evidence; private reasoning stderr is omitted, and only actual gateway receipts establish observed model traffic. The adapter preserves DSH authentication boundaries and makes no claim to control its internal tools.

For an existing plaintext DSH v2 session export, preview the import before applying:

```sh
amc import ./session.v2.jsonl --agent default --dry-run --json
```

Inspect the reported source hashes, semantic digest, failures, unknowns and losses. Apply the same source with `--expected-digest` set to the reviewed semantic digest. The importer preserves settled stream records, tool/cancel outcomes and lineage; inherited history is not counted as new child execution. It refuses unsupported required formats/events and malformed rows. Compressed Zstandard files and v0/v1 migration require an explicit supported export first.

Imports remain `SELF_REPORTED` and `NOT_EVALUATED`. `amc imports show IMPORT_ID` lists normalized artifacts and portable profile paths. The [External Evidence Profile](EXTERNAL_EVIDENCE_PROFILE.md) explains standalone verification with `amc imports verify-profile profile.json --original original.jsonl --json`, independent digests and admitted authority keys; an unsigned profile names no signer, so that command exits 1 for it even when its digests check out. A valid portable file does not prove its source task ran or succeeded, and the profile's availability does not establish industry adoption.

## Source entry points for Graphify

Use the [Code Graph guide](CODE_GRAPH.md) for extraction and queries. The following paths identify current source entry points in a checkout; they are reading pointers, not claims that the last generated graph contains these additions. Regenerate the code-only graph after the implementation batch settles. Runtime callbacks and dynamic imports may remain inferred or unresolved.

| Workflow | Start reading here | Follow into |
|---|---|---|
| First-use inspection and credential metadata | `src/setup/nativeFirstUseGuide.ts` — `inspectNativeFirstUse` | `src/credentials/localCredentialsService.ts`; `src/cli-credentials-commands.ts` |
| Interactive and single-turn execution | `src/setup/nativeInteractiveSession.ts`; `src/setup/nativeChatProfile.ts`; `src/cli-agent-commands.ts` | `src/kernel/agentLoopRunner.ts`; packaged runtime seam `src/kernel/amcRuntime.ts` |
| Session ownership and cold verification | `src/session/sessionOwnership.ts`; `src/agent/runReport.ts` | `src/ledger/ledgerSessionTransactions.ts`; `src/session/sessionService.ts` |
| Native context compaction | `src/cli-session-compaction-commands.ts`; `src/session/sessionCompactionWorkflow.ts` | `src/session/sessionService.ts`; `src/session/surfaceCompaction.ts`; `src/session/surfaceCompactionValidation.ts` |
| Governed workspace/MCP calls | `src/agent/agentToolset.ts`; `src/setup/nativeMcpConfig.ts` | `src/mcp/nativeMcpClient.ts`; `src/mcp/nativeMcpHttpTransport.ts`; the recorder binder in `src/cli-agent-commands.ts` |
| Application-owned native runtime | `src/sdk/nativeAgentClient.ts` — `AMCNativeClient` | `src/acp/acpCli.ts`; `src/acp/acpStdioMain.ts`; `src/acp/acpAgentServer.ts` |
| Signed native text/command extensions | `src/cli-native-extension-commands.ts`; `src/extensions/nativeExtensionRuntime.ts` | `src/extensions/nativeExtensionStore.ts`; `src/prompt/context/contextHost.ts` |
| DSH process capture | `src/adapters/deepseekHarnessLaunch.ts`; `src/adapters/builtins/deepseekHarness.ts` | `src/adapters/adapterRunner.ts`; gateway and ledger capture paths |
| Imported and portable history | `src/importers/dshSessionImport.ts`; `src/importers/neutralImporter.ts` | `src/importers/externalEvidenceExport.ts`; `src/standard/externalEvidenceFiles.ts` |

Follow the actual extracted edges and read callback bindings where no static path exists. A code graph makes the implementation easier to navigate; it is not runtime evidence.

### Provider-valid tool names

Keep signed permissions and explicit tool choices in AMC's original names, such as `fs.read`. AMC translates names for its native Chat, Responses and Anthropic APIs and resolves responses against the exact offered tool set. Signed call records retain both the original permission identity and decoded provider name. Unknown or changed provider names refuse before execution; historical replay does not restore a removed grant. See [native provider identity](PROVIDERS.md#native-tool-identity-and-provider-names).
