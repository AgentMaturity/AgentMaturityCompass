# GAP-0933 - Class-Production-AI-App metric-validity boundary

- Gap: `GAP-0933`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `fdhhhdjd/Class-Production-AI-App`, `https://github.com/fdhhhdjd/Class-Production-AI-App`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 16, Fork 8, Issues 0, Pull requests 0, 1 Commit, README.md, folders `.claude/ rules`, `app`, `data`, `docs`, `evaluation`, `frontend`, `observability`, `scripts`, and `tests`, files `.env.example`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docker-compose.yml`, and `pyproject.toml`, Releases 1, latest `v1.0.1` on Apr 21, 2026, Packages 0, Python 61.7%, and Dockerfile 38.3%.
- Status: Done

## Live source metadata

The live README title is `Production AI App`. It describes a Production-grade Retrieval-Augmented Generation application with an agentic layer, semantic caching, evaluation harness, and full observability. Relevant source-review signals include Hybrid retrieval, agentic layer document grading/query decomposition/adaptive routing, semantic cache, Three-layer safety, Golden-dataset offline eval, online monitoring, Per-stage tracing, user feedback capture, cost tracking, FastAPI backend, frontend, CI-ready tests, `offline_eval.py`, `online_monitor.py`, `tracer.py`, `feedback.py`, `cost_tracker.py`, Docker Compose, `pytest`, `ruff`, `mypy`, Python 3.11+, Docker & Docker Compose, and environment-key setup via `.env.example`.

Those facts are relevant to AMC only through existing metric-validity receipts. They do not justify a Class-Production-AI-App adapter, RAG pipeline, FastAPI app, frontend, semantic cache, security layer, eval runner, online monitor, observability integration, or source-specific scoring path.

No upstream Python code, Docker configs, frontend code, prompts, datasets, golden test rows, examples, configs, README prose beyond minimal metadata facts, generated outputs, model responses, evaluation results, architecture diagrams, or implementation details were copied into AMC.

## Relevance decision

`GAP-0933` is relevant because production AI app evaluation/observability context maps to AMC Score, Shield, and Watch through the existing metric-validity primitive. A metric-validity claim must be backed by AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, replayable eval pack, and CI gate proof.

The product closure is a focused regression over the existing `buildMetricValidationReport` primitive. No source-specific implementation module changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through metric-validity receipts only; score semantics did not change. |
| Shield | Relevant because unsupported metric-validity claims fail closed before increasing assurance. |
| Watch | Relevant because evaluation/observability context must bind to signed evidence and CI/Watch-style gates before affecting trust. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, `.env` content, prompts, datasets, eval rows, or upstream artifacts stored. |
| Fleet | Agentic-layer context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing Class-Production-AI-App context is accepted only through existing AMC metric-validity receipts:

- Positive path: signed evidence refs, validation table, confidence interval, sample size, metric owner, construct-validity facets, process-evidence coverage, outcome alignment, replayable eval pack, source refs, and CI gate pass.
- Negative path: GitHub/README/RAG/evaluation/observability metadata alone fails closed without signed metric-validity evidence.
- No-bloat path: source-specific identifiers stay out of metric-validity implementation modules.

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 16, Fork 8, Issues 0, Pull requests 0, 1 Commit, Releases 1, `v1.0.1`, Apr 21, 2026 release metadata, Packages 0, Python 61.7%, Dockerfile 38.3%, folder names, file names, production-ready labels, RAG labels, hybrid-search labels, self-correcting-agent labels, security-layer labels, evaluation-harness labels, observability labels, CI/CD labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct validity, reliability checks, outcome alignment, regression thresholds, signed evidence refs, row hashes, replayable eval pack, and CI gate proof.

## No-bloat boundary

No Class-Production-AI-App adapter, production AI app scaffold, RAG pipeline, hybrid retriever, reranker, semantic cache, agentic router, FastAPI backend, frontend, security layer, golden dataset importer, offline eval runner, online monitor, tracer, feedback collector, cost tracker, Docker Compose stack, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, Docker configs, frontend code, prompts, datasets, golden test rows, examples, configs, README prose beyond minimal metadata facts, generated outputs, model responses, evaluation results, architecture diagrams, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0933ClassProductionAiAppMetricValidityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; positive metric-validity, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0933ClassProductionAiAppMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0932LlmsRagNeurologyPublicMethodologyBoundary.test.ts tests/gap0933ClassProductionAiAppMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
