# GAP-0828 - legal-document-assistant live-drift boundary

- Gap: `GAP-0828`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `lixx21/legal-document-assistant`, `https://github.com/lixx21/legal-document-assistant`
- Retrieval: `2026-06-21` via live GitHub header and GitHub connector file probes. Repository URL returned HTTP/2 200. README.md lookup returned 404. LICENSE lookup returned 404. Common `main` and `master` README paths also returned 404. GitHub page body grep returned no matching source details in this shell.
- Status: closed through existing Watch live score and behavior drift receipts; no legal-document-assistant adapter, legal RAG workflow, database importer, monitoring integration, or source-specific monitor added.

## Live source metadata

The repository URL is live, but primary source content was not available through the GitHub contents API in this environment. The legal RAG description is therefore local backlog metadata only: Retrieval-Augmented Generation, PostgreSQL, Elasticsearch, Grafana, Streamlit, data ingestion, legal-document querying, summaries, and suggestions. These labels are useful relevance hints but cannot be treated as verified source evidence.

No upstream README prose, notebook code, ingestion pipeline, database schema, Elasticsearch config, Grafana dashboard, Streamlit UI, prompts, legal documents, examples, screenshots, generated outputs, or repository files were copied into AMC.

## Relevance decision

This source is relevant to AMC only as a generic live-drift context: legal-document RAG systems can degrade after traffic, provider, prompt, retrieval-index, data-ingestion, monitoring, or document changes. Because README/LICENSE/source files were unavailable, GAP-0828 must not create source-specific product behavior or claim parity with the repository.

The only acceptable AMC closure is through existing live score and behavior drift receipts: baseline distribution, live sample, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof. Repository reachability and local backlog metadata alone fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions tied to signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed legal-RAG behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime legal policy, retrieval policy, database policy, or circuit breaker changed. |
| Vault | No legal documents, prompts, database records, or secure-storage behavior changed. |
| Fleet | RAG workflow context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Legal-domain context only; no compliance framework mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, legal-document-assistant adapter, legal RAG workflow, PostgreSQL integration, Elasticsearch integration, Grafana integration, Streamlit UI, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0828.

The focused regression exercises the existing Watch live-drift engine with legal-RAG-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when repository/backlog metadata replaces signed live-drift evidence.

## Fail-closed rule

Repository URL, GitHub HTTP/2 200 reachability, unavailable README/LICENSE probes, local backlog metadata only, Retrieval-Augmented Generation label, PostgreSQL label, Elasticsearch label, Grafana label, Streamlit label, legal-document label, data-ingestion label, summaries label, suggestions label, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distribution, live sample rows, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No legal-document-assistant adapter, legal RAG workflow, PostgreSQL importer, Elasticsearch importer, Grafana dashboard importer, Streamlit UI, notebook runner, repository importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream README prose, notebook code, ingestion pipeline, database schema, Elasticsearch config, Grafana dashboard, Streamlit UI, prompts, legal documents, examples, screenshots, generated outputs, or repository files were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0828LegalDocumentAssistantLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
