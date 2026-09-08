# Reading AMC through its code graph

Start with the flow you need to change. The [Graphify guide](CODE_GRAPH.md) explains how to query the complete local graph. The smaller maps below reduce that graph to a few connected files so a contributor can follow an operation without opening the CLI monolith first.

The September 8 maps use the clean source checkpoint `12de7b4f10cd23eb614eea0792a52021874d8606`, including the standalone native workflow, MCP HTTP transport, immutable native shell binding, import record mapping, native budget admission, selected-agent identity and gateway stream cleanup. The [dated extraction receipt](../AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-stream-cleanup-graphify-12de7b4f/README.md) pins the exact source, tool and raw graph hashes. Six views cover native execution, imports, trust, native integrations, native budgets and sandbox/optional DSH launch boundaries. The extraction contains 25,265 symbols/75,793 relationships; the reduced local graph contains 2,080 files/7,502 directed file pairs. A generated map records source dependencies and supplies no runtime acceptance claim. Earlier qualification receipts below apply only to their named historical revisions.

## Native agent execution

Read these files in order:

1. [`cli-agent-commands.ts`](../src/cli-agent-commands.ts) validates the operator request and loads the composed runner; [`cli-agent-options.ts`](../src/cli-agent-options.ts) declares the shared command options. `agent-loop run` drives a turn; `agent-loop verify` independently reads its recorded evidence.
2. [`agentLoopRunner.ts`](../src/kernel/agentLoopRunner.ts) opens the session, composes credentials, model, prompt, approval and loop services, then disposes them in reverse order. Its [`amcRuntime.ts`](../src/kernel/amcRuntime.ts) import is the shared bridge to the private composition packages. Session continuation and forking enter through [`sessionResume.ts`](../src/session/sessionResume.ts).
3. [`agentDriver.ts`](../src/agent/agentDriver.ts) owns turn and step lifecycles. End events belong in the same control flow as cancellation and failure.
4. [`stepRunner.ts`](../src/agent/stepRunner.ts) makes a model request and dispatches tool calls through the supplied seam. [`pipelineToolSeam.ts`](../src/agent/pipelineToolSeam.ts) connects that seam to governed tool execution.
5. [`sessionService.ts`](../src/session/sessionService.ts) supplies the event vocabulary. [`sessionSpine.ts`](../src/session/sessionSpine.ts) owns the durable append boundary and advances the chain head only after a successful write.
6. [`runReport.ts`](../src/agent/runReport.ts) reads the committed rows without opening a writer to produce the run summary. Its counts describe recorded activity. `verifyAgentRun` separately checks ledger/session integrity and reconstructs the recorded requests.

The dependency map is `graphify-out/navigation/native-runtime/graph.html`. The graph is a source-navigation aid: a missing edge does not show that a dynamic service connection is absent. Start with the runner's composition order when investigating those connections.

For write ownership, follow `sqliteSessionEventStore.ts` → [`ledger.ts`](../src/ledger/ledger.ts) → [`ledgerSessionTransactions.ts`](../src/ledger/ledgerSessionTransactions.ts) → [`sessionOwnership.ts`](../src/session/sessionOwnership.ts): the SQLite transaction checks the signed owner and expected session head before payload materialization. The spine supplies the owner and expected head; resume and recovery check whether an owner can be replaced, refusing a live local process or uncertain remote liveness. The JSONL adapter also checks append ownership, but in-place JSONL resume refuses takeover without an atomic claim; use the read or fork path instead.

For tool evidence, follow the extracted dependencies from the CLI or [`subagentRunner.ts`](../src/agent/subagentRunner.ts) to [`agentToolset.ts`](../src/agent/agentToolset.ts) and [`toolPipeline.ts`](../src/tools/toolPipeline.ts), then inspect the recorder callbacks in source. Before dispatch, `runComposedTurn` binds the actual new, resumed or forked session writer to the CLI workspace toolset; a subagent supplies its own session directly. The toolset's `record` callback forwards projected rows through `SessionService.recordProjectedEvidence`. Graphify resolves the toolset call to its local recorder interface, but does not connect that callback to the concrete session method; the map therefore does not draw that runtime connection. The ownership and recorder binding mechanisms are implemented. Separate [qualification at `fdabeba9`](../AMC_OS/RESEARCH/2026-09-08-dsh-pi/full-suite-qualified-fdabeba9.md) on macOS ARM64 / Node 25.5 recorded 11,107 passing cases, zero failures or pending cases, across 1,324 test files. The external packed install, installed CLI fresh/resume/fork workspace-tool denial evidence and both cold verifiers passed. This does not qualify Linux/container execution, real-provider work, deployment or a public release.

For native delegation, read `agentToolset.ts` → [`delegateTool.ts`](../src/agent/delegateTool.ts) → [`subagentSpawn.ts`](../src/agent/subagentSpawn.ts). The spawn path uses [`delegationIdentity.ts`](../src/agent/delegationIdentity.ts) for actual depth, [`delegationPacket.ts`](../src/fleet/delegationPacket.ts) for signed admission and [`delegationEvidenceWriter.ts`](../src/agent/delegationEvidenceWriter.ts) for the parent's observation. `subagentRunner.ts` runs the child with [`delegationScope.ts`](../src/agent/delegationScope.ts) narrowing, inherited approval requirements and cancellation. Its recursive runner is passed through a capability object; inspect that construction alongside the extracted dependencies rather than treating a type-import edge as proof that the callback executed.

For packaging changes, follow [`bundle-kernel.mjs`](../scripts/bundle-kernel.mjs). It reads the immutable `src/kernel/amcRuntime.ts` wrapper and writes `dist/kernel/amcRuntime.js`, together with the inlined-package manifest and license notices. Workspace packages need their compiled entry points first. Repeating the bundle step uses the source wrapper again, preserving attribution; the generated bundle is never its own input.

[`packed-install-check.mjs`](../scripts/packed-install-check.mjs) qualifies a built tarball in a separate consumer directory. [`packed-evidence-verification.mjs`](../scripts/packed-evidence-verification.mjs) checks the installed commands' structured verifier results and unique reconstructed request IDs. These scripts establish the artifact acceptance path for AMC-1510; a source graph alone does not establish that a package has been qualified, published, or released. Build-time file paths and package resolution may not appear as direct AST edges in the focused map.

## Native tasks in Studio

The new browser flow has small modules for each boundary. Until the next extraction receipt is recorded, the September 8 `12de7b4f` graph remains the prior source snapshot; the following reading path describes the newly implemented source.

1. [`nativeTasks.js`](../src/console/assets/nativeTasks.js) owns page state, one request ID per submission, revision-bound controls and cursor reads. [`nativeTasksView.js`](../src/console/assets/nativeTasksView.js) renders scope, committed events and separate outcome/verification states. [`api.js`](../src/console/assets/api.js) preserves authentication and the hosted workspace prefix.
2. [`apiDelegation.ts`](../src/studio/apiDelegation.ts) derives the owner from a verified human session; [`nativeAdmission.ts`](../src/studio/nativeAdmission.ts) validates browser origin and mutation proof. [`nativeTasksRouter.ts`](../src/api/nativeTasksRouter.ts) accepts typed task inputs and checks read-only execution policy.
3. [`nativeTaskService.ts`](../src/studio/nativeTaskService.ts) owns bounded native clients, cancellation and release. [`nativeTaskDescriptors.ts`](../src/studio/nativeTaskDescriptors.ts) persists signed owner/agent/request/revision bindings before dispatch; [`nativeTaskProjection.ts`](../src/studio/nativeTaskProjection.ts) reads authenticated committed events and actual pending approvals.
4. [`nativeAgentClient.ts`](../src/sdk/nativeAgentClient.ts) opens the fixed AMC ACP process. [`acpCli.ts`](../src/acp/acpCli.ts), [`acpStdioMain.ts`](../src/acp/acpStdioMain.ts) and [`agentSession.ts`](../src/agent/agentSession.ts) carry the server-owned credential and tool-scope constraints into the existing native loop. The guarded tool path checks the reviewed scope again at execution.
5. [`studioApprovalAdmission.ts`](../src/studio/studioApprovalAdmission.ts) protects existing approval mutation aliases. [`approvalStudioService.ts`](../src/approvals/approvalStudioService.ts) retains real reviewer roles and quorum; a task's projected approval link is not a grant.
6. [`workspaceRuntimeRegistry.ts`](../src/workspaces/workspaceRuntimeRegistry.ts) shares one pending startup per workspace and drains accepted starts at shutdown. [`workspaceStudioProxy.ts`](../src/workspaces/workspaceStudioProxy.ts) preserves only validated native request context and cancels upstream transport on disconnect.

The `native-studio` selection in the Graphify reducer generates a focused dependency map after a fresh source extraction. Process messages and HTTP calls cross runtime boundaries; static edges cannot establish that a task executed. The [Studio task guide](NATIVE_STUDIO_TASKS.md) describes the user workflow and explicit limits.

For reopening a task while Studio is running, follow [`acpNativeSession.ts`](../src/acp/acpNativeSession.ts) to [`sessionResume.ts`](../src/session/sessionResume.ts), [`sessionRecovery.ts`](../src/session/sessionRecovery.ts) and [`ledgerVerification.ts`](../src/ledger/ledgerVerification.ts). The native continuation check validates the recorded prefix and selected native identity, treating only unfinished unrelated legacy sessions as incomplete. Present seals, payloads, signatures and chains remain checked. The normal cold verifier keeps its complete-archive rules; continuation admission is not an archive verification verdict.

## External evidence import

The reading order is [`cli-import-commands.ts`](../src/cli-import-commands.ts) → [`neutralImporter.ts`](../src/importers/neutralImporter.ts) → the lifecycle, readiness and Watch writers it calls.

| Question | Source to inspect |
|---|---|
| What format is accepted, and what will be written? | `validateNeutralImport` in [`neutralImporter.ts`](../src/importers/neutralImporter.ts) |
| Who selects the parser, redacts input and writes the import? | `parseCandidates` and `runNeutralImport` in [`neutralImporter.ts`](../src/importers/neutralImporter.ts) |
| Where are normalized JSON, unevaluated reports and Markdown built? | [`neutralImportPresentation.ts`](../src/importers/neutralImportPresentation.ts), using the already-redacted projection and type-only public plan/candidate contracts |
| Which retained source records map to traces, and which details are omitted? | `buildNeutralRecordMapping` in [`neutralImportMapping.ts`](../src/importers/neutralImportMapping.ts), called by the import orchestrator |
| Where does Studio render the review? | [`app.js`](../src/console/assets/app.js) calls [`neutralImportReview.js`](../src/console/assets/neutralImportReview.js) with the preview receipt |
| Where are generic trace/event rows converted? | `tracesFromCandidate` and `toProductionTrace` in [`traceMapping.ts`](../src/importers/traceMapping.ts) |
| Where are Pi session versions, branches and nested failures interpreted? | `detectPiSession`, `parsePiSession` and `piSessionTraces` in [`piSessionImport.ts`](../src/importers/piSessionImport.ts) |
| Has an evaluation actually happened? | [`evidenceReadiness.ts`](../src/diagnostic/evidenceReadiness.ts) and [`EVIDENCE_TRUST.md`](EVIDENCE_TRUST.md) |
| What lifecycle state is published? | [`episodeRecord.ts`](../src/lifecycle/episodeRecord.ts) and [`lifecycleRunArtifact.ts`](../src/lifecycle/lifecycleRunArtifact.ts) |
| Where do failed traces become Watch findings? | [`traceFailureIndex.ts`](../src/watch/traceFailureIndex.ts) |

The focused map is `graphify-out/navigation/evidence-imports/graph.html`. Imported records remain self-reported and unevaluated. A signature on the generated artifact does not establish that AMC observed the original activity. Pi v3, DSH v2 and callback telemetry have separate strict parsers before generic mapping. Source time and durations remain unknown when missing or invalid. The reviewed semantic digest binds Studio's apply step to the source preview; follow `importerRouter.ts` for that request path.

The `amc-record-map/1` receipt links redacted source pointers and line positions to projected traces. Read its disposition counts and bounded detail coverage together: retained context, malformed or unsupported records, omitted detail, source-reported time and unknown cost are distinct values. The browser renderer consumes that receipt; it does not rerun import parsing or turn source claims into observed execution.

For portable evidence, follow [`externalEvidenceExport.ts`](../src/importers/externalEvidenceExport.ts) → [`externalEvidenceProfile.ts`](../src/standard/externalEvidenceProfile.ts). The first constructs an explicitly lossy operational projection; the second has no AMC service dependencies and validates the profile and independently configured authority scope. [`externalEvidenceFiles.ts`](../src/standard/externalEvidenceFiles.ts) supplies bounded file input for `imports verify-profile`. Full redacted source and the portable projection are distinct artifacts.

## Native integrations

The `native-integrations` map separates operator interfaces from runtime composition:

- [`nativeFirstUseGuide.ts`](../src/setup/nativeFirstUseGuide.ts) inspects local configuration; [`nativeInteractiveSession.ts`](../src/setup/nativeInteractiveSession.ts) owns the interactive command lifecycle. The guide resolves the actual selected agent through `fleet/paths.ts`; chat carries that identity into child commands and approval handling. Read `sessionResume.ts` for the signed `session/open` identity check before a resumed writer can claim ownership.
- [`nativeChatProfile.ts`](../src/setup/nativeChatProfile.ts) resolves signed presets and explicit operator overrides; [`nativeExtensionRuntime.ts`](../src/extensions/nativeExtensionRuntime.ts) pins declarative context and named prompt commands. Neither is an alternate model loop or a tool grant.
- [`nativeApprovalLoginCli.ts`](../src/approvals/nativeApprovalLoginCli.ts) calls [`nativeApprovalLogin.ts`](../src/approvals/nativeApprovalLogin.ts), which authenticates an existing signed local user through [`authApi.ts`](../src/auth/authApi.ts) and creates a private tracked session file. [`nativeApprovalIdentity.ts`](../src/setup/nativeApprovalIdentity.ts) reads that file for [`nativeInteractiveApprovals.ts`](../src/setup/nativeInteractiveApprovals.ts); request roles and quorum remain separate authorization checks.
- [`nativeMcpConfig.ts`](../src/setup/nativeMcpConfig.ts) resolves explicit grants and credential references; [`nativeMcpClient.ts`](../src/mcp/nativeMcpClient.ts) owns the pinned remote catalog and connection. `agentToolset.ts` and `toolPipeline.ts` still own native permission/evidence admission.
- [`nativeMcpHttpTransport.ts`](../src/mcp/nativeMcpHttpTransport.ts) supplies the explicit Streamable HTTP transport used by the client and validated by configuration loading. Follow its endpoint/origin and session pins, header-reference admission, bounded notification lifetime, cancellation and close paths. Transport messages remain separate from the client's catalog/schema checks and native tool authorization; a source dependency does not demonstrate a successful network exchange.
- [`nativeAgentClient.ts`](../src/sdk/nativeAgentClient.ts) owns a local ACP child. Follow `acpAgentServer.ts` for sessions, `acpProjection.ts` for committed updates and `agentSession.ts` for verified load/release. A client's prompt result and cold verification receipt mean different things.
- [`providerCapabilities.ts`](../src/llm/adapter/providerCapabilities.ts) admits explicit protocol/modalities. `openaiResponsesEncoder.ts` creates stateless Responses requests and `openaiResponsesAdapter.ts` decodes that protocol; historical Chat/Anthropic encoder bytes remain separate.

## Native budget admission

The `native-budgets` map separates operator policy, pre-dispatch admission and usage reconstruction. At `12de7b4f` it contains 22 files and 36 directed source pairs; open `graphify-out/navigation/native-budgets/graph.html`. Older map receipts remain historical snapshots.

1. [`cli-budget-commands.ts`](../src/cli-budget-commands.ts) exposes reviewed budget signing and status. [`cli-tools-commands.ts`](../src/cli-tools-commands.ts) exposes reviewed tool grants separately. Signing validates the existing bytes instead of replacing the policy with defaults.
2. [`llmRuntime.ts`](../src/llm/adapter/llmRuntime.ts) admits a model dispatch after request preparation and before transport. [`policyGuards.ts`](../src/tools/guards/policyGuards.ts) admits a native tool before its body executes.
3. [`nativeBudgetAdmission.ts`](../src/budgets/nativeBudgetAdmission.ts) checks the signed per-agent policy and writes a signed reservation inside one workspace transaction. [`ledgerSessionTransactions.ts`](../src/ledger/ledgerSessionTransactions.ts) keeps nested evidence writes inside the caller's transaction.
4. [`nativeBudgetUsage.ts`](../src/budgets/nativeBudgetUsage.ts) reads authenticated event history, derives the root agent from the native session, and joins reservations to recorded outcomes. Follow request/header references and tool tokens; counting every audit and result row would count a call more than once.
5. [`streamRecorder.ts`](../src/llm/adapter/streamRecorder.ts) retains usage provenance in [`requestOutcomeMeta.ts`](../src/session/requestOutcomeMeta.ts). Known subtotals, unavailable usage, denied tools and unresolved execution are separate values. A configured threshold does not supply an exact tokenizer or provider price.

## Sandbox and DSH launch

The `sandbox-and-launch` map shows two different entry paths. Native execution begins with the immutable definition selected by [`toolPipeline.ts`](../src/tools/toolPipeline.ts). The signed allowlist guard checks its private [`nativeSandboxBinding.ts`](../src/sandbox/nativeSandboxBinding.ts) admission before the bound bash body reaches [`nativeSandboxPolicy.ts`](../src/sandbox/nativeSandboxPolicy.ts), `sandboxRunner.ts` and `bwrapBackend.ts`. The binding rechecks the selected execution and signed policy digest at launch. Explicit `bash.nativeSandbox` directories supply write grants; ordinary `allow.paths` retain argument-validation semantics and never become mounts. Read `toolsSchema.ts` and `toolhubValidators.ts` alongside this flow; a caller-provided flag cannot replace the confined definition.

The backend returns an explicit launcher/status contract through `runProcess.ts`, and `agentToolset.ts` records it through the selected session writer. Command success alone is not an enforcement receipt. The Linux shell omits host home/procfs and direct socket networking, and Code Mode remains refused. These are source reading paths; actual host qualification belongs to the separately pinned installed receipts.

External DSH launch configuration and execution meet in `adapterCli.ts` → [`adapterRunner.ts`](../src/adapters/adapterRunner.ts) → `deepseekHarnessLaunch.ts`. The operator pins launch bytes and selects an explicit gateway route. The runner forwards SIGINT/SIGTERM to its child, retains the requested interruption even if the child exits zero, removes its signal listeners and escalation timer on close, and disposes private launch state in `finally`. Process output does not prove DSH's internal tool hooks or endpoint observation. Separate `dshSessionImport.ts` handles a plaintext v2 session after capture, with inherited events distinguished from child execution.

For HTTP stream cleanup, follow [`gateway/server.ts`](../src/gateway/server.ts) → [`streamPassthrough.ts`](../src/gateway/streamPassthrough.ts), now visible in the same focused Canvas. The relay destroys an unfinished upstream when the downstream closes, rejects premature upstream completion through async iteration, and removes its close listener in `finally`. The caller records a request error instead of completing a successful receipt, and does not try to replace already-sent stream bytes with JSON. The adapter child and gateway are separate process/network boundaries; no source-call edge is invented between them. Actual interruption, listener cleanup and receipt outcomes require the separately pinned runtime acceptance.

For compaction, start at `sessionService.ts`, then [`surfaceCompaction.ts`](../src/session/surfaceCompaction.ts) and [`surfaceCompactionValidation.ts`](../src/session/surfaceCompactionValidation.ts). Current payload bytes are measured from authenticated origins. The original evidence remains available and reconstruction validates the signed replacement receipt. Caller-supplied savings are not measurements.

## Signing authority and exported proofs

Follow both the local reader and the exported representation:

1. [`keys.ts`](../src/crypto/keys.ts) selects signing keys and historical verification candidates.
2. [`vault.ts`](../src/vault/vault.ts) owns private material and key publication; [`keyHistoryEnvelope.ts`](../src/crypto/keyHistoryEnvelope.ts) authenticates admission and [`keyRotationReceipt.ts`](../src/crypto/keyRotationReceipt.ts) records continuity. [`keyHistoryChain.ts`](../src/crypto/keyHistoryChain.ts) handles structural hash linkage. [`ledgerConnection.ts`](../src/ledger/ledgerConnection.ts) separates read-only verification from writer initialization and migrations.
3. [`signer.ts`](../src/crypto/signing/signer.ts) chooses local/notary signing; [`trustConfig.ts`](../src/trust/trustConfig.ts) defines configured trust.
4. [`bundle.ts`](../src/bundles/bundle.ts) exports evidence and public-key history. [`certificate.ts`](../src/assurance/certificate.ts) consumes keys in offline certification paths.
5. [`ledgerVerification.ts`](../src/ledger/ledgerVerification.ts) opens evidence without initializing signing keys. SQLite session readers forward that mode; [`blobKeys.ts`](../src/storage/blobs/blobKeys.ts) refuses missing decryption keys during reads. SQLite can still create its WAL coordination files.
6. [`runReport.ts`](../src/agent/runReport.ts) connects the operator's summary and verification commands to these readers. `verifyAgentRun` checks that the session exists, reports unsigned row IDs, and returns one derivation status per request header. [`deriveRequest.ts`](../src/llm/request/deriveRequest.ts) opens the session store read-only to reconstruct requests; [`eventPayload.ts`](../src/session/eventPayload.ts) reads the source payloads and distinguishes pruned bytes from missing bytes. A recorded empty session and a nonexistent session are different cases.

Follow `runReport.ts` → `eventPayload.ts` → [`blobStore.ts`](../src/storage/blobs/blobStore.ts) → `blobKeys.ts` for the cold payload-read path from recorded evidence through `loadBlobPlaintext` to `readBlobKeyMaterial`.

The focused map is `graphify-out/navigation/trust-and-publication/graph.html`. AMC-1525 tracks authenticated history admission, including export consumers. Hash-chain consistency alone cannot authorize a new signing key. This map is not a security certification; use the issue's attack regressions and verification receipt to judge the fix.

For a fresh installed run, the packaging gate invokes both `session verify --json` and `agent-loop verify <sessionId> --json` in separate processes. The first covers the workspace ledger and governance verdict plus closed-session membership; the second covers the requested session's chains, signatures and reconstructable requests. Their trust-root fields distinguish internal signature consistency from an independently pinned issuer identity.

## Rebuild the focused maps

Use a Python environment containing the reviewed Graphify version. This optional development tool is independent of AMC's runtime dependencies. Run extraction and map reduction in the same settled checkout so concurrent source changes do not blur the snapshot.

```sh
uv run --with graphifyy==0.9.56 graphify extract . --code-only --no-cluster --max-workers 4 --out graphify-out/ast
uv run --with graphifyy==0.9.56 python scripts/graphify-navigation.py --graph graphify-out/ast/graphify-out/graph.json
```

To also generate notes and Canvas files, add `--obsidian-dir /absolute/path/to/vault/Graphify-Generated` to the second command. Use a dedicated directory; Graphify keeps a manifest of its generated notes. The helper prefixes note names across views and resolves Canvas cards from the enclosing vault root, identified by `.obsidian`, so nested exports open the correct notes. No API key or semantic backend is required. HTML uses Graphify's pinned vis-network CDN; JSON and Obsidian Canvas remain available independently.

`summary.json` records raw graph digest, file hashes at map generation, graph counts, omitted edges and missing requested files. Re-extract after source changes; compare source hashes before trusting a saved map. The source commit recorded at map generation does not prove the input graph was extracted at that commit.

## How to use the findings

Use the current `summary.json` for file counts, directed dependency pairs and `largest_dependency_surfaces`. Those counts include type imports and re-exports; they are navigation priorities, not complexity or defect scores. The guide does not freeze an older extraction's numbers as the current source inventory.

For CLI changes, begin with the registered command module. For Studio changes, begin with the relevant router. For barrel files, inspect the exported implementation rather than splitting a catalog merely to reduce its count. Keep source extraction and existing architecture/size checks as evidence for any proposed decomposition.

The reduced maps omit unresolved endpoints and inferred edges and report those omissions alongside dependencies crossing each focused boundary. Check the extraction receipt for parser coverage and failures. Tests, vendor trees, generated files and archived Python are excluded by `.graphifyignore`. Dynamic dispatch, service injection, build-time resolution and runtime behavior still require source inspection and meaningful tests.
