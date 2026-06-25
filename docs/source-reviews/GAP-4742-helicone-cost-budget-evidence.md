# GAP-4742 — Per-agent cost budget evidence

- Gap: `GAP-4742`
- Dimension: LLMOps, routing, cost, and deployment
- AMC surfaces requested: API; Studio; Fleet
- Source reviewed: Helicone
- Retrieval: Helicone homepage, Helicone cost-tracking docs, Helicone AI Gateway docs, GitHub repository API, languages API, and license API fetched on 2026-06-25
- Status: Done

## Relevance decision

This gap is relevant to AMC because agent maturity can improve while the operating cost becomes commercially unsustainable. AMC already tracks cost records and budget anomalies, but the backlog asks for auditable per-agent evidence that binds a budget, forecast, actual spend, variance, and owner decision into the same evidence chain.

Live source facts reviewed:

- Helicone homepage: https://www.helicone.ai
- Cost Tracking & Optimization docs: https://docs.helicone.ai/guides/cookbooks/cost-tracking
- AI Gateway overview docs: https://docs.helicone.ai/gateway/overview
- GitHub repository: https://github.com/Helicone/helicone
- Repository API: https://api.github.com/repos/Helicone/helicone
- Languages API: https://api.github.com/repos/Helicone/helicone/languages
- License API: https://api.github.com/repos/Helicone/helicone/license
- Homepage identifies Helicone as an `AI Gateway` and `LLM observability` product for routing, debugging, and analyzing applications.
- Cost Tracking & Optimization docs describe monitoring LLM spending, unit economics, `Sessions`, cost segmentation through `custom properties`, `Cost Prevention & Alerts`, and `Automated Reports`.
- AI Gateway docs describe a unified API for `100+` providers with intelligent routing, fallbacks, and unified observability.
- GitHub metadata identifies `Helicone/helicone` as an open source LLM observability platform, primary language TypeScript, repository topics including `llm-cost`, `llm-observability`, `llmops`, `monitoring`, `evaluation`, and `prompt-management`, and license SPDX `Apache-2.0`.

The source is used only as a source-review signal. AMC does not claim Helicone parity.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because cost-budget variance and missing owner decisions can affect maturity proof and score penalties. |
| Shield | Indirect relevance when spend spikes indicate runaway or abusive agent behavior; no Shield policy changed. |
| Enforce | Relevant as a future runtime budget gate consumer, but this gap adds the shared evidence primitive rather than blocking live runs. |
| Vault | Not changed; no secrets, DLP, storage, or residency behavior changed. |
| Watch | Relevant through cost observability, budget status, forecast variance, and tool-path spend evidence. |
| Fleet | Primary surface: per-agent budgets need fleet-wide owner decisions and operator visibility. |
| Passport | Not changed; receipts can later be exported in proof bundles. |
| Comply | Relevant for auditable owner decisions and finance/compliance review of AI spend. |

## Product closure

Added generic AMC per-agent cost budget evidence receipts in `src/observability/costBudgetEvidence.ts` and exported them from `src/index.ts`.

The receipt records:

- Budget, forecast, actual spend, variance, and owner decision.
- agent budget ID, owner, task, and period
- budget amount and signed budget evidence ref
- forecast amount and signed forecast evidence ref
- actual spend, run count, and signed actual-spend evidence ref
- optional tool-path spend rows with budget, forecast, actual, and evidence refs
- variance against forecast and budget
- owner decision, owner, rationale, timestamp, and signed owner-decision evidence ref

Complete over-budget evidence remains verifiable but returns `action_required`. Missing or invalid evidence returns `fail_closed`.

## Fail-closed rule

metadata-only evidence fails closed. Competitor descriptions, homepage claims, documentation labels, repository topics, language metadata, stars, license metadata, local backlog text, or source identity cannot prove AMC cost-budget maturity.

Per-agent cost budget evidence fails closed without:

- budget evidence
- forecast evidence
- actual spend evidence
- valid actual spend
- owner decision and owner-decision evidence
- tool-path evidence when tool-path spend is claimed

## No-bloat boundary

No Helicone adapter, gateway integration, importer, SDK wrapper, dashboard clone, report scheduler, alerting subsystem, upstream code, docs prose, examples, screenshots, prompts, configs, pricing data, provider-specific cost model, new API route, new CLI command, Studio screen, or methodology bump was added. AMC keeps this as a generic per-agent cost budget receipt.

## Verification

- `npx vitest run tests/gap4742HeliconeCostBudgetEvidenceBoundary.test.ts --reporter=dot` initially failed on missing `src/observability/costBudgetEvidence.ts`.
- After implementation, the focused test passed product/no-bloat assertions and failed only on this missing source-review document.
- Final focused test passed: `npx vitest run tests/gap4742HeliconeCostBudgetEvidenceBoundary.test.ts --reporter=dot`, 1 file / 5 tests.
- Related regression passed: `npx vitest run tests/gap4742HeliconeCostBudgetEvidenceBoundary.test.ts tests/observability/costTracker.test.ts tests/costLatencyAssertions.test.ts tests/product.test.ts tests/gap4741LitellmRouterFallbackSafetyBoundary.test.ts --reporter=dot`, 5 files / 74 tests.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 965 files / 7,859 tests.
