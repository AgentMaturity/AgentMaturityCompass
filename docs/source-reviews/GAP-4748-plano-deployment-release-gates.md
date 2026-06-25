# GAP-4748 — Plano deployment release gates

- Gap: `GAP-4748`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: API; Studio; Fleet
- Source reviewed: katanemo/plano
- Retrieval: Live GitHub repository API, languages API, license API, and raw README retrieved on 2026-06-25.
- Status: Done

## Relevance decision

This is relevant to AMC because an AI-native proxy and data plane for agentic applications puts routing, orchestration, guardrails, observability, and smart LLM routing into the deployment path. The live source confirms katanemo/plano is a Rust repository for an AI-native proxy and data plane with orchestration, guardrail/filter-chain context, observability/signals, smart LLM routing, CI/Docker workflow badges, Envoy context, and Apache-2.0 license metadata.

AMC should not mirror Plano. The AMC-native closure is to strengthen the existing release-gate receipt so rollout evidence records Gate config, environment, run receipt, failure reason, and override status, plus explicit score, security, compliance, cost, and observability release-control evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because maturity, integrity, trust, value, and cost gates must be evidenced before rollout. |
| Shield | Relevant because security release-control evidence can block rollout. |
| Enforce | Relevant because the release gate blocks deployment when required controls fail or evidence is missing. |
| Vault | Not changed; no secret-storage behavior was required. |
| Watch | Relevant because observability release-control evidence can block rollout. |
| Fleet | Primary surface because release decisions are tied to agent, environment, bundle, and fleet rollout state. |
| Passport | Not changed; no portable trust-token behavior was required. |
| Comply | Relevant because compliance release-control evidence can block rollout. |

## Product closure

Extended the existing `src/ci/gate.ts` `ReleaseGateReceipt` primitive rather than adding a second release-gate system. Release-gate rows can now carry optional typed control evidence for:

- score
- security
- compliance
- cost
- observability

If control evidence is present, all five controls must be present with evidence refs and reasons. Passing rollout rows fail closed if any required control failed or lacks evidence. Failed rollout rows remain verifiable when control failures are complete and failure reasons, run receipts, evidence chain, and override status are recorded.

## Fail-closed rule

metadata-only evidence fails closed. Repository name, README claims, GitHub stars, Rust language metadata, Apache-2.0 license metadata, topics, AI-native proxy descriptions, data-plane descriptions, orchestration claims, guardrail claims, observability claims, smart LLM routing claims, CI badge presence, Docker badge presence, local backlog text, and source identity are not enough. AMC requires a signed release-gate policy/config, target environment, run receipt, failure reason when the gate fails, override proof when an override is present, and typed score/security/compliance/cost/observability control evidence when those controls are claimed.

## No-bloat boundary

No Plano adapter, proxy integration, data-plane bridge, Envoy wrapper, orchestration importer, LLM-router clone, filter-chain clone, observability SDK bridge, config importer, Docker workflow clone, upstream code, README copy, examples, prompts, screenshots, diagrams, new API route, new CLI command, Studio screen, or methodology bump was added.

## Source evidence

- GitHub repository: `https://github.com/katanemo/plano`
- GitHub repository API: `https://api.github.com/repos/katanemo/plano`
- GitHub languages API: `https://api.github.com/repos/katanemo/plano/languages`
- GitHub license API: `https://api.github.com/repos/katanemo/plano/license`
- Raw README: `https://raw.githubusercontent.com/katanemo/plano/main/README.md`
- Live metadata observed: repository `katanemo/plano`, AI-native proxy and data plane description, orchestration context, guardrail/filter-chain context, observability and signals context, smart LLM routing context, CI/Docker workflow badges, Envoy context, Rust primary language, `ai-gateway`, `llmops`, `llm-routing`, `llm-proxy`, `envoy`, `openai`, `proxy`, and `routing` topics, Apache-2.0 license, default branch `main`, and recent push metadata.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4748PlanoDeploymentReleaseGatesBoundary.test.ts --reporter=dot` failed because the source-review doc was absent and release-gate rows did not include typed control evidence.
- Product-focused rerun passed 4/5 tests and failed only because this source-review doc was absent.
- Final focused test: `npx vitest run tests/gap4748PlanoDeploymentReleaseGatesBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap4748PlanoDeploymentReleaseGatesBoundary.test.ts tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts tests/releaseBundlesArchetypesGate.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts --reporter=dot` passed, 8 files / 43 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 968 files / 7,874 tests.
