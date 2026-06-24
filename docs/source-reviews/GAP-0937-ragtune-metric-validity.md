# GAP-0937 - RagTune metric-validity boundary

- Gap: `GAP-0937`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `metawake/ragtune`, `https://github.com/metawake/ragtune`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 12, Fork 1, Issues 0, Pull requests 0, 21 Commits, README.md, MIT license, folders `.github`, `assets`, `benchmarks`, `cmd/ ragtune`, `data`, `docs`, `examples`, `internal`, `runs/ needle-experiment`, and `scripts`, files `.gitignore`, `.goreleaser.yaml`, `LICENSE`, `Makefile`, `README.md`, `demo.tape`, `go.mod`, `go.sum`, `install.sh`, `report.md`, and `run-benchmark.sh`, Releases 4, latest `v0.4.0` on Feb 25, 2026, Packages 0, Go 84.8%, Python 12.5%, Shell 2.4%, and Makefile 0.3%.
- Status: Done

## Live source metadata

The live README title is `RagTune`. It describes EXPLAIN ANALYZE for production RAG retrieval and positions the tool for debugging, benchmarking, and monitoring RAG retrieval layers. Relevant source-review signals include confidence intervals, CI/CD quality gates, fail-on-regression baseline comparison, compare embedders, external chunkers, Recall@5, MRR, Coverage, Latency p95, NeedleCoverage@K, simulate, explain, audit, report, import-queries, pgvector, Qdrant, Weaviate, Chroma, Pinecone, Ollama, OpenAI, Voyage, Cohere, TEI, included benchmarks, HotpotQA, CaseHOLD, synthetic-50k, CI mode, and deterministic retrieval benchmarks.

Those facts are relevant to AMC only through existing metric-validity receipts. Retrieval metrics and CI regression gates can help shape fixtures, but Score, Shield, or Watch may accept a metric-validity claim only with an AMC-owned validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, replayable eval pack, and CI gate proof.

No upstream Go code, Python code, shell scripts, benchmark data, run artifacts, demo tapes, CLI commands, reports, examples, query rows, needles, chunk files, vector-store configs, embedder configs, README prose beyond minimal metadata facts, generated outputs, model responses, or implementation details were copied into AMC.

## Relevance decision

`GAP-0937` is relevant because RagTune's retrieval evaluation, confidence interval, CI gate, regression, and benchmark context maps to AMC Score, Shield, and Watch through the existing metric-validity primitive. This does not justify a RagTune adapter, Go CLI integration, vector-store connector, benchmark importer, report parser, explain/simulate runner, CI workflow generator, or source-specific scoring path.

The product closure is a focused regression over the existing `buildMetricValidationReport` primitive. No source-specific implementation module changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through metric-validity receipts only; score semantics did not change. |
| Shield | Relevant because unsupported metric-validity claims fail closed before increasing assurance. |
| Watch | Relevant because retrieval/CI/regression context must bind to signed evidence and CI/Watch-style gates before affecting trust. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, vector-store URLs, benchmark rows, query rows, reports, or upstream artifacts stored. |
| Fleet | No fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing RagTune context is accepted only through existing AMC metric-validity receipts:

- Positive path: signed evidence refs, validation table, confidence interval, sample size, metric owner, construct-validity facets, process-evidence coverage, outcome alignment, replayable eval pack, source refs, and CI gate pass.
- Negative path: GitHub/README/RAG retrieval, confidence intervals, CI/CD quality gates, fail-on-regression, Recall@5, MRR, Coverage, Latency p95, NeedleCoverage@K, vector-store, embedder, benchmark, topic, language, and repository metadata alone fails closed without signed metric-validity evidence.
- No-bloat path: source-specific identifiers stay out of metric-validity implementation modules.

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 12, Fork 1, Issues 0, Pull requests 0, 21 Commits, MIT license metadata, folder names, file names, Releases 4, `v0.4.0`, Feb 25, 2026 release metadata, Packages 0, Go 84.8%, Python 12.5%, Shell 2.4%, Makefile 0.3%, EXPLAIN ANALYZE labels, confidence intervals labels, CI/CD quality gates labels, fail-on-regression labels, Recall@5 labels, MRR labels, Coverage labels, Latency p95 labels, NeedleCoverage@K labels, vector-store labels, embedder labels, benchmark labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table, confidence interval, sample size, metric owner, construct validity, reliability checks, outcome alignment, regression thresholds, signed evidence refs, row hashes, replayable eval pack, and CI gate proof.

## No-bloat boundary

No RagTune adapter, Go CLI integration, vector-store connector, Qdrant/pgvector/Weaviate/Chroma/Pinecone integration, embedder connector, benchmark importer, report parser, explain runner, simulate runner, audit runner, CI workflow generator, comparison runner, needle evaluator, chunker integration, run artifact importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Go code, Python code, shell scripts, benchmark data, run artifacts, demo tapes, CLI commands, reports, examples, query rows, needles, chunk files, vector-store configs, embedder configs, README prose beyond minimal metadata facts, generated outputs, model responses, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0937RagTuneMetricValidityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; metric-validity positive, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0937RagTuneMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0936Wmb100kProviderDriftBoundary.test.ts tests/gap0937RagTuneMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
