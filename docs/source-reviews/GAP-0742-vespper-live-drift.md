# GAP-0742 - Vespper live-drift boundary

- Gap: `GAP-0742`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/vespperhq/vespper` and docs entry `https://docs.vespper.com`
- Retrieval: `2026-06-21` via live GitHub repository page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no Vespper integration, incident copilot, Slack bot, or observability-data chat subsystem added.

## Live source metadata

The live GitHub source identifies `vespperhq/vespper` as an archived TypeScript repository for an open-source AI on-call developer/copilot that lets users chat with observability data and code. Relevant source-review signals include automatic root-cause analysis, incident response, ChatOps, Slack integration, Datadog and Coralogix connectors, Opsgenie and PagerDuty context, GitHub/Notion/Jira/Confluence context, Docker Compose setup, LiteLLM usage, ChromaDB usage, PostHog telemetry, TypeScript implementation, Apache-2.0 licensing, and repository archived/read-only status.

These facts are relevant to AMC only as live score and behavior drift context. Incident copilots and observability chat agents can drift when provider, prompt, telemetry source, code index, alert routing, incident context, connector, or retrieval setup changes. That does not justify copying Vespper, integrating its connectors, running its stack, or claiming on-call parity. No upstream README prose beyond minimal metadata facts, code, connector configs, Docker Compose files, prompts, telemetry schemas, incident examples, screenshots, docs, or implementation details were copied into AMC.

## Relevance decision

GAP-0742 is relevant to AMC through existing Watch live score and behavior drift receipts. The accepted AMC primitive is already `runLiveScoreBehaviorDrift`: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

Vespper context sharpens what must be measured for observability copilots: answer score drift, RCA behavior drift, incident-routing drift, connector-behavior drift, retrieval/context drift, latency/cost drift, and signed trace evidence. Repository, docs, archived status, connector labels, ChatOps labels, or observability-data labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions for incident/observability copilot eval rows. |
| Shield | Relevant through fail-closed signed evidence requirements for unsupported RCA, incident, or connector claims. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime Slack, incident-routing, connector, remediation, or policy-enforcement behavior changed. |
| Vault | No observability data, incident records, code indexes, prompts, API keys, telemetry payloads, or secure-storage behavior changed. |
| Fleet | Incident-copilot context only; no orchestration adapter or multi-agent topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Incident/observability context only; no compliance mapping changed. |

## Product closure

GAP-0742 is closed by documenting the live-source boundary and adding regression coverage over the existing live score and behavior drift primitive. The positive path exercises Vespper-style incident/observability copilot drift through AMC-owned baseline/live rows, signed evidence refs, source refs, receipt hashes, and Watch alert projection. The negative path fails closed when repository/docs metadata replaces signed live-drift evidence.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Vespper adapter, incident copilot, Slack bot, Datadog connector, Coralogix connector, Opsgenie connector, PagerDuty connector, GitHub/Notion/Jira/Confluence integration, Docker Compose stack, LiteLLM setup, ChromaDB setup, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0742.

## Fail-closed rule

Repository identity, repository URL, docs URL, archived status, Vespper labels, incident-response labels, ChatOps labels, RCA labels, observability-data labels, Slack labels, Datadog/Coralogix labels, Opsgenie/PagerDuty labels, GitHub/Notion/Jira/Confluence labels, Docker Compose labels, LiteLLM labels, ChromaDB labels, PostHog labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Vespper integration, incident copilot, Slack bot, Datadog connector, Coralogix connector, Opsgenie connector, PagerDuty connector, GitHub/Notion/Jira/Confluence adapter, observability chat UI, RCA workflow, Docker Compose stack, LiteLLM setup, ChromaDB setup, telemetry importer, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, connector configs, Docker Compose files, prompts, telemetry schemas, incident examples, screenshots, docs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0742VespperLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
