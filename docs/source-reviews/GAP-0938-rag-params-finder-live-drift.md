# GAP-0938 - rag-params-finder live-drift boundary

- Gap: `GAP-0938`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `neomatrix369/rag-params-finder`, `https://github.com/neomatrix369/rag-params-finder`
- Retrieval: `2026-06-22` via live GitHub API repository, contents, releases, tags, and languages metadata. Shell `git ls-remote` was blocked by DNS in this environment, so the primary-source review used GitHub API responses with an explicit User-Agent.
- Status: Done

## Live source metadata

GitHub API repository metadata: `full_name: neomatrix369/rag-params-finder`, `default_branch: main`, `stargazers_count: 12`, `forks_count: 4`, `open_issues_count: 16`, `license: MIT License`, `created_at: 2026-05-03T10:08:06Z`, `updated_at: 2026-05-29T15:50:30Z`, and `pushed_at: 2026-06-09T21:38:50Z`.

The repository description says it is a RAG parameter sweep experimentation tool for evaluating vector databases, embedding models, chunking strategies, and retrieval methods. Live topics included `chunking-strategies`, `embedding-models`, `evaluation`, `hyperparameter-tuning`, `no-agents`, `no-mcp`, `pre-evaluation`, `rag`, `rag-optimization`, `relevancy-score`, `retrieval-optimization`, `similarity-score`, `vector-search`, and `zero-llm`.

Top-level contents included `.env.example`, `.github`, `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `LICENSE`, `QUICKSTART.md`, `README.md`, `VERIFICATION_CHECKLIST.md`, `cli`, `configs`, `docker-compose.yml`, `docs`, `frontend`, `pyproject.toml`, `scripts`, `server`, `tests`, and `uv.lock`. Live language metadata listed Python, TypeScript, Shell, Dockerfile, JavaScript, HTML, and CSS.

Release metadata included `v0.11.0` `Weighted Averaging`, with `query_avg_score`, configurable tiebreaker behavior, tiebreaker explanation UI, detailed results with hyperparameter mapping, and sweep dimensions. Earlier release signals included `v0.10.0` `Unified retriever`, `v0.8.1` `Provider regression tests`, `Vector DB stats`, Voyage catalog expansion, local `sentence-transformers`, CrossEncoder reranking, and explicit provider routing.

Those facts are relevant to AMC only as external source-review context for Watch live score and behavior drift. They do not become live-drift proof by themselves.

No upstream Python, TypeScript, shell, Docker, frontend, server, CLI, configuration, README prose beyond minimal metadata facts, release notes beyond minimal metadata facts, benchmark data, retrieval results, generated outputs, model responses, examples, or implementation details were copied into AMC.

## Relevance decision

`GAP-0938` is relevant because RAG parameter sweeps can change retrieval quality, latency, cost, invalid-action behavior, and answer pass rates over time. That maps to AMC Score, Shield, and Watch through existing live score and behavior drift receipts.

The accepted AMC proof remains an AMC-owned baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, row hashes, source refs, Watch alert projection, and receipt verification. GitHub API metadata, repository topics, release labels, language metadata, or local backlog metadata can identify the reviewed source but cannot satisfy the evidence requirement.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score distribution drift over signed baseline and live rows. |
| Shield | Relevant because unsupported live-drift claims fail closed before increasing assurance. |
| Watch | Relevant through baseline distribution, live sample, drift statistic, alert receipt, receipt hash, and Watch alert projection. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, vector database settings, environment values, benchmark rows, retrieval outputs, or upstream artifacts stored. |
| Fleet | No fleet topology changed; RAG sweep context is workload evidence only. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing `rag-params-finder` context is handled by existing Watch live-drift primitives:

- Positive path: a signed baseline distribution and signed live sample produce drift statistics, an alert receipt, receipt hash, source refs, row hashes, and Watch alert projections.
- Negative path: metadata-only live rows without signed evidence refs fail closed and invalidate the receipt.
- No-bloat path: source-specific repository identifiers stay out of Score, Drift, and Watch implementation modules.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, public methodology, API, CLI, Studio, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

GitHub API repository reachability, `default_branch: main`, `stargazers_count: 12`, `forks_count: 4`, `open_issues_count: 16`, `MIT License`, created/updated/pushed timestamps, topics such as `chunking-strategies`, `embedding-models`, `hyperparameter-tuning`, `retrieval-optimization`, and `zero-llm`, file names, folder names, languages such as Python, TypeScript, Shell, and Dockerfile, release labels such as `v0.11.0`, `Weighted Averaging`, `query_avg_score`, `v0.10.0`, `Unified retriever`, `v0.8.1`, `Provider regression tests`, `Vector DB stats`, Voyage, `sentence-transformers`, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims.

Passing evidence requires AMC-owned baseline distribution, live sample rows, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No rag-params-finder adapter, vector database connector, embedder connector, retriever implementation, RAG optimization engine, parameter-sweep runner, release parser, provider registry, tiebreaker UI, benchmark importer, CrossEncoder reranker, Voyage integration, local embedding model integration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python, TypeScript, shell, Docker, frontend, server, CLI, configuration, README prose beyond minimal metadata facts, release notes beyond minimal metadata facts, benchmark data, retrieval results, generated outputs, model responses, examples, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0938RagParamsFinderLiveDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; live-drift positive, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0938RagParamsFinderLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0937RagTuneMetricValidityBoundary.test.ts tests/gap0938RagParamsFinderLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
