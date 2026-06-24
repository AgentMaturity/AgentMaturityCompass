# GAP-1057 — TRiSM control crosswalk boundary

- Gap: `GAP-1057`
- Dimension: `gov-control-crosswalk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems`
- Retrieval: OpenAlex API, Crossref API, DOI redirect headers, ScienceDirect headers, and local backlog metadata, 2026-06-25
- Status: Done

## Relevance decision

The TRiSM review is relevant to AMC because the backlog row asks for control crosswalk coverage across governance, risk, compliance, and audit. AMC already has compliance mappings for NIST AI RMF, ISO 42001, EU AI Act, SOC 2, GDPR, and sector frameworks such as HIPAA, SOX, FedRAMP, and PCI DSS. The gap is not a new TRiSM compliance framework; it is a need to make existing AMC control mappings exportable as source-cited, owner-bound, evidence-linked crosswalk receipts.

The implemented closure is generic. `src/compliance/controlCrosswalk.ts` builds and verifies auditor-ready control crosswalk receipts over existing AMC mappings. Each row carries a framework clause, AMC question IDs, evidence type list, owner, exception state, source citation IDs, signed evidence-chain refs, and row hash. Non-`none` exceptions must include signed exception proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only. Crosswalk rows preserve AMC question IDs and evidence types, but scoring semantics are unchanged. |
| Shield | Indirect only. Security and risk controls can appear in mappings, but no Shield detector changed. |
| Enforce | Out of scope. No runtime policy, approval, or circuit breaker changed. |
| Vault | Relevant because source citations, signed exception refs, owner accountability, and evidence-chain hashes support secure audit evidence handling. |
| Watch | Out of scope. No live drift or monitoring alert behavior changed. |
| Fleet | Out of scope. No multi-agent topology or fleet orchestration changed. |
| Passport | Relevant because crosswalk receipts are portable proof bundles over framework clauses, owners, exceptions, and evidence chains. |
| Comply | Primary surface. Existing mappings now have a generic control crosswalk receipt path that fails closed on missing citations, owners, signed exceptions, or evidence lineage. |

## Product closure

Implemented a generic AMC control-crosswalk receipt:

- `src/compliance/controlCrosswalk.ts`
- public exports from `src/index.ts`
- `docs/COMPLIANCE_FRAMEWORKS.md` control crosswalk receipt section
- `tests/gap1057TrismControlCrosswalkBoundary.test.ts`

Live source facts verified:

- OpenAlex page: https://openalex.org/W7133236347
- OpenAlex API: https://api.openalex.org/works/W7133236347
- DOI: https://doi.org/10.1016/j.aiopen.2026.02.006
- Crossref API: https://api.crossref.org/works/10.1016/j.aiopen.2026.02.006
- DOI redirect target: https://linkinghub.elsevier.com/retrieve/pii/S2666651026000069
- ScienceDirect page checked by headers: https://www.sciencedirect.com/science/article/pii/S2666651026000064
- Title: TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems
- Source/journal: AI Open
- Publisher: Elsevier BV
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-01-01`
- Crossref type: journal-article
- OpenAlex OA status: gold
- OpenAlex primary-location license: cc-by-nc-nd
- Crossref license includes Creative Commons BY-NC-ND 4.0 for version-of-record use starting 2026-02-27.
- Authorship/institution metadata includes Vector Institute, Cornell University, and University of Groningen.
- DOI headers resolved to Elsevier linking-hub PII `S2666651026000069`; ScienceDirect direct page headers returned a Cloudflare `403`, so source verification used OpenAlex/Crossref/DOI metadata rather than scraped article content.

## Fail-closed rule

Control crosswalk coverage fails closed when:

- source citations are missing,
- a row lacks a framework clause,
- a row lacks AMC question IDs,
- a row lacks evidence types,
- a row lacks an accountable owner,
- a row lacks evidence lineage,
- an evidence hash or signed evidence ref is invalid,
- a non-`none` exception lacks signed exception evidence, or
- row or receipt hashes do not verify.

Paper metadata, an OpenAlex title, a DOI, a framework name, a local owner label, a self-reported exception, or a manually written control table cannot prove control crosswalk coverage without the generic signed receipt.

## No-bloat boundary

AMC did not add a TRiSM-specific framework, paper importer, DOI parser, ScienceDirect scraper, OpenAlex adapter, article mirror, taxonomy mirror, legal-certification claim, source-specific compliance module, copied paper prose, copied abstract, copied tables, copied figures, copied framework language, copied mappings, copied prompts, copied datasets, or copied article content.

The product change is a reusable compliance primitive over existing AMC mappings.

## Verification

- `npx vitest run tests/gap1057TrismControlCrosswalkBoundary.test.ts --reporter=dot` first failed as expected when `src/compliance/controlCrosswalk.ts` did not exist.
- After adding the generic module and docs, `npx vitest run tests/gap1057TrismControlCrosswalkBoundary.test.ts --reporter=dot` failed only while this source-review note was missing: 1 failing doc-read test, 3 passing crosswalk/no-bloat tests.
- `npx vitest run tests/gap1057TrismControlCrosswalkBoundary.test.ts --reporter=dot` passed: 1 file / 4 tests.
- `npx vitest run tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed: 4 files / 19 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/compliance/controlCrosswalk.ts`, `src/compliance/builtInMappings.ts`, `src/compliance/complianceEngine.ts`, and `src/compliance/complianceReport.ts` found no TRiSM source identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed: 904 files / 7,599 tests.
