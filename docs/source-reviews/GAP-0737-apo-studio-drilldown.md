# GAP-0737 - APO Studio evidence drilldown boundary

- Gap: `GAP-0737`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/CloudDetail/apo` and docs entry `https://apo.pages.dev/`
- Retrieval: `2026-06-21` via live GitHub repository page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing AMC Studio/Console/Watch evidence drilldown receipts; no APO UI, OpenTelemetry backend, eBPF collector, Kubernetes deployment, or LLM troubleshooting subsystem added.

## Live source metadata

The live GitHub source identifies `CloudDetail/apo` as an observability platform combining OpenTelemetry with eBPF and LLM-assisted automated analysis/troubleshooting. Relevant source-review signals include Go implementation, OpenTelemetry, eBPF, APM, logs, metrics, traces, profiles, events, Kubernetes and Docker Compose setup paths, Helm deployment context, dashboards, service maps, trace pages, pod detail pages, SQL analysis, continuous profiling, and LLM-oriented fault diagnosis and remediation guidance.

These facts are relevant to AMC as Studio evidence drilldown context only. They are not product requirements to copy APO dashboards, deploy collectors, add eBPF data paths, implement an observability backend, or claim parity with APO. An APO-style source can support AMC only when the drilldown response is AMC-owned and contains a score route, source artifact links, accepted/rejected evidence previews, trace/receipt/evidence preview hashes, empty/error state receipts, source refs, signed evidence refs, row hashes, and fail-closed behavior.

## Relevance decision

GAP-0737 is relevant to AMC because the backlog asks for Studio evidence drilldown across Score, Shield, and Watch, and AMC already has the generic `buildScoreEvidenceDrilldown` primitive plus Watch-side source artifact links. APO strengthens the no-bloat boundary: observability platform context can inform source artifact links, but only AMC-owned signed receipts can drive operator-visible proof.

The accepted AMC primitive is an existing observability Studio drilldown row with `sourceKind: "github_repo"`. The APO source is context for source artifact links and observability metadata; the actual trace preview, evidence preview, receipt preview, empty state, error state, route, and fail-closed result must come from AMC evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing score evidence drilldown route that opens a question-level finding and shows accepted/rejected evidence previews. |
| Shield | Relevant through fail-closed handling for unsupported claims, missing evidence refs, empty preview state, and incomplete receipt hashes. |
| Watch | Relevant through source artifact links and trace/receipt/evidence preview hashes that connect operator drilldown to live observability context. |
| Enforce | No runtime remediation, Kubernetes, eBPF, or policy enforcement behavior changed. |
| Vault | No logs, traces, profiles, events, dashboards, API keys, or secure-storage behavior changed. |
| Fleet | Observability platform context only; no APO orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Observability context only; no compliance mapping changed. |

## Product closure

GAP-0737 is closed by documenting the live-source boundary and adding regression coverage over the existing evidence drilldown primitive. The positive path proves that APO-style observability drilldown context is accepted only when AMC-owned drilldown rows carry a valid route, source artifact links, preview hashes, ready evidence state, signed evidence refs, row hashes, and empty/error-state receipts. The negative path proves repository/docs metadata alone fails closed. The empty path proves missing question receipts return an explicit empty state rather than a partial proof.

The accepted product contract remains UI route, source artifact links, evidence preview, and empty/error states backed by AMC-owned signed receipts.

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console`, `src/studio`, API, CLI, Studio panel, Watch monitor, Shield verifier, APO UI, eBPF collector, OpenTelemetry backend, dashboard importer, service-map importer, Kubernetes deployment, Helm chart, Docker Compose setup, LLM troubleshooting workflow, docs importer, methodology version, diagnostic question bank, package dependency, or scoring behavior changed for GAP-0737.

## Fail-closed rule

Repository identity, repository URL, docs URL, APO labels, OpenTelemetry labels, eBPF labels, APM labels, logs/metrics/traces/profile/event labels, dashboard labels, Kubernetes labels, Docker Compose labels, Helm labels, LLM troubleshooting labels, fault-diagnosis labels, source identity, or local backlog metadata alone must fail closed for Studio evidence drilldown claims. Passing evidence requires AMC-owned UI route proof, source artifact links, evidence previews, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source-artifact preview hash, empty-state hash, error-state hash, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No APO UI, OpenTelemetry backend, eBPF collector, APM subsystem, log/metric/trace/profile/event ingester, dashboard importer, service-map importer, SQL analyzer, profiling collector, Kubernetes deployment, Helm chart, Docker Compose setup, LLM troubleshooting workflow, fault-diagnosis engine, remediation runner, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, dashboards, screenshots, diagrams, logs, traces, metrics, profiles, events, configs, code, deployment files, prompts, generated diagnoses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0737ApoStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
