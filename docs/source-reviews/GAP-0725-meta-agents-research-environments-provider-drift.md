# GAP-0725 - Meta Agents Research Environments provider-drift boundary

- Gap: `GAP-0725`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/facebookresearch/meta-agents-research-environments` and live README `https://raw.githubusercontent.com/facebookresearch/meta-agents-research-environments/main/README.md`
- Retrieval: `2026-06-21` via browser search, GitHub page review, and live README fetch; shell network remains restricted in this environment.
- Status: closed through existing provider/model drift benchmark receipts; no Meta Agents Research Environments adapter, Gaia2 runner, scenario runner, app/event loader, or benchmark mirror added.

## Live source metadata

The live GitHub source identifies Meta Agents Research Environments as a platform for evaluating agents in dynamic research environments. Relevant source-review signals include Gaia2 environments, app/event/scenario concepts, dynamic information updates, realistic task settings, model-provider configuration, environment setup commands, evaluation runs, and benchmark outputs.

These facts are relevant to AMC only as provider/model drift benchmark context. Dynamic agent environments highlight why provider or model changes need recurring canary rows with provider version, generated test data, evaluator config, metric report, trace export, drift statistics, alert or waiver proof, and signed evidence. They do not justify importing Meta Agents Research Environments, running Gaia2, mirroring its tasks, copying scenarios, or adding a platform-specific API. No upstream README prose beyond minimal metadata facts, code, task definitions, environment configs, app/event/scenario data, prompts, benchmark rows, traces, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0725 is relevant to AMC through existing provider and model drift benchmark receipts because a model update can change agent performance in dynamic task environments. The accepted AMC primitive is already `runProviderDriftBenchmark` with provider version, canary result, drift statistic, alert/waiver, eval-pack, and CI gate evidence.

The source can be retained only as context when the provider-drift packet carries AMC-owned evaluator config, generated test data, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and no-copy proof. Repository, README, Gaia2, task, or environment metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider/model canary comparisons, score deltas, and replayable eval-pack rows. |
| Shield | Relevant through fail-closed checks for missing signed evidence, evaluator proof, generated test data, trace exports, and metric reports. |
| Watch | Relevant through provider-drift Watch alerts and CI/lifecycle gates. |
| Enforce | No runtime provider-routing, environment, or policy enforcement behavior changed. |
| Vault | No environment data, scenarios, prompts, provider credentials, traces, or secure-storage behavior changed. |
| Fleet | Dynamic multi-agent environment context only; no Meta/ARE orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Benchmark context only; no compliance mapping changed. |

## Product closure

GAP-0725 is closed by documenting the live-source boundary and adding regression coverage over the existing provider-drift primitive. The positive path proves that Meta Agents Research Environments-style dynamic task context can be cited only with AMC-owned canary rows, provider/model versions, evaluator proof, observability proof, source refs, signed evidence, eval-pack rows, and CI gate proof. The negative path proves GitHub/README metadata fails closed.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Meta Agents Research Environments adapter, Gaia2 runner, task runner, app/event/scenario loader, environment launcher, benchmark mirror, README importer, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0725.

## Fail-closed rule

Repository identity, repository URL, README labels, Meta Agents Research Environments labels, Gaia2 labels, app/event/scenario labels, dynamic-environment labels, model-provider labels, benchmark-run labels, task labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider/model versions, canary rows, evaluator config hash, generated test data hash, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and CI/lifecycle gate proof.

## No-bloat boundary

No Meta Agents Research Environments adapter, Gaia2 runner, benchmark runner, environment launcher, task runner, app loader, event loader, scenario loader, benchmark mirror, model-provider config importer, README importer, source-specific provider-drift route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, task definitions, environment configs, app/event/scenario data, prompts, benchmark rows, traces, screenshots, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0725MetaAgentsResearchEnvironmentsProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
