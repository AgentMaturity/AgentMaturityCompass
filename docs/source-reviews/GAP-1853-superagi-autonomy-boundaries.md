# GAP-1853 - SuperAGI autonomy boundary gates

- Gap: `GAP-1853`
- Dimension: Autonomy boundary gates
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `TransformerOptimus/SuperAGI`
- Retrieval: Live GitHub repository, README, language, and release metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as autonomous-agent runtime context because live GitHub metadata and README text describe SuperAGI as a dev-first open source autonomous AI agent framework. The README says it helps developers build, manage and run useful Autonomous AI Agents, run concurrent agents, extend agent capabilities with tools, use an Action Console for input and permissions, and use toolkits that let agents interact with external systems.

GAP-1853 maps to AMC's existing Enforce, Fleet, Watch, and Studio runtime evidence surfaces. AMC should attach risk-tiered autonomy limits to plan steps and record a policy decision, risk tier, requested authority, and block or approval receipt before an agent action is allowed to cross an approved authority boundary.

Toolkits allow SuperAGI Agents to interact with external systems. The AMC receipt boundary is: Policy decision, risk tier, requested authority, and block or approval receipt.

The SuperAGI repository is source-review context only. AMC does not add a SuperAGI adapter, autonomous-agent framework clone, toolkit marketplace integration, Next.js UI clone, Python runner, or source-specific product surface.

## Source retrieval

- GitHub repository: `https://github.com/TransformerOptimus/SuperAGI`
- GitHub API: `https://api.github.com/repos/TransformerOptimus/SuperAGI`
- README: `https://raw.githubusercontent.com/TransformerOptimus/SuperAGI/main/README.MD`
- Latest release: `https://github.com/TransformerOptimus/SuperAGI/releases/tag/v0.0.14`
- Repository facts verified from GitHub API: public repository, default branch `main`, language `Python`, license `MIT License`, homepage `https://superagi.com/`, topics including `agents`, `autonomous-agents`, `llmops`, `nextjs`, `openai`, `pinecone`, `python`, and `superagi`, and current star/fork/open issue metadata.
- README source facts: open-source framework to build, manage and run useful Autonomous AI Agents; dev-first autonomous AI agent framework; concurrent agents; tools and toolkits; Action Console for input and permissions; memory storage; performance telemetry; and external-system toolkit interactions.
- Release source facts: latest GitHub release `v0.0.14`, published on `2024-01-16`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; autonomy boundary receipts can support score evidence, but no scoring methodology changed. |
| Shield | Adjacent only; blocked high-authority actions can become safety findings, but no Shield pack changed. |
| Enforce | Relevant because Enforce owns policy decisions and blocks actions above approved authority. |
| Vault | Adjacent only; approval receipts may reference sensitive evidence, but no Vault storage changed. |
| Watch | Relevant because Watch needs authority-boundary decisions in incident timelines. |
| Fleet | Relevant because Fleet owns plan-step and multi-agent authority propagation evidence. |
| Passport | Downstream consumer only; no Passport schema changed. |
| Comply | Adjacent only; authority receipts can support audit review, but no compliance mapping changed. |

## Product closure

Added a generic AMC-owned autonomy boundary decision primitive:

- `src/runtime/autonomyBoundary.ts` evaluates a runtime plan step against risk-tiered authority limits.
- Decisions record policy id/hash, plan id, step id, risk tier, requested authority, approved authority, approval receipt id, action, reasons, source citations, evidence refs, receipt id, receipt hash, signed event path, and surface binding.
- Decisions append a `policy.decision` event to the runtime run when a run id is supplied.
- `verifyRuntimeAutonomyBoundaryDecision` fails closed when evidence, signature, event path, receipt hash, or authority consistency is missing.
- `renderRuntimeAutonomyBoundaryAuditExport` exposes the operator audit shape for Enforce, Fleet, Watch, and Studio.
- `src/lifecycle/artifactSignature.ts` now supports `runtime-autonomy-boundary-decision` artifacts.
- `src/runtime/index.ts` exports the generic boundary API.

No public scoring, methodology, API route, CLI command, or Studio-specific route changed for this gap.

## Fail-closed rule

metadata-only source evidence fails closed. GitHub repository metadata, README text, release metadata, star/fork counts, topics, language, license, autonomous-agent labels, tool labels, Action Console labels, toolkit labels, external-system labels, and local backlog text cannot prove an AMC autonomy boundary.

A passing GAP-1853 claim requires an AMC-owned signed autonomy-boundary decision with policy decision, policy hash, risk tier, requested authority, approved authority, block or approval action, block or approval receipt, plan-step evidence refs, signed event path, receipt hash, and runtime event linkage when a run id is supplied.

Missing event path, missing signature, receipt hash mismatch, missing plan-step evidence, invalid risk tier, invalid requested authority, invalid approved authority, invalid action, or fail-open approval above approved authority fails closed.

## No-bloat boundary

No SuperAGI adapter, autonomous-agent framework clone, toolkit marketplace integration, Action Console clone, Next.js UI, Python runner, vector database integration, marketplace tool importer, GitHub importer, README importer, release importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied repository code, copied README prose, copied release notes, copied prompts, copied configs, copied docs, copied examples, copied data, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1853SuperAgiAutonomyBoundary.test.ts --reporter=dot` first failed because `src/runtime/autonomyBoundary.ts` did not exist.
- Behavior implementation check: `npx vitest run tests/gap1853SuperAgiAutonomyBoundary.test.ts --reporter=dot` then passed autonomy-boundary, approval, fail-closed, and no-bloat checks and failed only because this source-review document did not exist.
- Focused test: `npx vitest run tests/gap1853SuperAgiAutonomyBoundary.test.ts --reporter=dot` passed: 1 file / 5 tests.
- Related runtime/enforce regression: `npx vitest run tests/gap1853SuperAgiAutonomyBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetTypedGraph.test.ts tests/gatewayAndSupervise.test.ts --reporter=dot` passed: 4 files / 18 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed: 951 files / 7797 tests.
