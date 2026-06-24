# GAP-0950 - MLflow public-methodology boundary

- Gap: `GAP-0950`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page for `mlflow/mlflow`, `https://github.com/mlflow/mlflow`; MLflow docs `https://mlflow.org/docs/latest/genai/`, evaluation docs `https://mlflow.org/docs/latest/genai/eval-monitor/`, and tracing docs `https://mlflow.org/docs/latest/genai/tracing/`
- Retrieval: `2026-06-22` via live source review
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live GitHub repository page identified `mlflow/mlflow` as public, showed Star 26.7k, Fork 5.9k, Issues 1.4k, Pull requests 561, 12,569 Commits, and Apache-2.0 license. The README headline was The Open Source AI Engineering Platform for Agents, LLMs & Models. The README described MLflow as the largest open source AI engineering platform for agents, LLMs, and ML models, with over 60 million monthly downloads, and listed production-grade observability, evaluation, prompt management, prompt optimization, and AI Gateway capabilities.

The live MLflow LLMs and Agents docs identified the page as MLflow: AI Engineering Platform for LLMs and Agents. That page described debugging, evaluation, monitoring, optimization, over 30 million monthly downloads, 20K+ GitHub Stars, 50M+ monthly downloads, OpenTelemetry compatibility, vendor-neutral infrastructure, Complete Observability, and traces that capture prompts, retrievals, tool calls, and LLM responses.

The live evaluation docs described Evaluation & Monitoring for LLMs and agents, LLM-as-a-judge, custom metrics, Evaluation-Driven Development, Dataset Management, Human Feedback, Systematic Evaluation, Production Monitoring, Evaluation Datasets, latency and token usage, and an evaluation shape with Dataset, Scorer, and Predict Function.

Those facts are useful adjacent-product context for Score, Shield, and Watch. They do not change AMC public methodology versioning because they do not alter AMC score semantics, evidence taxonomy, maturity levels, badge semantics, diagnostic question bank, or public methodology contract.

## Relevance decision

`GAP-0950` is relevant only as a public-methodology no-op and source-review boundary. MLflow is a credible adjacent AI engineering/evaluation/observability platform, but MLflow platform metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance in AMC.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; MLflow source metadata is not AMC methodology-versioning proof. |
| Shield | Evaluation and monitoring context only; no Shield scoring or safety methodology changed. |
| Watch | Observability and production-monitoring context only; no Watch runtime or methodology behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No traces, prompts, eval datasets, gateway credentials, or upstream artifacts stored. |
| Fleet | Agent-framework context only; no Fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that this gap does not add `mlflow/mlflow`, `https://github.com/mlflow/mlflow`, or `mlflow_public_methodology` to AMC public methodology semantics or public-methodology implementation modules.

This closure is a documented skip for implementation: repository stars, forks, issues, pull requests, commit counts, license, monthly download claims, observability labels, evaluation labels, prompt-management labels, OpenTelemetry labels, AI Gateway labels, LLM-as-a-judge labels, dataset labels, human-feedback labels, production-monitoring labels, latency/token usage labels, and eval-shape labels are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub reachability, `mlflow/mlflow` repository metadata, Star 26.7k, Fork 5.9k, Issues 1.4k, Pull requests 561, 12,569 Commits, Apache-2.0 license, open-source platform labels, over 60 million monthly downloads, over 30 million monthly downloads, 20K+ GitHub Stars, 50M+ monthly downloads, OpenTelemetry labels, vendor-neutral labels, Complete Observability labels, prompts/retrievals/tool-calls/LLM-response trace labels, Evaluation & Monitoring labels, LLM-as-a-judge labels, custom metrics labels, Evaluation-Driven Development labels, Dataset Management labels, Human Feedback labels, Systematic Evaluation labels, Production Monitoring labels, Evaluation Datasets labels, latency and token usage labels, Dataset/Scorer/Predict Function labels, local backlog metadata, or GitHub repository identity alone must fail closed for public methodology versioning.

Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, scoring-semantics rationale, and badge compatibility analysis. MLflow platform metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No MLflow adapter, tracing importer, eval runner, prompt manager, AI Gateway client, OpenTelemetry collector, model registry bridge, dataset importer, human-feedback importer, LLM-judge bridge, metric importer, CI/CD runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No MLflow code, docs prose beyond minimal metadata facts, screenshots, examples, configs, traces, prompts, eval datasets, benchmark rows, model outputs, generated outputs, or implementation details were copied into AMC.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0950MlflowPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0950MlflowPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression with `GAP-0949`: `npx vitest run tests/gap0949LangWatchLiveDriftBoundary.test.ts tests/gap0950MlflowPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
