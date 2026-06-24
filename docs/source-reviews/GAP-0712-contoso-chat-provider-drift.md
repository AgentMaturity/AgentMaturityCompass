# GAP-0712 - Contoso Chat provider-drift boundary

- Gap: `GAP-0712`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Azure-Samples/contoso-chat`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing provider-drift evaluator and observability receipts; no Contoso Chat, Azure, Prompty, or deployment integration added.

## Live source metadata

The GitHub connector identifies `Azure-Samples/contoso-chat` as a public repository with repository id `725257907`, default branch `main`, size `245417`, owner organization `Azure-Samples`, clone URL `https://github.com/Azure-Samples/contoso-chat.git`, and read-only permissions in this environment. The repository is currently archived.

The live `README.md` at `https://github.com/Azure-Samples/contoso-chat/blob/main/README.md`, modified `2025-03-07T00:20:21Z`, identifies the sample as "Contoso Chat - Retail RAG Copilot with Azure AI Foundry and Prompty (Python Implementation)" and describes a RAG retail copilot that can be built, evaluated, and deployed. Source-review signals relevant to AMC include Azure OpenAI chat, embeddings, and evaluation models, Prompty prompt iteration, Azure AI Search, Azure Cosmos DB, Azure Container Apps, AI-assisted evaluation flows, custom evaluators, Azure Developer CLI deployment, GitHub Codespaces/dev containers, Azure Monitor, responsible AI practices, content safety and assessments, managed identity, GitHub security scanning, and trace files from Prompty evaluation runs. No upstream code, README prose beyond short metadata facts, sample data, prompts, evaluator templates, notebooks, screenshots, Bicep files, workflow files, deployment scripts, result rows, trace files, configuration, or implementation details were copied into AMC.

## Relevance decision

Contoso Chat is relevant to AMC as provider/model drift context because it combines RAG application evaluation, Azure OpenAI model choices, custom evaluator outputs, deployment automation, and observability signals. That maps to AMC Score/Shield/Watch when a user supplies AMC-owned baseline and candidate canary rows with provider/model versions, evaluator configuration, generated test data hash, trace export, metric report, signed evidence refs, eval-pack row hashes, drift statistics, and alert or waiver proof.

This does not require a Contoso Chat adapter, Azure SDK wrapper, Prompty importer, evaluator notebook runner, Azure Monitor importer, GitHub Actions parser, RAG application template, or deployment subsystem. GAP-0712 is closed by documenting the source boundary and adding regression coverage that Contoso-style RAG eval/deploy evidence uses the existing generic `runProviderDriftBenchmark` path. Repository identity, README metadata, or archived sample status alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift canary comparisons, evaluator metric suites, eval-pack row hashes, and signed evidence refs. |
| Shield | Relevant through fail-closed CI gate behavior when signed evidence, evaluator proof, or observability proof is missing. |
| Watch | Relevant through existing drift statistics, alert or waiver proof, and Watch alert projection over provider/model canary results. |
| Enforce | No runtime Azure policy, Prompty guardrail, deployment gate, or circuit breaker changed. |
| Vault | No sample data, customer data, prompts, traces, secrets, keys, or secure-storage behavior changed. |
| Fleet | RAG deployment context only; no Azure, Prompty, or Contoso orchestration adapter added. |
| Passport | No portable credential, external proof bundle, or badge field changed. |
| Comply | Responsible AI and security guidance are source-review context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Azure adapter, Prompty importer, Azure Monitor importer, GitHub Actions parser, RAG app template, evaluation notebook runner, deployment subsystem, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0712.

The focused regression exercises the existing provider-drift engine with Contoso-style RAG evaluation and deployment fixture data. The positive path requires AMC-owned evaluator, deployment, observability, trace, metric, signed-evidence, eval-pack, Watch, and CI proof. The negative path fails closed when Contoso repository metadata is present but signed evidence, evaluator proof, trace export, and metric report evidence are incomplete.

## Fail-closed rule

Contoso Chat repository identity, repository id, archived status, default branch, README front matter, Azure AI Foundry labels, Azure OpenAI labels, Prompty labels, Azure AI Search labels, Azure Cosmos DB labels, Azure Container Apps labels, Azure Developer CLI labels, GitHub Codespaces labels, GitHub Actions labels, custom evaluator labels, sample dataset labels, content-safety labels, Azure Monitor labels, trace-file labels, managed-identity labels, security-scan labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider routes, baseline and candidate model versions, canary result hashes, evaluator config hashes, generated test data hashes, metric ids, metric reports, trace exports, pipeline run ids, drift statistics, alert or waiver proof, signed evidence refs, row hashes, CI gate receipts, and no-copy proof.

## No-bloat boundary

No Contoso Chat adapter, Azure SDK wrapper, Prompty importer, Azure Monitor importer, GitHub Actions parser, FastAPI runner, RAG app template, Azure Developer CLI runner, Codespaces or devcontainer importer, sample-data loader, evaluator notebook runner, custom-evaluator importer, trace-view parser, Bicep parser, deployment subsystem, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, sample data, prompts, evaluator templates, notebooks, screenshots, Bicep files, workflow files, deployment scripts, result rows, trace files, configuration, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0712ContosoChatProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
