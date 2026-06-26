# GAP-0860 - go-openllmetry Studio evidence drilldown boundary

- Gap: `GAP-0860`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `traceloop/go-openllmetry`, `https://github.com/traceloop/go-openllmetry`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 44, Fork 10, Issues 10, Pull requests 0, 127 Commits, README.md, Apache-2.0 license, v0.12.1 Latest Feb 2, 2025, topics `datascience`, `generative-ai`, `golang`, `llmops`, `metrics`, `monitoring`, `observability`, `open-telemetry`, and Go 100.0%.
- Status: completed as a Studio evidence drilldown boundary over existing AMC drilldown receipts.

## Live source metadata

The live repository identifies go-openllmetry as a Go sister project to OpenLLMetry and describes OpenTelemetry-compatible traces and metrics for LLM applications. Relevant source-review signals include OpenLLMetry, OpenTelemetry, traces and metrics, Manual Instrumentation, OpenAI, Anthropic, and Azure OpenAI.

These facts are useful observability context, but they are not Studio evidence drilldown proof by themselves. No upstream source code, instrumentation examples, telemetry configs, SDK wrappers, docs prose beyond minimal metadata facts, generated traces, screenshots, figures, package config, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing Studio evidence drilldown receipts because observability context can inform how operators open a Score finding and inspect traces, receipts, source links, and preview states. The closure is not a go-openllmetry adapter, OpenTelemetry integration, or Go SDK path; it is a fail-closed boundary showing that go-openllmetry metadata is accepted only as source-review context unless AMC-owned drilldown proof exists.

For Studio evidence drilldown to pass, AMC needs UI route, source artifact links, evidence preview, and empty/error states, plus trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, rejected evidence reasons, row hashes, and no-copy proof. GitHub/README/license/OpenTelemetry metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing Score evidence drilldown response and question-level receipt preview. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed proof previews. |
| Watch | Relevant through existing Watch source artifact links and drilldown preview receipts. |
| Enforce | No runtime telemetry policy, instrumentation policy, or circuit breaker changed. |
| Vault | No telemetry traces, configs, SDK examples, or secure-storage behavior changed. |
| Fleet | Observability context only; no go-openllmetry runner or orchestration topology added. |
| Passport | Existing drilldown receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API, CLI, Studio route, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0860.

The focused regression exercises existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` behavior with a positive go-openllmetry-style observability drilldown packet, a negative source-metadata-only packet, and an explicit empty drilldown state. The positive path requires UI route, source artifact links, evidence preview, trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, rejected evidence reasons, and row proof. The negative path fails closed when GitHub/README/license/OpenTelemetry metadata replaces AMC-owned preview receipts.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, Apache-2.0 license metadata, Star 44, Fork 10, Issues 10, Pull requests 0, 127 Commits, v0.12.1 Latest Feb 2, 2025, Go 100.0%, datascience labels, generative-ai labels, golang labels, llmops labels, metrics labels, monitoring labels, observability labels, open-telemetry labels, OpenLLMetry labels, OpenTelemetry labels, Manual Instrumentation labels, OpenAI labels, Anthropic labels, Azure OpenAI labels, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown. Passing evidence requires UI route, source artifact links, evidence preview, trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, rejected evidence reasons, row hashes, and no-copy proof.

## No-bloat boundary

No go-openllmetry adapter, OpenLLMetry adapter, OpenTelemetry exporter, Go SDK wrapper, instrumentation runner, OpenAI wrapper, Anthropic wrapper, Azure OpenAI wrapper, telemetry collector, trace parser, metrics parser, source-specific Studio route, source-specific Watch monitor, provider wrapper, API route, CLI command, Studio panel, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, instrumentation examples, telemetry configs, SDK wrappers, docs prose beyond minimal metadata facts, generated traces, screenshots, figures, package config, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0860GoOpenllmetryStudioDrilldownBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing ready, fail-closed, empty, and no-leakage drilldown paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0860GoOpenllmetryStudioDrilldownBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0859RagEvaluatorPublicMethodologyBoundary.test.ts tests/gap0860GoOpenllmetryStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
