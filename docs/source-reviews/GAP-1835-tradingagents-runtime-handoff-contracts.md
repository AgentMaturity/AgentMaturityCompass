# GAP-1835 - TradingAgents multi-agent handoff contracts

- Gap: `GAP-1835`
- Dimension: Multi-agent handoff contracts
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `TradingAgents: Multi-Agents LLM Financial Trading Framework`
- Retrieval: Live GitHub repository, README, language, and release metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as multi-agent runtime-orchestration context because it describes a multi-agent trading framework with analysts, researchers, a trader, risk management, and portfolio-manager approval/rejection flow. That source shape reinforces a generic AMC need: when work moves across agents, AMC must preserve a signed handoff contract with ownership transfer, dependency status, sender receipt, receiver receipt, refusal reasons, and unresolved-dependency evidence.

GAP-1835 maps to AMC's existing Fleet, Watch, and Studio surfaces through the existing `src/fleet/handoffPacket.ts` handoff packet primitive and typed multi-agent graph checks. The closure extends those AMC-owned primitives; it does not add a financial trading product surface.

The TradingAgents repository is source-review context only. AMC does not claim TradingAgents parity, trading performance, market-data correctness, or investment advice.

## Source retrieval

- GitHub repository: `https://github.com/TauricResearch/TradingAgents`
- GitHub API: `https://api.github.com/repos/TauricResearch/TradingAgents`
- README: `https://raw.githubusercontent.com/TauricResearch/TradingAgents/main/README.md`
- Latest release: `https://github.com/TauricResearch/TradingAgents/releases/tag/v0.3.0`
- Title/description verified from live metadata and README: `TradingAgents: Multi-Agents LLM Financial Trading Framework`
- Repository facts verified from GitHub API: public repository, default branch `main`, language `Python`, license `Apache License 2.0`, topics `agent`, `finance`, `llm`, `multiagent`, and `trading`, homepage `https://arxiv.org/pdf/2412.20138`, current star/fork/open issue metadata, and latest push/update timestamps.
- README source facts: multi-agent trading framework, analyst team, researcher team, trader agent, risk management, portfolio manager approval/rejection flow, multiple LLM provider support, state/memory/checkpoint notes, and explicit research-purpose/trading-advice disclaimer.
- Release source facts: `v0.3.0` stabilization/extensibility release with a verified data-access contract, provider registry, data-vendor registry, model catalog, configuration/CLI updates, and CI gate.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; handoff contract validity can support scoring evidence, but no scoring methodology changed. |
| Shield | Adjacent only; refused or unresolved handoffs can become findings, but no Shield pack changed. |
| Enforce | Adjacent only; handoff acceptance can gate downstream work, but no runtime policy engine changed. |
| Vault | Adjacent through signed packet and receipt artifacts; no new secure storage surface changed. |
| Watch | Relevant because Watch needs unresolved-dependency and refusal evidence for runtime incident review. |
| Fleet | Relevant because Fleet owns cross-agent ownership transfer, dependency status, and handoff receipts. |
| Passport | Relevant as a downstream evidence consumer; no Passport schema changed for this gap. |
| Comply | Out of scope; no financial, trading, or market compliance mapping changed. |

## Product closure

`src/fleet/handoffPacket.ts` now supports generic signed handoff contracts:

- `ownershipTransfer` records source owner, target owner, scope, status, transfer receipt ID, refusal reason, and evidence references.
- `dependencyStatuses` records dependency ID, owner, status, required/optional flag, evidence references, and refusal reason.
- `refusalReasons` records cross-agent refusal reasons with agent ID, timestamp, and evidence references.
- `senderReceipt` is generated at packet creation and signed over the handoff payload hash.
- `acceptHandoffPacket` writes a receiver receipt with accepted/refused status, ownership acceptance, merged dependency status, unresolved dependencies, refusal reasons, payload hash, and signature.
- `verifyHandoffContract` fails closed unless packet signature, sender receipt, receiver receipt, ownership acceptance, and dependency resolution all pass.
- `loadHandoffUnresolvedDependencyLog` exposes the unresolved-dependency log written during receiver acceptance/refusal.
- Existing `amc fleet handoff` now supports `accept` in addition to `create` and `verify`.

`tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts` proves the positive sender/receiver contract path and the fail-closed missing/refused receiver path.

## Fail-closed rule

metadata-only source evidence fails closed. GitHub repository metadata, README text, release notes, star/fork counts, topics, language, license, TradingAgents identity, finance/trading labels, analyst labels, researcher labels, trader labels, risk-management labels, portfolio-manager labels, and local backlog text cannot prove a multi-agent handoff contract.

A passing GAP-1835 claim requires a signed handoff packet, signed sender receipt, signed receiver receipt, accepted ownership transfer, resolved required dependencies, dependency evidence references, explicit refusal reasons for refused/blocked dependencies, and an unresolved-dependency log when acceptance is refused or dependencies remain unresolved.

Missing packet signature, missing sender receipt, sender receipt payload mismatch, missing receiver receipt, receiver receipt payload mismatch, receiver refusal, missing ownership acceptance, unresolved required dependency, or blocked/refused dependency without a refusal reason fails closed.

## No-bloat boundary

No TradingAgents adapter, financial trading module, market-data module, analyst/researcher/trader workflow clone, portfolio manager workflow, LangGraph wrapper, provider registry clone, data-vendor registry, market-data snapshot importer, README importer, release importer, GitHub importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied repository code, copied README prose, copied prompts, copied configs, copied reports, copied data, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts --reporter=dot` failed on missing source-review doc and missing handoff contract behavior.
- Behavior implementation check: `npx vitest run tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts --reporter=dot` then passed the sender/receiver receipt, fail-closed, and no-bloat behavior tests, and failed only because this source-review document did not exist.
- Live source checks:
  - `gh api repos/TauricResearch/TradingAgents` returned GitHub repository metadata recorded above.
  - `gh api repos/TauricResearch/TradingAgents/readme --jq '.download_url'` returned the default-branch README URL recorded above.
  - `gh api repos/TauricResearch/TradingAgents/languages` returned Python/Dockerfile language metadata.
  - `gh api repos/TauricResearch/TradingAgents/releases/latest` returned release `v0.3.0` metadata recorded above.
  - `curl -sSL https://raw.githubusercontent.com/TauricResearch/TradingAgents/main/README.md` verified README metadata for the framework title, multi-agent trading framework, analyst/researcher/trader/risk-management/portfolio-manager roles, provider support, state/memory/checkpoint notes, and research-purpose disclaimer.
- Focused test: `npx vitest run tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related handoff/fleet regression: `npx vitest run tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts tests/fleetTypedGraph.test.ts tests/trustComposition.test.ts tests/runtimeRunManager.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/gap1842RareDiseaseRuntimeLifecycleGraphBoundary.test.ts tests/gap1843HydrogenStorageRuntimeLifecycleGraphBoundary.test.ts --reporter=dot` passed, 7 files / 47 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 946 files / 7776 tests.
