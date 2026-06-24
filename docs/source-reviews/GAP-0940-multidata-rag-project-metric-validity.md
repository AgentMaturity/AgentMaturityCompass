# GAP-0940 - multidata-rag-project metric-validity boundary

- Gap: `GAP-0940`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `sourangshupal/multidata-rag-project`, `https://github.com/sourangshupal/multidata-rag-project`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. Shell DNS for `api.github.com` was unavailable in this environment, so the primary-source review used the web-accessible GitHub repository page.
- Status: Done

## Live source metadata

The live GitHub repository page showed branch `main`, Star 12, Fork 29, Issues 0, Pull requests 0, and 66 Commits. Visible folders included `.github/ workflows`, `app`, `data`, `notebooks`, and `tests`. Visible files included `.dockerignore`, `.env.example`, `.gitignore`, `Dockerfile`, `Dockerfile.lambda`, `Dockerfile.lambda.with-tesseract`, `README.md`, `claude.md`, `docker-compose.yml`, `evaluate.py`, `lambda_handler.py`, `pyproject.toml`, `requirements.txt`, `s3-cache-policy.json`, `supabase_con_test.py`, and `trust-policy.json`.

The README title was `Multi-Source RAG + Text-to-SQL System`. It described a production-ready FastAPI application combining Document RAG and Text-to-SQL, Intelligent Query Routing, document processing, SQL generation, evaluation metrics, and monitoring. Relevant source-review signals included RAGAS Metrics, Faithfulness, answer relevancy, OPIK Tracking, CloudWatch Monitoring, CI/CD Pipeline, GitHub Actions deployment, Test Deployment, health check and smoke tests, and structured error handling.

The README also documented SQL Determinism Configuration with `VANNA_TEMPERATURE`, `VANNA_TOP_P`, `VANNA_SEED`, `VANNA_MAX_TOKENS`, and a claim that with `VANNA_TEMPERATURE=0.0`, the same question should produce identical SQL `>95%` of the time. The Success Metrics table listed SQL Generation 70%+ accuracy, Query Routing 80%+ correct, RAGAS Faithfulness > 0.7, RAGAS Relevancy > 0.8, and Response Time < 15 seconds. The repository page showed No releases published, Packages 0, Python 59.7%, Jupyter Notebook 39.8%, and Dockerfile 0.5%.

Those facts are relevant to AMC only through existing metric-validity receipts. RAGAS, OPIK, SQL determinism, CI/CD, smoke tests, and success metric labels can shape review fixtures, but AMC must still require a validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, replayable eval pack, and CI gate proof.

No upstream Python code, notebook content, Dockerfiles, Lambda code, GitHub Actions workflows, sample data, SQL schema, environment files, API examples, RAGAS outputs, OPIK traces, CloudWatch logs, README prose beyond minimal metadata facts, generated outputs, model responses, deployment commands, or implementation details were copied into AMC.

## Relevance decision

`GAP-0940` is relevant because the source describes evaluation metrics, monitoring, determinism controls, CI/CD validation, and production RAG/Text-to-SQL success thresholds. That maps to AMC Score, Shield, and Watch through the existing metric-validity primitive.

This does not justify a multidata-rag-project adapter, FastAPI integration, RAGAS runner, OPIK integration, Pinecone connector, Vanna Text-to-SQL connector, Lambda deployer, Docker workflow, notebook importer, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through metric-validity receipts only; scoring semantics did not change. |
| Shield | Relevant because metadata-only metric-validity claims fail closed before increasing assurance. |
| Watch | Relevant because monitoring, CI, smoke-test, and threshold context must bind to signed evidence before operator views can rely on it. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, environment values, uploaded documents, database rows, logs, traces, or upstream artifacts stored. |
| Fleet | No fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing multidata-rag-project context is accepted only through existing AMC metric-validity receipts:

- Positive path: signed evidence refs, validation table, confidence interval, sample size, metric owner, construct-validity facets, process-evidence coverage, outcome alignment, regression thresholds, source refs, row hashes, replayable eval pack, and CI gate pass.
- Negative path: repository, README, RAGAS, OPIK, CloudWatch, CI/CD, smoke-test, deterministic-SQL, success-metric, release, language, file, and folder metadata alone fails closed without signed metric-validity evidence.
- No-bloat path: source-specific identifiers stay out of metric-validity implementation modules.

No `src/score/metricValidity.ts`, `src/diagnostic/questionScoreExplainability.ts`, `docs/SCORING_METHODOLOGY.md`, public methodology, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

Live GitHub repository page reachability, branch `main`, Star 12, Fork 29, Issues 0, Pull requests 0, 66 Commits, folder names, file names, README labels, FastAPI labels, Document RAG labels, Text-to-SQL labels, Intelligent Query Routing labels, RAGAS Metrics labels, Faithfulness labels, answer relevancy labels, OPIK Tracking labels, CloudWatch Monitoring labels, CI/CD Pipeline labels, Test Deployment labels, health check and smoke tests labels, SQL Determinism Configuration labels, `VANNA_TEMPERATURE`, `VANNA_TOP_P`, `VANNA_SEED`, `>95%` identical SQL labels, SQL Generation 70%+ accuracy labels, Query Routing 80%+ correct labels, RAGAS Faithfulness > 0.7 labels, RAGAS Relevancy > 0.8 labels, Response Time < 15 seconds labels, No releases published, Python 59.7%, Jupyter Notebook 39.8%, Dockerfile 0.5%, local backlog metadata, or source identity alone must fail closed for metric-validity claims.

Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct validity, reliability checks, outcome alignment, regression thresholds, signed evidence refs, row hashes, replayable eval pack, source refs, CI gate proof, and no-copy/no-parity proof.

## No-bloat boundary

No multidata-rag-project adapter, FastAPI integration, RAGAS runner, OPIK integration, CloudWatch integration, Pinecone connector, Supabase connector, Vanna Text-to-SQL connector, Docling importer, Unstructured importer, Lambda deployer, Docker workflow, notebook importer, SQL schema importer, sample-data generator, evaluation script runner, query router, document uploader, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, notebook content, Dockerfiles, Lambda code, GitHub Actions workflows, sample data, SQL schema, environment files, API examples, RAGAS outputs, OPIK traces, CloudWatch logs, README prose beyond minimal metadata facts, generated outputs, model responses, deployment commands, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0940MultidataRagProjectMetricValidityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; metric-validity positive, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0940MultidataRagProjectMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0939SelftuneQuestionExplainabilityBoundary.test.ts tests/gap0940MultidataRagProjectMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
