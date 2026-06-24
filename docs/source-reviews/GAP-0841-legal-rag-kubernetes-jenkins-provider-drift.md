# GAP-0841 - legal RAG Kubernetes/Jenkins provider-drift boundary

- Gap: `GAP-0841`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `nguyenthai-duong/Deploying-RAG-on-Kubernetes-with-Jenkins-for-Legal-Document-Retrieval`, `https://github.com/nguyenthai-duong/Deploying-RAG-on-Kubernetes-with-Jenkins-for-Legal-Document-Retrieval`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 81, language Jupyter Notebook, description metadata for LLM retrieval APIs on a hybrid GCP architecture with CI/CD, IaC, and monitoring, and no repository topics. README.md API lookup succeeded. License metadata was null and the license API returned Not Found.
- Status: closed through existing provider-drift benchmark receipts; no legal RAG integration, Kubernetes deployment, Jenkins pipeline, GCP connector, Terraform/Ansible runner, FastAPI service, Docker image, Helm chart, Weaviate adapter, Prometheus/Loki/Grafana/Jaeger/OpenTelemetry integration, Vistral-7B-Chat wrapper, or source-specific provider-drift path added.

## Live source metadata

The live README identifies the project as Deploying RAG on K8s with Jenkins for Legal Document Retrieval. Relevant source-review signals include LLM retrieval APIs, hybrid GCP architecture, CI/CD, IaC, monitoring, Google Kubernetes Engine, Jenkins, Terraform, Ansible, FastAPI, Docker, Kubernetes, Helm, Weaviate, Prometheus, Loki, Grafana, Jaeger, OpenTelemetry, Vistral-7B-Chat, throughput, latency, and Jupyter Notebook context.

These facts are deployment and provider/model drift context only. They do not authorize copying upstream notebooks, README prose beyond minimal metadata facts, commands, configs, screenshots, GIFs, architecture images, Helm charts, Terraform files, Ansible playbooks, Dockerfiles, Kubernetes manifests, model-serving instructions, monitoring dashboards, legal-document samples, generated answers, benchmark rows, or implementation details into AMC.

## Relevance decision

GAP-0841 is relevant to AMC because RAG answer quality, refusal behavior, grounding, latency, and cost can drift when provider routes, model versions, embedding models, retrieval indexes, vector databases, serving infrastructure, observability pipelines, or CI/CD deployment paths change. The gap maps to AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, and CI gate proof.

It does not require a legal-document RAG runner, Kubernetes deployment, Jenkins integration, GCP adapter, Terraform or Ansible executor, FastAPI service, Docker image, Helm chart, Weaviate integration, Prometheus/Loki/Grafana/Jaeger/OpenTelemetry adapter, Vistral-7B-Chat wrapper, notebook importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or public methodology version bump. Deployment metadata can explain why provider drift matters for legal RAG systems, but it cannot replace AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because legal RAG provider-drift claims fail closed without signed evidence and evaluator proof. |
| Watch | Relevant through drift statistics, Watch alert projection, observability proof, and alert or waiver evidence. |
| Enforce | No runtime provider policy, Kubernetes guardrail, deployment policy, or circuit breaker changed. |
| Vault | No legal documents, PDFs, credentials, GCP secrets, model tokens, traces, logs, or secure-storage behavior changed. |
| Fleet | Deployment context only; no multi-agent orchestration topology or fleet runtime changed. |
| Passport | No portable trust token, external proof bundle, or Passport schema changed. |
| Comply | Legal-document context only; no compliance framework mapping, legal claim, or methodology version changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, legal RAG integration, Kubernetes deployment, Jenkins pipeline, GCP connector, Terraform/Ansible runner, FastAPI service, Docker image, Helm chart, Weaviate adapter, Prometheus/Loki/Grafana/Jaeger/OpenTelemetry integration, Vistral-7B-Chat wrapper, notebook importer, diagnostic question bank, methodology version, or scoring semantics changed for GAP-0841.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when deployment or repository metadata replaces AMC-owned provider-drift evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, license API returned Not Found, `stargazers_count` 81, Jupyter Notebook label, LLM retrieval APIs label, hybrid GCP architecture label, CI/CD label, IaC label, monitoring label, Google Kubernetes Engine label, Jenkins label, Terraform label, Ansible label, FastAPI label, Docker label, Kubernetes label, Helm label, Weaviate label, Prometheus label, Loki label, Grafana label, Jaeger label, OpenTelemetry label, Vistral-7B-Chat label, throughput label, latency label, local backlog metadata, or source identity alone must fail closed for provider/model drift claims.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation-framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No legal RAG integration, Kubernetes deployment, Jenkins pipeline, GCP connector, Terraform runner, Ansible runner, FastAPI service, Docker image, Helm chart, Weaviate adapter, Prometheus adapter, Loki adapter, Grafana adapter, Jaeger adapter, OpenTelemetry adapter, Vistral-7B-Chat wrapper, repository importer, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream notebooks, README prose beyond minimal metadata facts, commands, configs, screenshots, GIFs, architecture images, Helm charts, Terraform files, Ansible playbooks, Dockerfiles, Kubernetes manifests, model-serving instructions, monitoring dashboards, legal-document samples, generated answers, benchmark rows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0841LegalRagKubernetesProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 provider-drift behavior tests passed.
- Focused regression after doc addition: `npx vitest run tests/gap0841LegalRagKubernetesProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0840McpMonitorMetricValidityBoundary.test.ts tests/gap0841LegalRagKubernetesProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
