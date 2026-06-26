# GAP-0941 - LangSmith question-score explainability boundary

- Gap: `GAP-0941`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `LangSmith`, `https://www.langchain.com/langsmith`
- Retrieval: `2026-06-22` via live LangSmith Observability page and live LangSmith Evaluation page.
- Status: Done

## Live source metadata

The live LangSmith Observability page resolved from `https://www.langchain.com/langsmith` to `https://www.langchain.com/langsmith/observability`. The page title was `LangSmith Observability: AI Agent Observability Platform`, with the headline `Know what your agents are really doing`. It said LangSmith gives complete visibility into agent behavior and can trace preferred frameworks or integrate with any agent stack using Python, Typescript, Go, or Java SDKs.

The Observability page grouped capabilities under Tracing, Monitoring, and Insights. Source-review signals included native tracing for popular agent frameworks and OpenTelemetry, Message threading for multi-turn chat interactions, real-time production monitoring, Cost tracking, Online LLM-as-judge and code evals, Tool and agent trajectory monitoring, Webhook and Pagerduty alerts, Unsupervised topic clustering, Templates for error analysis, Executive summary, SmithDB trace queries, custom dashboards for token usage, latency (P50, P99), error rates, cost breakdowns, feedback scores, alerts when metrics cross thresholds, self-hosting/BYOC, data residency, and no-training-on-customer-data statements.

The live LangSmith Evaluation page at `https://www.langchain.com/langsmith/evaluation` was titled `LangSmith Evaluations: LLM & AI Agent Evaluation Platform`, with the headline `Continuously improve agent quality`. It said teams can Run evals before and after shipping, gather expert feedback on agent performance, and iterate on prompts. Evaluation signals included curated datasets, compare agent versions, benchmark performance, catch regressions, online evals that score production interactions, Calibrate llm-as-judge evals with human feedback, Conversation evals, Multi-modal evals, Human feedback, annotation queues, precise workflow feedback, Shared scoring criteria, Prompt optimization, evaluator types, heuristic checks, LLM-as-judge, pairwise comparisons, custom Python/TypeScript evaluators, route samples to human reviewers, offline and online evaluation differences, agent trajectories, pytest, Vitest, and GitHub workflows, thresholds, fail pipelines, comparison view dashboards, RAG context precision, and faithfulness.

Those facts are relevant to AMC only through existing question-score explainability and eval-score pack receipts. LangSmith product claims can identify a competitor source-review signal, but they cannot replace AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, reproducible eval packs, and CI or lifecycle gate proof.

No LangSmith website prose beyond minimal metadata facts, screenshots, SDK code, docs snippets, API examples, prompts, trace exports, dashboards, eval datasets, evaluator configs, product workflows, or implementation details were copied into AMC.

## Relevance decision

`GAP-0941` is relevant because LangSmith's tracing, monitoring, online/offline evals, human feedback, LLM-as-judge calibration, agent trajectories, CI thresholds, and dashboards map to AMC's existing question-level score explainability requirement: explain why each L0-L5 question moved, which evidence was accepted, which evidence was rejected, which gates were missing, and what repair hint should be followed.

This is a Score, Shield, and Watch proof boundary, not a LangSmith integration or parity claim. The accepted AMC proof remains question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, row hash, source refs, and no-copy/no-parity proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through question-level score explainability and eval-score proof only. |
| Shield | Relevant because competitor metadata alone fails closed before increasing assurance. |
| Watch | Relevant because traces, monitoring, online evals, feedback scores, and CI thresholds must bind to signed evidence before operator views can rely on them. |
| Enforce | No runtime policy changed. |
| Vault | No traces, prompts, feedback, datasets, dashboards, secrets, or upstream artifacts stored. |
| Fleet | No fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing LangSmith competitor context is accepted only through existing AMC question-score explainability and eval-score pack primitives:

- Positive path: an AMC-owned question report includes question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, CI refs, row hash, and source refs.
- Negative path: LangSmith Observability/Evaluation page metadata alone fails closed without AMC-owned question evidence.
- No-bloat path: source-specific identifiers stay out of diagnostic, guide, and passport implementation modules.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

LangSmith product-page reachability, AI Agent Observability Platform labels, complete visibility labels, SDK language labels, Tracing labels, Monitoring labels, Insights labels, OpenTelemetry labels, Message threading labels, Online LLM-as-judge and code evals labels, Tool and agent trajectory monitoring labels, Webhook and Pagerduty alerts labels, Unsupervised topic clustering labels, P50/P99 labels, feedback scores labels, Evaluation Platform labels, Continuously improve agent quality labels, Run evals before and after shipping labels, curated datasets labels, benchmark performance labels, catch regressions labels, Calibrate llm-as-judge evals with human feedback labels, Conversation evals labels, Multi-modal evals labels, Shared scoring criteria labels, annotation queues labels, heuristic checks labels, pairwise comparisons labels, pytest, Vitest, and GitHub workflows labels, fail pipelines labels, comparison view dashboards labels, context precision labels, faithfulness labels, local backlog metadata, or competitor identity alone must fail closed for question-level score explainability claims.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, CI or lifecycle gate proof, row hashes, source refs, and no-copy/no-parity proof.

## No-bloat boundary

No LangSmith adapter, SDK integration, trace importer, dataset importer, evaluator importer, dashboard integration, annotation queue workflow, SmithDB query layer, OpenTelemetry exporter, PagerDuty integration, webhook integration, CI workflow generator, prompt optimization workflow, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No LangSmith website prose beyond minimal metadata facts, screenshots, SDK code, docs snippets, API examples, prompts, trace exports, dashboards, eval datasets, evaluator configs, product workflows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0941LangSmithQuestionExplainabilityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; question explainability, eval-score pack, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0941LangSmithQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0940MultidataRagProjectMetricValidityBoundary.test.ts tests/gap0941LangSmithQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
