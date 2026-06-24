# GAP-0931 - awesome-agentops-landscape provider-drift boundary

- Gap: `GAP-0931`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `dyronrh/awesome-agentops-landscape`, `https://github.com/dyronrh/awesome-agentops-landscape`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 13, Fork 4, Issues 2, Pull requests 1, 95 Commits, README.md, folders `.github/ workflows`, `assets`, `data`, and `scripts`, No releases published, Packages 0, and Python 100.0%.
- Status: Done - skipped as provider-drift implementation evidence

## Live source metadata

The live README describes `awesome-agentops-landscape` as a curated, research-driven list of AgentOps tools for 2026. It covers observability, evaluation, tracing, cost monitoring, and guardrails for AI agents. It also shows `Last generated: 2026-06-20`, `Automation: GitHub Actions + GitHub API`, AgentOps Landscape (2026), a Feature Benchmark, Tracing, Monitoring, Evaluation, Prompt Mgmt, Cost Tracking, Guardrails, Feedback, Multi-agent, OpenTelemetry context, and tool lists that include Langfuse, DeepEval, RAGAS, Phoenix, OpenLLMetry, Guardrails AI, AgentOps SDK, Agenta, and OpenLIT.

Those facts are useful source-review context, but the backlog dimension `Provider and model drift benchmark` is misclassified for this source. The source is a curated landscape/awesome-list and feature table, not a reproducible provider/model drift benchmark with provider versions, canary results, drift statistics, alert or waiver, signed evidence refs, eval-pack row hashes, and CI/lifecycle gates.

No upstream README prose beyond minimal metadata facts, generated tables, star-history charts, data files, scripts, images, examples, pricing entries, tool rankings, configs, prompts, datasets, model outputs, benchmark rows, or implementation details were copied into AMC.

## Relevance decision

Provider/model drift is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has a reproducible eval pack, signed evidence refs, provider/model version, canary results, drift statistics, alert or waiver, CI/lifecycle gate receipts, and no-copy proof. GAP-0931 does not supply those facts because the live source is an awesome-list and landscape guide rather than a provider/model drift benchmark.

Therefore GAP-0931 is closed as a documented skip. The source is not rejected because AgentOps landscape awareness is irrelevant; it is rejected because curated landscape metadata alone cannot justify a provider/model drift benchmark implementation or claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Provider-drift scoring remains relevant only through AMC-owned eval-pack evidence; curated landscape metadata does not change scoring. |
| Shield | Guardrail and safety categories are source-review context only; no assurance behavior changed. |
| Watch | Observability categories are source-review context only; no Watch monitor or drift alert changed. |
| Enforce | No runtime guardrail, policy, circuit breaker, or provider blocklist behavior changed. |
| Vault | No secrets, DLP, privacy, data-residency, or secure-storage behavior changed. |
| Fleet | Multi-agent categories are context only; no AMC fleet topology changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance mapping, audit control, or regulated-domain obligation changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, Watch monitor, Shield verifier, or scoring code changed for GAP-0931. Existing AMC provider-drift primitives remain the only accepted path for a provider/model drift claim.

The source-review closure is the product boundary: source live-verified, dimension misclassified, skipped as provider-drift implementation evidence, with tests ensuring source-specific identifiers stay out of provider-drift implementation modules.

## Fail-closed rule

Curated landscape metadata alone cannot justify a provider/model drift benchmark. GitHub repository reachability, README.md presence, Star 13, Fork 4, Issues 2, Pull requests 1, 95 Commits, No releases published, Packages 0, Python 100.0%, folder names, file names, generated table labels, star counts, AgentOps categories, tool rankings, feature checkmarks, pricing labels, source identity, category labels, local backlog metadata, or generated gap wording are not enough to pass. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, eval-pack row hashes, CI/lifecycle gate receipts, and no-copy proof.

## No-bloat boundary

No awesome-agentops-landscape adapter, awesome-list importer, AgentOps landscape crawler, GitHub star scraper, tool-ranking importer, pricing importer, feature-benchmark parser, OpenTelemetry taxonomy importer, provider wrapper, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, generated tables, star-history charts, data files, scripts, images, examples, pricing entries, tool rankings, configs, prompts, datasets, model outputs, benchmark rows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0931AwesomeAgentOpsLandscapeProviderDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the provider-drift implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0931AwesomeAgentOpsLandscapeProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0930ScouterPublicMethodologyBoundary.test.ts tests/gap0931AwesomeAgentOpsLandscapeProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
