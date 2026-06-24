# GAP-0963 - OpenObserve question explainability boundary

- Gap: `GAP-0963`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/openobserve/openobserve`, `https://openobserve.ai`
- Retrieval: `2026-06-22` via live GitHub repository page and OpenObserve linked documentation/site context.
- Status: closed through existing question-level score explainability receipts; no OpenObserve adapter, telemetry importer, trace importer, pipeline integration, dashboard clone, deployment wrapper, or source-specific scoring path added.

## Live source metadata

The live GitHub repository page for `openobserve/openobserve` identifies OpenObserve as an Open source observability platform for logs, metrics, traces, frontend monitoring, pipelines and LLM observability. It positions the product as an alternative to Datadog, Splunk, and Elasticsearch, with 140x lower storage costs and single binary deployment. The page shows Star 19.4k, Fork 862, Issues 542, Pull requests 26, 6,252 Commits, README, Security, and AGPL-3.0 license metadata.

The README describes OpenObserve as a cloud-native observability tool for logs, metrics, traces, analytics, and Real User Monitoring. It lists OpenTelemetry Native support; Unified Platform Logs, metrics, traces, RUM, dashboards, alerts; SQL + PromQL; Rust implementation; multi-tenancy; S3-native architecture; and stateless deployment.

The feature sections include Logs Management, Distributed Tracing, Metrics & Dashboards, Frontend Monitoring, Alerts, and Pipelines. The tracing section references a Trace details page, Flamegraphs and Gantt Charts, span-level inspection, and request flow visualization. The security/compliance section references Sensitive Data Redaction, data encryption, SSO, RBAC, SOC 2 Type II certified, ISO 27001 certified, GDPR compliant, and HIPAA ready.

These facts are useful observability context for explaining question-level score movement, accepted evidence, rejected evidence, and repair paths. They are not AMC proof by themselves. No OpenObserve source code, README prose beyond minimal metadata facts, docs prose, deployment commands, screenshots, telemetry data, pipelines, traces, dashboards, alerts, compliance artifacts, configs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability. OpenObserve's logs, metrics, traces, alerts, pipelines, redaction, security, and compliance context reinforces why a user should see why each L0-L5 question moved, which evidence was accepted, which evidence was rejected, and what repair hint remains.

The product closure is not OpenObserve parity. It is an AMC-owned explainability receipt that ties question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, fail-closed thresholds, signed evidence rows, and row hashes to Score/Shield/Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Question-level explainability must show question ID, level movement, accepted evidence IDs, rejected evidence reasons, repair hint, thresholds, and row hashes. |
| Shield | Relevant when missing gates or rejected evidence describe unsafe, unverified, unsupported, or privacy-sensitive agent behavior. |
| Watch | Relevant as observability context, but no Watch runtime monitor or OpenObserve connector changed. |
| Enforce | No runtime policy, deployment gate, or circuit breaker changed. |
| Vault | Sensitive Data Redaction and compliance context only; no secure-storage, DLP, secret, or data-residency behavior changed. |
| Fleet | Telemetry context only; no Fleet orchestration or trust topology changed. |
| Passport | Existing Passport artifacts can carry AMC-owned question evidence; no Passport schema changed. |
| Comply | SOC2/ISO/GDPR/HIPAA context only; no compliance control mapping changed. |

## Product closure

No product code changed for GAP-0963. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with OpenObserve source context.

The positive path proves an accepted question row requires AMC-owned question ID, accepted evidence IDs, signed evidence, rejected evidence reasons, repair hint, reproducible eval pack, fail-closed thresholds, and row hashes. The negative path proves OpenObserve repository/observability/logs/metrics/traces/RUM/pipeline/security/compliance metadata fails closed when it replaces AMC-owned question evidence.

## Fail-closed rule

Live GitHub repository page reachability, Star 19.4k, Fork 862, Issues 542, Pull requests 26, 6,252 Commits, AGPL-3.0 license, Open source observability platform for logs, metrics, traces, frontend monitoring, pipelines and LLM observability label, Datadog/Splunk/Elasticsearch comparison, 140x lower storage costs, single binary deployment, OpenTelemetry Native label, Unified Platform Logs, metrics, traces, RUM, dashboards, alerts label, Logs Management, Distributed Tracing, Metrics & Dashboards, Frontend Monitoring, Alerts, Pipelines, Trace details page, Flamegraphs and Gantt Charts, Real User Monitoring, Sensitive Data Redaction, SOC 2 Type II certified, ISO 27001 certified, GDPR compliant, HIPAA ready, local backlog metadata, or source identity alone must fail closed for question-level score explainability.

Passing question-level explainability requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed rows, reproducible eval pack, fail-closed thresholds, and row hashes.

## No-bloat boundary

No OpenObserve adapter, telemetry importer, trace importer, logs importer, metrics importer, RUM importer, pipeline integration, dashboard clone, alert connector, redaction bridge, SSO/RBAC/compliance mapper, deployment wrapper, storage connector, OpenTelemetry wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema change, source-specific implementation module, source-specific scoring path, or parity wrapper was added.

No OpenObserve source code, README prose beyond minimal metadata facts, docs prose, deployment commands, screenshots, telemetry data, pipelines, traces, dashboards, alerts, compliance artifacts, configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0963OpenObserveQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0962CometOpikStudioDrilldownBoundary.test.ts tests/gap0963OpenObserveQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
