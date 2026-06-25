# GAP-1836 - MetaGPT multi-agent handoff contracts

- Gap: `GAP-1836`
- Dimension: Multi-agent handoff contracts
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `MetaGPT: The Multi-Agent Framework`
- Retrieval: Live GitHub repository, README, language, and release metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as multi-agent runtime-orchestration context because it describes a software company modeled as a multi-agent system with product managers, architects, project managers, engineers, SOP-based collaboration, and natural-language programming workflow. That source shape reinforces AMC's existing need to preserve signed, auditable handoff contracts whenever work moves across agents and roles.

GAP-1836 maps to the generic AMC-owned handoff contract primitive closed in GAP-1835. AMC should require ownership transfer, dependency status, refusal reasons, sender receipt, receiver receipt, and unresolved-dependency logs for cross-agent handoffs.

The MetaGPT repository is source-review context only. AMC does not add a software-company workflow clone and does not claim MetaGPT parity.

## Source retrieval

- GitHub repository: `https://github.com/FoundationAgents/MetaGPT`
- GitHub API: `https://api.github.com/repos/FoundationAgents/MetaGPT`
- README: `https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/README.md`
- Latest release: `https://github.com/FoundationAgents/MetaGPT/releases/tag/v0.8.1`
- Title/description verified from live metadata and README: `MetaGPT: The Multi-Agent Framework`
- Repository facts verified from GitHub API: public repository, default branch `main`, language `Python`, license `MIT License`, topics `agent`, `gpt`, `llm`, `metagpt`, and `multi-agent`, homepage `https://atoms.dev/`, current star/fork/open issue metadata, and latest push/update timestamps.
- README source facts: multi-agent framework, software company as multi-agent system, different roles assigned to GPTs, product managers, architects, project managers, engineers, SOP/team framing, natural-language programming product, CLI usage, and MultiAgent documentation links.
- Release source facts: latest release `v0.8.1`, published on `2024-04-22`, patch release metadata.

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
| Comply | Out of scope; no software-development compliance mapping changed. |

## Product closure

No product code changed for this source. Existing `src/fleet/handoffPacket.ts` already closes this dimension through the generic signed handoff contract primitive added for GAP-1835.

`tests/gap1836MetaGptHandoffContractsBoundary.test.ts` proves the existing primitive handles a software-company role handoff without MetaGPT-specific implementation. The test records a product-manager to architect ownership transfer with sender and receiver receipts, dependency resolution, and a refused architect-to-engineer handoff that writes unresolved-dependency evidence and fails closed.

## Fail-closed rule

metadata-only source evidence fails closed. GitHub repository metadata, README text, release metadata, star/fork counts, topics, language, license, MetaGPT identity, software-company labels, product-manager labels, architect labels, project-manager labels, engineer labels, SOP labels, and local backlog text cannot prove a multi-agent handoff contract.

A passing GAP-1836 claim requires a signed handoff packet, signed sender receipt, signed receiver receipt, accepted ownership transfer, resolved required dependencies, dependency evidence references, explicit refusal reasons for refused/blocked dependencies, and an unresolved-dependency log when acceptance is refused or dependencies remain unresolved.

Missing packet signature, missing sender receipt, sender receipt payload mismatch, missing receiver receipt, receiver receipt payload mismatch, receiver refusal, missing ownership acceptance, unresolved required dependency, or blocked/refused dependency without a refusal reason fails closed.

## No-bloat boundary

No MetaGPT adapter, software-company workflow clone, product-manager agent, architect agent, project-manager agent, engineer agent, SOP runtime, natural-language programming feature, GitHub importer, README importer, release importer, source-specific runtime adapter, source-specific Studio route, source-specific CLI command, methodology bump, copied repository code, copied README prose, copied prompts, copied configs, copied docs, copied examples, copied data, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1836MetaGptHandoffContractsBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; the handoff contract behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `gh api repos/FoundationAgents/MetaGPT` returned GitHub repository metadata recorded above.
  - `gh api repos/FoundationAgents/MetaGPT/readme --jq '.download_url'` returned the default-branch README URL recorded above.
  - `gh api repos/FoundationAgents/MetaGPT/languages` returned Python/JavaScript/TypeScript/Shell/Dockerfile language metadata.
  - `gh api repos/FoundationAgents/MetaGPT/releases/latest` returned release `v0.8.1` metadata recorded above.
  - `curl -sSL https://raw.githubusercontent.com/FoundationAgents/MetaGPT/main/README.md` verified README metadata for the framework title, software company as multi-agent system, product managers, architects, project managers, engineers, SOP/team framing, and natural-language programming context.
- Focused test: `npx vitest run tests/gap1836MetaGptHandoffContractsBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related handoff/fleet regression: `npx vitest run tests/gap1836MetaGptHandoffContractsBoundary.test.ts tests/gap1835TradingAgentsHandoffContractsBoundary.test.ts tests/fleetTypedGraph.test.ts tests/trustComposition.test.ts tests/runtimeRunManager.test.ts --reporter=dot` passed, 5 files / 39 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 947 files / 7780 tests.
