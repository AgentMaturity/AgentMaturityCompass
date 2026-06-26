# GAP-0017 - PromptLayer Studio evidence drilldown boundary

- Gap: `GAP-0017`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.promptlayer.com/`, docs overview `https://docs.promptlayer.com/overview`, traces docs `https://docs.promptlayer.com/running-requests/traces`, evaluations overview `https://docs.promptlayer.com/features/evaluations/overview`, evaluation pipelines `https://docs.promptlayer.com/features/evaluations/building-pipelines`, CI/regression docs `https://docs.promptlayer.com/features/evaluations/continuous-integration`, dataset-from-history docs `https://docs.promptlayer.com/features/evaluations/datasets-create-from-history`, analytics docs `https://docs.promptlayer.com/why-promptlayer/analytics`, and API introduction `https://docs.promptlayer.com/reference/introduction`
- Retrieval: live PromptLayer homepage and docs, local backlog metadata, and existing AMC Studio evidence drilldown implementation, 2026-06-26
- Status: Done

## Live source metadata

The live PromptLayer homepage identifies the product with the phrase Version, test, and monitor every prompt and agent. It frames the product around prompt management, an eval harness, observability, collaboration, prompt and agent versioning, tracing, regression sets, and domain-expert review.

The live docs overview uses Trace, evaluate, release and describes connecting observability first to trace production requests and understand quality, cost, and latency. It also describes capturing requests, responses, metadata, cost, latency, and feedback in one timeline, then using Tables and Prompt Registry to support evaluation and release workflows.

The live traces docs identify Traces and OpenTelemetry context, and describe tracing execution flow, LLM requests, durations, inputs and outputs, request logs, and application behavior. The evaluation docs describe the Evaluations page, batch evaluations, dataset-driven scoring, visual pipeline construction, and regression testing. The dataset-from-history docs describe building datasets from real production or staging traffic. The analytics docs name average latency, total cost, request logs, usage patterns, and performance metrics. The API introduction describes programmatic access to prompts, workflows, evaluations, datasets, request logs, traces, tables, and other workspace resources.

These facts are Studio drilldown context only. No PromptLayer product copy, docs examples, SDK/API snippets, request logs, traces, datasets, tables, evaluation rows, screenshots, dashboards, product UI, prompts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0017 is relevant to AMC because the backlog asks operators to open a score finding and drill into traces, receipts, policy rules, source artifact links, evidence previews, and empty/error states. PromptLayer's public product and docs describe the same operator need around traces, observability, evaluations, regression testing, request logs, analytics, and production/staging examples.

The accepted AMC primitive is the existing Studio evidence drilldown path: UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and fail-closed response state.

The source does not justify a PromptLayer adapter, PromptLayer SDK wrapper, prompt importer, request-log importer, trace importer, evaluation runner, dataset importer, table importer, analytics connector, API client, source-specific Studio route, scoring semantic change, methodology version bump, package dependency, or product parity claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score-finding drilldown output, accepted/rejected evidence preview, signed evidence, and fail-closed state. |
| Shield | Relevant because unsafe, hallucinated, or policy-risk findings must fail closed when trace/receipt/source-artifact/empty/error proof is missing. |
| Watch | Relevant through observability source links and Watch-side source artifact link projection into Score drilldowns. |
| Enforce | Prompt release/regression context only; no runtime policy, provider route, deployment gate, or circuit breaker changed. |
| Vault | No secure-storage, PII redaction, tenant isolation, request-log storage, or secret behavior changed. |
| Fleet | Agent/versioning context only; no Fleet topology, routing, or orchestration behavior changed. |
| Passport | No portable trust token, badge, or proof-bundle schema changed. |
| Comply | Audit and evidence context only; no compliance framework mapping changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, badge semantics, diagnostic question bank, PromptLayer adapter, trace importer, request-log importer, evaluation runner, table importer, dataset importer, analytics connector, API client, or source-specific implementation module changed for GAP-0017.

The focused regression exercises the existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` paths. The positive path requires UI route, source artifact links, evidence preview, trace preview, receipt preview, empty/error states, signed evidence refs, accepted/rejected evidence, source refs, and a ready non-fail-closed response. The negative path fails closed when PromptLayer product metadata replaces AMC-owned evidence previews. A missing question receipt pack returns an explicit empty state.

This closes the backlog acceptance boundary for UI route, source artifact links, evidence preview, and empty/error states without adding a PromptLayer-specific product surface.

## Fail-closed rule

PromptLayer name, homepage, docs overview, trace docs, evaluation docs, CI/regression docs, dataset-from-history docs, analytics docs, API docs, prompt-management labels, eval-harness labels, observability labels, trace labels, OpenTelemetry labels, request-log labels, dataset labels, table labels, evaluation-pipeline labels, regression-testing labels, production/staging traffic labels, analytics labels, average-latency labels, total-cost labels, product screenshots, product examples, or local backlog metadata must fail closed as Studio evidence drilldown proof.

Passing evidence requires AMC-owned UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and explicit repair guidance.

## No-bloat boundary

No PromptLayer adapter, PromptLayer SDK wrapper, PromptLayer API client, prompt importer, request-log importer, trace importer, evaluation runner, table importer, dataset importer, regression-test importer, analytics connector, OpenTelemetry exporter, dashboard clone, source-specific Studio route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added.

No PromptLayer product copy, docs examples, SDK/API snippets, request logs, traces, datasets, tables, evaluation rows, scoring rows, screenshots, dashboards, product UI, prompts, generated outputs, model responses, configs, API keys, or implementation details were copied.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0017PromptLayerStudioDrilldownBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0017-promptlayer-studio-drilldown.md` did not exist; 4 Studio drilldown/no-bloat tests passed.
- Live source checks:
  - Web channel found the PromptLayer homepage, docs overview, traces docs, evaluation docs, CI/regression docs, dataset-from-history docs, analytics docs, and API docs and verified current search/source metadata.
  - Shell retrieval fetched `https://www.promptlayer.com/` with HTTP 200 and first-200KB SHA-256 `7c713d79264774c4b144af4138b5ba2f914f438881dc86cee518e1de0855f361`.
  - Shell retrieval fetched `https://docs.promptlayer.com/overview` with HTTP 200 and first-200KB SHA-256 `77845a8d35e820ba63a94d87e4050464f90d64491f2705ab1fcd5c89fe1b68d7`.
  - Shell retrieval fetched `https://docs.promptlayer.com/running-requests/traces` with HTTP 200 and first-200KB SHA-256 `6db1574d386616243677dfae9e0b0fa41ae7fa54f7a6714796d27405c59e4859`.
  - Shell retrieval fetched `https://docs.promptlayer.com/features/evaluations/overview` with HTTP 200 and first-200KB SHA-256 `6e8f782e3721afaa9beb2c88d944388f3546a6113de495ce98ba64d4fde99c39`.
  - Shell retrieval fetched `https://docs.promptlayer.com/features/evaluations/building-pipelines` with HTTP 200 and first-200KB SHA-256 `0887cade4e8c5df1fad767f37f8d687ddddea9998d939f0a82390c5d5aee0094`.
  - Shell retrieval fetched `https://docs.promptlayer.com/features/evaluations/continuous-integration` with HTTP 200 and first-200KB SHA-256 `ba0dcff9c9072a2c2b9b512eee0d8e447ae28c09f3005504c2597d6c7adb858f`.
  - Shell retrieval fetched `https://docs.promptlayer.com/features/evaluations/datasets-create-from-history` with HTTP 200 and first-200KB SHA-256 `b60f1b21247186658f127064b63f381962cee439520902505841150d40c1a90a`.
  - Shell retrieval fetched `https://docs.promptlayer.com/why-promptlayer/analytics` with HTTP 200 and first-200KB SHA-256 `017c9d937b77656196894d829fd5115097afc840af1843c503c3be89aa1b31f3`.
  - Shell retrieval fetched `https://docs.promptlayer.com/reference/introduction` with HTTP 200 and first-200KB SHA-256 `ec55a1d342e8f41cafe70e07f8cd3d6c1531eb7eb920c2dcaf8283389401d7b3`.
- Focused test: `npx vitest run tests/gap0017PromptLayerStudioDrilldownBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Paired Studio drilldown regression: `npx vitest run tests/gap0017PromptLayerStudioDrilldownBoundary.test.ts tests/gap0010GalileoStudioDrilldownBoundary.test.ts tests/evidenceDrilldown.test.ts tests/apiRouters.test.ts tests/gap0943BraintrustStudioDrilldownBoundary.test.ts tests/gap0958LaminarStudioDrilldownBoundary.test.ts tests/gap0962CometOpikStudioDrilldownBoundary.test.ts tests/gap0979HeliconeStudioDrilldownBoundary.test.ts --reporter=dot` passed, 8 files / 61 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1020 files / 8096 tests.
