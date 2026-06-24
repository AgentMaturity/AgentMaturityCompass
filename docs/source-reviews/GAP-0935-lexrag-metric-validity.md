# GAP-0935 - LexRAG metric-validity boundary

- Gap: `GAP-0935`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `tydreamer/LexRAG`, `https://github.com/tydreamer/LexRAG`
- Retrieval: `2026-06-22` via live GitHub API repository metadata, contents, languages, releases, tags, latest-commit, and README metadata. The live API showed `default_branch: main`, `stargazers_count: 21`, `watchers_count: 21`, `forks_count: 0`, `open_issues_count: 0`, `license: null`, `created_at: 2026-04-03T18:58:44Z`, `updated_at: 2026-06-21T02:35:52Z`, `pushed_at: 2026-04-30T19:31:27Z`, topics `hugging-face`, `llm`, `nlp`, `postgresql`, `python`, and `rag`, repository files `.gitignore`, `docker-compose.yaml`, `images`, `llm-app`, `orchestration`, and `readme.md`, languages Jupyter Notebook, Python, and Dockerfile, No releases, No tags, latest commit `f36b4ece5a2fe69f6cd645a515e1ae7c030c4a19`, and `readme.md sha fc65bda78052f5b6da59e4aed33f0ec380a44489`.
- Status: Done

## Live source metadata

The successful repository API call describes LexRAG as a Retrieval-Augmented Generation application for querying legal documents. It uses PostgreSQL, Elasticsearch, and LLM components to provide summaries and suggestions based on user queries, and it includes data ingestion with Airflow, real-time monitoring with Grafana, and a Streamlit interface. The successful README metadata response exposed README content describing Retrieval-Augmented Generation, legal documents, PostgreSQL, Elasticsearch, Airflow, Grafana, Streamlit, Google BERT, Hugging Face, Docker, Hit Rate, Mean Reciprocal Rank, Google BERT Scores, user feedback, response time, satisfaction rate, and monitoring dashboard context.

The raw README endpoint and later README-body decode attempts returned empty bodies in this sandbox, so the review uses only the successful GitHub API metadata and the earlier GitHub contents response as primary-source evidence. Shell `git ls-remote` remained DNS-restricted with `Could not resolve host: github.com`.

Those facts are relevant to AMC only through existing metric-validity receipts. Legal RAG retrieval and monitoring metrics can help shape test fixtures, but Score, Shield, or Watch may accept a metric-validity claim only with an AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, replayable eval pack, and CI gate proof.

No upstream notebooks, Python code, Docker Compose files, images, datasets, legal questions, prompts, API-key examples, Grafana dashboards, Airflow DAGs, Elasticsearch mappings, Streamlit UI code, README prose beyond minimal metadata facts, generated outputs, model responses, benchmark rows, or implementation details were copied into AMC.

## Relevance decision

`GAP-0935` is relevant because LexRAG's legal RAG evaluation context maps to AMC Score, Shield, and Watch through the existing metric-validity primitive. This does not justify a LexRAG adapter, legal RAG subsystem, Postgres/Elasticsearch importer, Airflow DAG runner, Grafana dashboard importer, Streamlit app, BERT evaluator, Hugging Face integration, or source-specific scoring path.

The product closure is a focused regression over the existing `buildMetricValidationReport` primitive. No source-specific implementation module changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through metric-validity receipts only; score semantics did not change. |
| Shield | Relevant because unsupported metric-validity claims fail closed before increasing assurance. |
| Watch | Relevant because retrieval, monitoring, feedback, and time-series context must bind to signed evidence and CI/Watch-style gates before affecting trust. |
| Enforce | No runtime policy changed. |
| Vault | No Hugging Face keys, legal documents, datasets, prompts, Docker configs, dashboards, or upstream artifacts stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | Legal-domain context only; no compliance mapping or legal claim changed. |

## Product closure

Added focused regression coverage showing LexRAG context is accepted only through existing AMC metric-validity receipts:

- Positive path: signed evidence refs, validation table, confidence interval, sample size, metric owner, construct-validity facets, process-evidence coverage, outcome alignment, replayable eval pack, source refs, and CI gate pass.
- Negative path: GitHub API, README, legal RAG, PostgreSQL, Elasticsearch, Airflow, Grafana, Streamlit, Hit Rate, MRR, BERT-score, topic, language, and repository metadata alone fails closed without signed metric-validity evidence.
- No-bloat path: source-specific identifiers stay out of metric-validity implementation modules.

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

Live GitHub API reachability, repository existence, `default_branch: main`, `stargazers_count: 21`, `watchers_count: 21`, `forks_count: 0`, `open_issues_count: 0`, `license: null`, topic labels, language labels, No releases, No tags, latest commit metadata, `readme.md sha fc65bda78052f5b6da59e4aed33f0ec380a44489`, file/folder names, RAG labels, legal-document labels, PostgreSQL labels, Elasticsearch labels, Airflow labels, Grafana labels, Streamlit labels, Hit Rate labels, Mean Reciprocal Rank labels, Google BERT Scores labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct validity, reliability checks, outcome alignment, regression thresholds, signed evidence refs, row hashes, replayable eval pack, and CI gate proof.

## No-bloat boundary

No LexRAG adapter, legal RAG subsystem, notebook runner, Docker Compose stack, PostgreSQL importer, Elasticsearch importer, Airflow DAG runner, Grafana dashboard importer, Streamlit interface, BERT evaluator, Hugging Face client, legal-document dataset importer, question example loader, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream notebooks, Python code, Docker Compose files, images, datasets, legal questions, prompts, API-key examples, Grafana dashboards, Airflow DAGs, Elasticsearch mappings, Streamlit UI code, README prose beyond minimal metadata facts, generated outputs, model responses, benchmark rows, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0935LexRagMetricValidityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist and because the test expected a row-level `fail_closed` status while the existing AMC metric-validity primitive correctly records report-level `failClosed=true`, CI failure, and unreplayable eval pack with row status `fail`.
- Focused regression after doc addition: `npx vitest run tests/gap0935LexRagMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0934TneSdkLiveDriftBoundary.test.ts tests/gap0935LexRagMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
