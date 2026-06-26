# GAP-1091 - Production evaluation reviewer independence

- Gap: `GAP-1091`
- Dimension: Reviewer independence proof
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7163809507`, OpenAlex API `https://api.openalex.org/works/W7163809507`, DOI `https://doi.org/10.5281/zenodo.20583928`, Zenodo DOI page `https://zenodo.org/doi/10.5281/zenodo.20583928`, Zenodo record `https://zenodo.org/records/20583928`, Zenodo API `https://zenodo.org/api/records/20583928`, and Crossref boundary `https://api.crossref.org/works/10.5281/zenodo.20583928`
- Retrieval: Live OpenAlex, DOI, Zenodo, and Crossref boundary checks on `2026-06-25T17:20:00.000Z`
- Status: Done

## Relevance decision

`Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"` is relevant to AMC only as governance and audit-readiness context for production-agent evaluation approvals. The source is a dataset/replication package with concepts including systematic review, data extraction, audit, software quality, metadata, data quality, software engineering, data collection, and quality assurance. That context supports the need for reviewer metadata, role separation, conflict flags, second-review requirements, approval receipt, and evidence lineage.

The source does not justify a Zenodo importer, replication-package importer, systematic-review parser, dataset mirror, file downloader, reviewer workflow clone, source-specific review workflow, source-specific route, source-specific CLI command, public methodology bump, or copied package content. GAP-1091 maps to AMC's existing generic reviewer-independence receipt.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7163809507`
- OpenAlex API: `https://api.openalex.org/works/W7163809507`
- DOI: `https://doi.org/10.5281/zenodo.20583928`
- Zenodo DOI page: `https://zenodo.org/doi/10.5281/zenodo.20583928`
- Zenodo record: `https://zenodo.org/records/20583928`
- Zenodo API: `https://zenodo.org/api/records/20583928`
- Crossref boundary: `https://api.crossref.org/works/10.5281/zenodo.20583928`
- Title: `Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-06-07`
- OpenAlex type `dataset`
- Source: `Zenodo (CERN European Organization for Nuclear Research)`
- OpenAlex primary-location license `cc-by`
- OpenAlex open access status: `green`
- OpenAlex authors count `5`
- Zenodo record `20583928`
- Zenodo concept DOI `10.5281/zenodo.20583927`
- Zenodo DOI `10.5281/zenodo.20583928`
- Zenodo resource type `Dataset`
- Zenodo files count `1`
- Zenodo license `cc-by-4.0`
- Zenodo creators include Carlos Chinchilla Corbacho, Daniel Hernández de la Iglesia, André Sales Mendes, Diego M. Jiménez-Bravo, and Alfonso José López-Rivero.
- OpenAlex concepts include `Computer science`, `Information retrieval`, `Systematic review`, `Replication (statistics)`, `Data mining`, `Quality (philosophy)`, `Data extraction`, `Audit`, `Software quality`, `Metadata`, `Data quality`, `Software engineering`, `Data collection`, and `Quality assurance`.
- Zenodo keywords include `LLM-based agents`, `software testing`, `evaluation`, `multi-agent systems`, `quality assurance`, `systematic literature review`, and `PRISMA 2020`.
- DOI returned HTTP/2 `302` to `https://zenodo.org/doi/10.5281/zenodo.20583928`.
- Zenodo DOI page returned HTTP/1.1 `302` to `https://zenodo.org/records/20583928`.
- Zenodo record returned HTTP/1.1 `200`.
- Crossref returned HTTP/2 `404` with body `Resource not found.`
- OpenAlex API first 200 KB SHA-256 `2e86573e5a5efb21b8b72529a5d8478c5434d987ec5f18b72fd14f4c18280737`
- Zenodo API first 200 KB SHA-256 `750828e6cd90c3a6cf41d67e301ede1a8903e97b24e33fa2001eeea2e39e503f`
- Zenodo record first 200 KB SHA-256 `b70ea004d90ef157fcb3de4b96f2f20f3d4bc88cd35557fe71050c5e05f5c754`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Reviewer-independence proof can support score evidence when high-risk evaluation approvals are cited. |
| Shield | Adjacent only. Safety or red-team approval claims still need signed reviewer separation and evidence lineage. |
| Enforce | Adjacent only. This gap closes pre-approval independence proof rather than runtime enforcement. |
| Vault | Relevant because valid proof records signed evidence refs and hashes without embedding review payloads, package files, or upstream datasets. |
| Watch | Adjacent only. Review outcomes can feed monitoring and recheck cadence, but no Watch monitor changed. |
| Fleet | Relevant when high-risk production-agent evaluation approvals affect fleet rollout. No Fleet runtime changed. |
| Passport | Relevant because the audit export preserves portable reviewer-independence proof and receipt hashes. |
| Comply | Relevant because high-risk governance approvals need role separation, conflict checks, second review, approval receipts, owners, and evidence lineage. |

## Product closure

No product code changed. Existing `src/audit/reviewerIndependence.ts` primitives already satisfy this gap:

- `buildReviewerIndependenceReceipt`
- `verifyReviewerIndependenceReceipt`
- `renderReviewerIndependenceAuditExport`

The receipt records approval metadata, requester and reviewer identities, org units, separation rule, conflict flags, second-review requirements, approval receipt refs, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash. It fails closed when reviewer metadata, role separation, conflict check, second review for high-risk approvals, approval receipt, source citation, or evidence lineage is missing.

`tests/gap1091ProductionEvaluationReviewerIndependenceBoundary.test.ts` proves this existing primitive accepts source-cited production-agent evaluation approval context and fails closed when replication-package metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage.

## Fail-closed rule

metadata-only replication package evidence must fail closed. Dataset title, OpenAlex concepts, Zenodo record metadata, Zenodo creator names, DOI redirects, Crossref absence, file counts, license labels, keywords, local backlog text, source category labels, or page hashes cannot satisfy reviewer independence proof.

A valid reviewer-independence claim requires reviewer metadata, requester metadata, role separation rule, conflict check, conflict flags, signed conflict-check evidence, second-review requirements for high-risk approvals, approval receipt, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No Zenodo importer, replication-package importer, systematic-review parser, dataset mirror, file downloader, production-evaluation clone, reviewer workflow clone, source-specific review workflow, source-specific API route, source-specific CLI command, public methodology bump, Crossref adapter, DOI adapter, OpenAlex adapter, or copied package content was added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1091ProductionEvaluationReviewerIndependenceBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1091-production-evaluation-reviewer-independence.md` did not exist; 3 reviewer-independence/no-bloat tests passed.
- Live source checks:
  - `curl -L --max-time 20 -s https://api.openalex.org/works/W7163809507` returned OpenAlex metadata recorded above.
  - `curl -I -L --max-time 20 -s https://doi.org/10.5281/zenodo.20583928` returned DOI/Zenodo redirect metadata recorded above.
  - `curl -L --max-time 20 -s https://zenodo.org/api/records/20583928` returned Zenodo API metadata recorded above.
  - `curl -I -L --max-time 20 -s https://api.crossref.org/works/10.5281/zenodo.20583928` returned HTTP/2 `404`.
  - OpenAlex API, Zenodo API, and Zenodo record first-200KB hashes are recorded above.
- Focused test: `npx vitest run tests/gap1091ProductionEvaluationReviewerIndependenceBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired reviewer-independence regression: `npx vitest run tests/gap1091ProductionEvaluationReviewerIndependenceBoundary.test.ts tests/gap1086AiIndustryReviewerIndependenceBoundary.test.ts tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts --reporter=dot` passed, 5 files / 21 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,003 files / 8,026 tests.
- Linear: `AMC-1428`.
