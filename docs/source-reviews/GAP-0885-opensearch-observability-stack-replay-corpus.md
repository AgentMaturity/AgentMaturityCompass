# GAP-0885 - OpenSearch Observability Stack replay-corpus boundary

- Gap: `GAP-0885`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `opensearch-project/observability-stack`, `https://github.com/opensearch-project/observability-stack`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 25, Fork 28, Issues 18, Pull requests 17, 169 Commits, README.md, Apache-2.0 license, Releases 3, latest release `cli-installer-v0.1.2`, JavaScript 50.3%, Python 33.2%, TypeScript 7.7%, Shell 5.8%, HCL 2.7%, and repository folders `.claude-plugin`, `.github`, `aws`, `charts/ observability-stack`, `claude-code-observability-plugin`, `compat`, `docker-compose`, `docs`, `examples`, `load-testing`, `terraform/ aws`, and `test`.
- Status: completed as a replay-corpus boundary over existing AMC replay evidence receipts.

## Live source metadata

The live repository identifies OpenSearch Observability Stack as an open-source stack for modern distributed systems and AI agents. Relevant source-review signals include OpenTelemetry, OpenSearch, Prometheus, Alertmanager, OpenSearch Dashboards, PPL, OpenTelemetry Gen-AI Semantic Conventions, one-command install, Docker Compose, Helm, AWS managed deployment, CDK, Data Prepper, OTLP endpoints, multi-agent travel planner, weather-agent, events-agent, canary, `docker-compose.agent-eval-llm.yml`, `docker-compose.otel-demo.yml`, and agent instrumentation examples.

These facts are useful observability replay-corpus context, but they are not AMC replay evidence by themselves. No upstream stack configs, Docker Compose files, Helm charts, Terraform, CDK, installer scripts, `.env` values, credentials, telemetry samples, dashboards, videos, generated traces, agent examples, README prose beyond minimal metadata facts, OpenTelemetry snippets, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing replay-corpus receipts because observability traces, logs, metrics, agent telemetry, and evaluation-stack examples can inform how users reason about replayable Score, Shield, and Watch evidence. The closure is not an OpenSearch integration, Docker Compose runner, Helm chart, AWS deployment, telemetry collector, OTLP exporter, dashboard importer, agent-eval compose runner, canary runner, or observability-stack adapter; it is a fail-closed boundary showing that OpenSearch Observability Stack metadata is accepted only as source-review context unless AMC-owned replay evidence exists.

For replay corpus evidence to pass, AMC needs a replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, Score/Shield/Watch surface coverage, row hashes, regression thresholds, lifecycle or CI gate proof, and no-copy proof. GitHub/README/observability-stack metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay manifest, fixture hash, fixed seed, score delta, and signed row receipts. |
| Shield | Relevant only as a fail-closed trust boundary for observability and agent-eval evidence; source metadata cannot stand in for signed replay proof. |
| Watch | Relevant through existing replay corpus and CI/lifecycle receipt visibility; no live monitor changed. |
| Enforce | No OTLP, OpenSearch, Prometheus, alerting, or runtime policy changed. |
| Vault | No `.env` values, credentials, traces, logs, metrics, or secure-storage behavior changed. |
| Fleet | Agent-observability examples only; no multi-agent travel planner, canary, or stack orchestration added. |
| Passport | Existing replay receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0885.

The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with a positive OpenSearch Observability Stack-style source-reference packet and a negative source-metadata-only packet. The positive path requires replay manifest, fixture hash, fixed seed, score delta, CI receipt, source refs, signed evidence refs, and Score/Shield/Watch coverage. The negative path fails closed when GitHub/README/observability-stack metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Apache-2.0 license metadata, Star 25, Fork 28, Issues 18, Pull requests 17, 169 Commits, Releases 3, `cli-installer-v0.1.2`, JavaScript 50.3%, Python 33.2%, TypeScript 7.7%, Shell 5.8%, HCL 2.7%, folder names, file names, OpenTelemetry labels, OpenSearch labels, Prometheus labels, Alertmanager labels, AI agents labels, OpenTelemetry Gen-AI Semantic Conventions labels, multi-agent travel planner labels, weather-agent labels, events-agent labels, canary labels, Docker Compose labels, Helm labels, AWS labels, local backlog metadata, or source identity alone must fail closed for replay-corpus evidence. Passing evidence requires replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, Score/Shield/Watch surface coverage, row hashes, regression thresholds, lifecycle or CI gate proof, and no-copy proof.

## No-bloat boundary

No OpenSearch integration, Docker Compose runner, Helm chart, AWS deployment, CDK stack, telemetry collector, OTLP exporter, dashboard importer, agent-eval compose runner, canary runner, load-test runner, Data Prepper adapter, Prometheus/Cortex integration, Alertmanager integration, OpenSearch Dashboards panel, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream stack configs, Docker Compose files, Helm charts, Terraform, CDK, installer scripts, `.env` values, credentials, telemetry samples, dashboards, videos, generated traces, agent examples, README prose beyond minimal metadata facts, OpenTelemetry snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0885OpensearchObservabilityStackReplayCorpusBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative replay-corpus paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0885OpensearchObservabilityStackReplayCorpusBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0884AwesomeMcpSecurityLiveDriftBoundary.test.ts tests/gap0885OpensearchObservabilityStackReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
