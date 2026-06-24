# GAP-0899 - RAGflow provider-drift boundary

- Gap: `GAP-0899`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `AndreasX42/RAGflow`, `https://github.com/AndreasX42/RAGflow`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 18, Fork 0, Issues 2, Pull requests 0, 153 Commits, README.md, No releases published, Python 96.3%, Shell 2.9%, Dockerfile 0.8%, repository folders `.circleci`, `app`, `k8s`, `ragflow`, `resources`, `tests`, and `vectorstore`, and files including `.gitignore`, `RAGflow overview.drawio`, `README.md`, `TODO`, `docker-compose.dev.yaml`, `docker-compose.integration.test.yaml`, and `docker-compose.local.test.yaml`.
- Status: Done

## Live source metadata

The live README identifies RAGflow: Build optimized and robust LLM applications and describes tools for constructing and evaluating Retrieval Augmented Generation systems. Relevant source-review signals include LangChain, OpenAI, Hugging Face, FastAPI, ChromaDB, Postgres, Streamlit, Docker, Kubernetes, CircleCI, GKE, Docker Hub, Docker Compose, `kubectl apply -f k8s`, generated question-answer pairs, hyperparameter evaluation, document splitting strategies, language and embedding models, document store behavior, PDF/docx document support, dynamic parameter selection, automated dataset generation, grid-search evaluation and optimization, MMR, SelfQueryRetriever, Anyscale, MosaicML, Replicate, and interactive feedback loops.

Those facts are relevant to AMC only as provider/model drift context for RAG provider routes. They do not allow AMC to claim RAGflow compatibility, deploy RAGflow, run Kubernetes/Streamlit/FastAPI services, or import ChromaDB/Postgres/vectorstore artifacts. For Score, Shield, and Watch, the relevant AMC requirement remains provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

No upstream Python source, Streamlit app code, FastAPI code, Kubernetes manifests, Docker Compose files, CircleCI config, vectorstore data, document examples, generated question-answer pairs, hyperparameter grids, evaluation results, diagrams, README prose beyond minimal metadata facts, deployment config, or implementation details were copied into AMC.

## Relevance decision

`GAP-0899` is relevant to AMC as a provider and model drift benchmark boundary. RAGflow's RAG construction/evaluation context is useful as a source-review signal for provider-route stability, but the closure must be AMC-owned canary evidence, not a RAGflow integration.

The closure uses existing AMC provider-drift primitives only. It does not add a RAGflow deployment path, RAGflow adapter, LangChain/OpenAI/Hugging Face provider wrapper, FastAPI route, Streamlit UI, ChromaDB/Postgres integration, Kubernetes manifest, Docker Compose runner, CircleCI workflow, or source-specific benchmark runner.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score, refusal, latency, cost, and guardrail canary metrics. |
| Shield | Relevant only when signed provider-drift evidence and fail-closed proof are present. |
| Watch | Relevant through existing provider-drift Watch alerts and CI gates. |
| Enforce | No runtime RAG policy, provider policy, or retrieval guardrail changed. |
| Vault | No documents, vector stores, provider configs, or generated Q&A data stored. |
| Fleet | RAG-provider context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a synthetic AMC-owned RAG provider canary. The positive path requires provider version, canary results, drift statistic, no alert or waiver need, signed evidence, row hashes, metric coverage, and CI pass. The negative path proves that RAGflow, LangChain, OpenAI, Hugging Face, FastAPI, ChromaDB, Postgres, Streamlit, Docker, Kubernetes, CircleCI, GKE, MMR, SelfQueryRetriever, Anyscale, MosaicML, Replicate, and source metadata fail closed without AMC-owned provider-drift proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 18, Fork 0, Issues 2, Pull requests 0, 153 Commits, No releases published, Python 96.3%, Shell 2.9%, Dockerfile 0.8%, folder names, file names, LangChain labels, OpenAI labels, Hugging Face labels, FastAPI labels, ChromaDB labels, Postgres labels, Streamlit labels, Docker labels, Kubernetes labels, CircleCI labels, GKE labels, generated question-answer pairs labels, hyperparameter evaluation labels, document splitting strategies labels, language and embedding models labels, MMR labels, SelfQueryRetriever labels, Anyscale labels, MosaicML labels, Replicate labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift proof requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

## No-bloat boundary

No RAGflow adapter, LangChain wrapper, OpenAI wrapper, Hugging Face wrapper, FastAPI route, Streamlit UI, ChromaDB integration, Postgres integration, vectorstore importer, Kubernetes manifest, Docker Compose runner, CircleCI workflow, GKE deployer, Docker Hub integration, hyperparameter evaluator, document splitter, MMR implementation, SelfQueryRetriever integration, Anyscale integration, MosaicML integration, Replicate integration, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, Streamlit app code, FastAPI code, Kubernetes manifests, Docker Compose files, CircleCI config, vectorstore data, document examples, generated question-answer pairs, hyperparameter grids, evaluation results, diagrams, README prose beyond minimal metadata facts, deployment config, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0899RagflowProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0899RagflowProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0898CustomRagEvalsQuestionExplainabilityBoundary.test.ts tests/gap0899RagflowProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
