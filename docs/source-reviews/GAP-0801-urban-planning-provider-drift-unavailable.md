# GAP-0801 - Urban planning provider-drift unavailable-source boundary

- Gap: `GAP-0801`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.1016/j.jum.2025.12.006`, OpenAlex work `W7118760046`, and title `Generative AI for complex urban planning: Pathways, potentials, and challenges`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; closed through existing provider/model drift benchmark receipts; no urban-planning workflow, planning simulator, or provider adapter added.

## Live retrieval result

The local backlog identifies the source as `Generative AI for complex urban planning: Pathways, potentials, and challenges`, DOI `10.1016/j.jum.2025.12.006`, and OpenAlex work `W7118760046`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search for `Generative AI for complex urban planning: Pathways, potentials, and challenges` returned no usable primary/source result.
- DOI search for `10.1016/j.jum.2025.12.006` returned no usable primary/source result.
- OpenAlex search for `W7118760046` returned no usable primary/source result.

The backlog row may be a future, removed, gated, unpublished, or incorrectly indexed article record. Local metadata identifies urban-planning context only: complex urban planning, generative AI, transformative learning, urban planning, data science, management science, and related agent-evaluation labels. No upstream article prose, planning cases, city data, maps, stakeholder data, prompts, model outputs, figures, tables, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

Provider/model drift is relevant to AMC through Score, Shield, and Watch when a provider update can shift score, refusal, invalid-action, guardrail, latency, or cost distributions. GAP-0801 maps to the existing provider drift benchmark primitive only when the evidence includes provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, Watch alert, CI gate, and alert or waiver.

The unavailable urban-planning paper does not provide those receipts by itself. DOI/OpenAlex/title metadata and urban-planning labels can be retained only as source-review context. They are not a canary result, not a provider-version comparison, not a drift statistic, not an alert, and not a waiver.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider-drift canary rows, provider versions, metrics, and replayable eval-pack rows. |
| Shield | Relevant only when unsupported urban-planning/model claims fail closed without signed drift evidence. |
| Watch | Relevant only through existing Watch alerts tied to drift statistics, CI gates, and waivers. |
| Fleet | Urban-planning agent context only; no orchestration, multi-agent topology, or fleet policy changed. |
| Enforce | No runtime provider policy, planning policy, model-selection, or circuit breaker changed. |
| Vault | No city data, planning cases, prompts, stakeholder records, maps, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No urban-planning, civic, privacy, environmental, or public-sector compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version, badge semantics, diagnostic question bank, provider integration, model router, urban-planning workflow, planning simulator, or scoring behavior changed for GAP-0801. The closure is a source-review note plus regression coverage that exercises existing provider drift primitives: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, Watch alerts, and CI gate behavior.

## Fail-closed rule

Unavailable paper metadata alone must fail closed for provider and model drift claims. DOI, OpenAlex work ID, title, complex urban planning labels, generative AI labels, transformative learning labels, urban planning labels, data science labels, management science labels, local backlog metadata, generated gap wording, or source identity are not enough to pass. Passing evidence requires AMC-owned baseline/candidate provider versions, canary rows, metric IDs, metric counts, generated test data hash, evaluator config hash, trace export hash, signed evidence refs, drift statistics, CI/lifecycle receipt, Watch alert or waiver, row hashes, and no-copy proof.

## No-bloat boundary

No urban-planning provider-drift adapter, city-planning benchmark, planning simulator, civic data importer, map importer, stakeholder-analysis workflow, generative-urban-planning workflow, paper importer, Elsevier importer, OpenAlex importer, DOI resolver, source-specific provider-drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, package dependency, methodology version bump, diagnostic question-bank migration, or source-specific scoring path was added. No upstream article prose, planning cases, city data, maps, stakeholder data, prompts, model outputs, figures, tables, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0801UrbanPlanningProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
