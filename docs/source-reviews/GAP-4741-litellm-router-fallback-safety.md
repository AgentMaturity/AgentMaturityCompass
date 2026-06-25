# GAP-4741 — Router fallback safety checks

- Gap: `GAP-4741`
- Dimension: LLMOps, routing, cost, and deployment
- AMC surfaces requested: API; Studio; Fleet
- Source reviewed: BerriAI/litellm
- Retrieval: GitHub repository API, languages API, license API, and README fetched on 2026-06-25
- Status: Done

## Relevance decision

This gap is relevant to AMC because provider fallback is an operational trust boundary: an outage fallback can route regulated or high-risk agent work to a provider/model that does not preserve the original route's safety policy, data residency, evaluation thresholds, audit receipts, cost budget, or latency SLO. That maps to existing AMC routing, observability, provider-risk, and fleet evidence primitives.

Live source facts reviewed:

- GitHub repository: `BerriAI/litellm` at https://github.com/BerriAI/litellm
- Repository API: https://api.github.com/repos/BerriAI/litellm
- Languages API: https://api.github.com/repos/BerriAI/litellm/languages
- License API: https://api.github.com/repos/BerriAI/litellm/license
- README retrieval: https://raw.githubusercontent.com/BerriAI/litellm/main/README.md
- Repository description identifies a Python SDK and proxy server / AI gateway for `100+ LLM` APIs with cost tracking, guardrails, loadbalancing, and logging.
- README identifies `LiteLLM AI Gateway`, an open source AI gateway for `100+ LLMs`, with a production gateway including virtual keys, spend tracking, guardrails, load balancing, and an admin dashboard.
- Repository topics include `ai-gateway`, `llm-gateway`, `llmops`, `mcp-gateway`, `openai-proxy`, `anthropic`, `azure-openai`, `bedrock`, and `vertex-ai`.
- GitHub metadata on retrieval reported Python as the primary language, additional TypeScript/HTML/HCL/Rust/JavaScript/Shell/Dockerfile language signals, default branch `litellm_internal_staging`, 51,506 stars, 9,169 forks, and license SPDX `NOASSERTION`.

The source is used only as a source-review signal. AMC does not claim LiteLLM parity.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirectly strengthened because fallback safety can produce maturity evidence and score penalties, but no scoring rubric changed. |
| Shield | Relevant because unsafe fallback can bypass safety policies or guardrail evidence. |
| Enforce | Relevant as a future runtime gate consumer, but this gap adds the shared receipt primitive rather than changing gateway dispatch. |
| Vault | Relevant for data class and residency preservation; no storage or secrets behavior changed. |
| Watch | Relevant through observable fallback receipts, test-run refs, and SLO checks. |
| Fleet | Primary surface: fallback decisions are fleet-level provider/model routing proof. |
| Passport | Not changed; receipts can later be included in exported proof bundles. |
| Comply | Relevant through provider comparison, residency, audit evidence, and fail-closed compliance posture. |

## Product closure

Added generic AMC router fallback safety receipts in `src/observability/routerFallbackSafety.ts` and exported them from `src/index.ts`.

The receipt blocks fallback unless all required evidence is present:

- Fallback policy, provider comparison, test run, and routing receipt
- Fallback provider preserves all primary safety policy IDs
- Fallback data residency regions and allowed data classes do not exceed the primary route boundary
- Fallback eval metrics cover the primary route metrics, meet thresholds, and include evidence refs
- Fallback audit receipt refs exist
- Cost budget and latency SLO evidence exist and remain within bounds

No gateway runtime route selection was changed in this gap. The closure is an AMC-owned evidence primitive that API, Studio, and Fleet can consume without adding a source-specific gateway dependency.

## Fail-closed rule

metadata-only evidence fails closed. Repository popularity, README claims, topic labels, language metadata, or GitHub description text cannot allow fallback by themselves.

A fallback safety receipt returns `block` when any of these are missing or incompatible:

- fallback policy ref
- provider comparison ref
- test run ref
- routing receipt ref
- required safety policies
- allowed residency regions
- allowed data classes
- eval threshold coverage or evidence
- audit receipt refs
- cost-budget evidence or budget compliance
- latency-SLO evidence or SLO compliance

## No-bloat boundary

No LiteLLM adapter, proxy integration, importer, SDK wrapper, config mirror, benchmark copy, upstream code, README prose, examples, screenshots, prompts, or provider-specific routing subsystem was added. AMC keeps this as a generic router fallback safety receipt.

## Verification

- `npx vitest run tests/gap4741LitellmRouterFallbackSafetyBoundary.test.ts --reporter=dot` initially failed on missing `src/observability/routerFallbackSafety.ts`.
- After implementation, the focused test passed the product/no-bloat assertions and failed only on this missing source-review document.
- Final focused test passed: `npx vitest run tests/gap4741LitellmRouterFallbackSafetyBoundary.test.ts --reporter=dot`, 1 file / 5 tests.
- Related regression passed: `npx vitest run tests/gap4741LitellmRouterFallbackSafetyBoundary.test.ts tests/product.test.ts tests/observability/costTracker.test.ts tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts tests/gatewayAndSupervise.test.ts --reporter=dot`, 5 files / 50 tests.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 964 files / 7,854 tests.
- Linear: `AMC-1391`.
