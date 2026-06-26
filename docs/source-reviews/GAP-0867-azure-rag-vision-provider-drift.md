# GAP-0867 - Azure RAG with Vision provider-drift boundary

- Gap: `GAP-0867`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Azure-Samples/rag-as-a-service-with-vision`, `https://github.com/Azure-Samples/rag-as-a-service-with-vision`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 36, Fork 7, Issues 3, Pull requests 4, 68 Commits, README.md, LICENSE.md, MIT license, Python 82.2%, HCL 17.8%, repository folders `.devcontainer`, `.github`, `.vscode`, `deploy`, `docs`, and `src`, and files including `CHANGELOG.md` and `CONTRIBUTING.md`.
- Status: completed as a provider/model drift boundary over existing AMC canary receipts.

## Live source metadata

The live repository identifies RAG with Vision Application Framework. Relevant source-review signals include topics `vision`, `openai`, `cosmosdb`, `rag`, `llm`, `azure-ai-search`, `azure-ai-vision`, and `gpt-4o`, MHTML documents, textual and image content, Azure AI Services, Azure AI Search, Azure OpenAI Service, Ingestion flow, Enrichment flow, RAG with vision pipeline, Evaluation starter code, ROUGE recall, LLM-as-a-judge, and inner- and outer-loop feedback.

These facts are useful Azure RAG with vision evaluation context, but they are not provider/model drift proof by themselves. No upstream source code, deployment files, Terraform/HCL content, notebook or script content, MHTML samples, document examples, prompts, model outputs, result rows, README prose beyond minimal metadata facts, screenshots, figures, Azure configuration, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing provider/model drift canary receipts because multimodal RAG context can inform how users reason about Score, Shield, and Watch changes across model, provider, retrieval, or vision-service updates. The closure is not an Azure sample integration, RAG with vision runtime, Azure AI Search wrapper, Azure AI Vision wrapper, OpenAI wrapper, Cosmos DB integration, deployment module, or evaluation starter-code importer; it is a fail-closed boundary showing that Azure RAG with Vision metadata is accepted only as source-review context unless AMC-owned provider-drift proof exists.

For provider/model drift to pass, AMC needs provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof. GitHub/README/license/Azure/RAG/vision metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider score distribution comparisons and canary result rows. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed provider-drift proof. |
| Watch | Relevant through existing provider drift alerts, Watch alert projection, and CI/lifecycle gate receipts. |
| Enforce | No runtime model-routing policy, Azure policy, RAG policy, or circuit breaker changed. |
| Vault | No MHTML samples, document examples, Azure secrets, Terraform/HCL files, deployment files, or secure-storage behavior changed. |
| Fleet | Multimodal RAG context only; no Azure sample runner or orchestration topology added. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0867.

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a positive Azure RAG with Vision canary packet and a negative source-metadata-only packet. The positive path requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, and CI gate proof. The negative path fails closed when GitHub/README/license/Azure/RAG/vision metadata replaces signed provider-drift evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE.md presence, MIT license metadata, Star 36, Fork 7, Issues 3, Pull requests 4, 68 Commits, Python 82.2%, HCL 17.8%, folder names, file names, repository topics, MHTML document labels, textual and image content labels, Azure AI Services labels, Azure AI Search labels, Azure OpenAI Service labels, ingestion-flow labels, enrichment-flow labels, RAG with vision pipeline labels, Evaluation starter code labels, ROUGE recall labels, LLM-as-a-judge labels, inner- and outer-loop feedback labels, local backlog metadata, or source identity alone must fail closed for provider/model drift. Passing evidence requires provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI or lifecycle gate proof, and no-copy proof.

## No-bloat boundary

No Azure RAG with Vision adapter, Azure sample runner, Azure AI Search integration, Azure AI Vision integration, OpenAI wrapper, Cosmos DB integration, MHTML parser, RAG with vision pipeline, ingestion flow, enrichment flow, evaluation starter-code importer, ROUGE implementation, LLM-as-a-judge wrapper, Terraform/HCL importer, deployment runner, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, deployment files, Terraform/HCL content, notebook or script content, MHTML samples, document examples, prompts, model outputs, result rows, README prose beyond minimal metadata facts, screenshots, figures, Azure configuration, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0867AzureRagVisionProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative provider-drift paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0867AzureRagVisionProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0866AdvancedRagPublicMethodologyBoundary.test.ts tests/gap0867AzureRagVisionProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
