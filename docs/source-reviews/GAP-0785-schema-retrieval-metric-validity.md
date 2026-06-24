# GAP-0785 - Schema retrieval metric-validity boundary

- Gap: `GAP-0785`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.mdpi.com/2076-3417/16/2/586`, `https://doi.org/10.3390/app16020586`, `https://openalex.org/W7118421099`
- Retrieval: `2026-06-21` via live MDPI page review; shell network remains restricted in this environment.
- Status: closed through existing metric-validity receipts; no schema-retrieval system, Text-to-SQL pipeline, or vector-store adapter added.

## Live source metadata

The live MDPI page identifies the source as `Schema Retrieval with Embeddings and Vector Stores Using Retrieval-Augmented Generation and LLM-Based SQL Query Generation`, DOI `10.3390/app16020586`, in `Applied Sciences` `16(2), 586`, with article lifecycle metadata including `6 January 2026`. Listed authors include Mehmet Bozdemir and Metin Bilgin. The source appears in the Special Issue `AI-Based Data Science and Database Systems`.

Relevant source-review signals include schema retrieval, embeddings and vector stores, retrieval-augmented generation, LLM-based SQL query generation, hierarchical clustering, iterative repair mechanism, hybrid query strategy, Turkish + English query context, `15 databases`, `1006 queries`, schema retrieval F1 score from 0.79 to 0.88, GPT-4o, execution accuracy, 0.70 to 0.78, and an `11% improvement` claim. These facts are relevant to AMC as metric validity and reliability context only. No upstream article prose beyond minimal metadata facts, SQL queries, schema files, datasets, prompts, benchmark rows, figures, tables, statistics, model outputs, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0785 is relevant to AMC through existing metric validity and reliability checks because Text-to-SQL and schema-retrieval benchmark claims can look operationally strong while lacking validated measurement proof. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this MDPI article can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. MDPI/DOI/OpenAlex/title metadata, benchmark names, reported F1, or execution-accuracy labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported schema-retrieval, RAG, SQL-generation, vector-store, or benchmark claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Agent-evaluation context only; no orchestration adapter or topology changed. |
| Enforce | No runtime SQL-generation, schema-selection, or query-safety policy changed. |
| Vault | No schemas, SQL queries, benchmark data, prompts, outputs, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or SQL evaluation credential changed. |
| Comply | Data/database context only; no compliance mapping changed. |

## Product closure

GAP-0785 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that schema-retrieval/Text-to-SQL context can be cited only with AMC-owned validation evidence. The negative path proves MDPI/DOI/OpenAlex/title metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, schema-retrieval implementation, embedding pipeline, vector-store adapter, Text-to-SQL generator, SQL benchmark runner, database schema importer, methodology version, or scoring behavior changed for GAP-0785.

## Fail-closed rule

MDPI URL, DOI, OpenAlex work ID, title, author list, journal metadata, special-issue metadata, article lifecycle dates, schema-retrieval labels, embeddings labels, vector-store labels, RAG labels, SQL-generation labels, hierarchical-clustering labels, iterative-repair labels, hybrid-query labels, Turkish + English labels, database/query-count labels, reported F1 labels, GPT-4o labels, execution-accuracy labels, reported improvement labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No schema-retrieval implementation, embedding pipeline, vector-store adapter, RAG pipeline, Text-to-SQL generator, SQL execution harness, iterative-repair module, hybrid-query strategy module, MDPI importer, OpenAlex importer, DOI resolver, benchmark runner, database schema importer, dataset mirror, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose beyond minimal metadata facts, SQL queries, schema files, datasets, prompts, benchmark rows, figures, tables, statistics, model outputs, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0785SchemaRetrievalMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
