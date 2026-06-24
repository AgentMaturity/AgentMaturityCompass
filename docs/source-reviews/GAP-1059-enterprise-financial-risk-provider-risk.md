# GAP-1059 - Enterprise financial risk third-party provider risk

- Gap: `GAP-1059`
- Dimension: `gov-third-party-risk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `A Comprehensive Survey on Enterprise Financial Risk Analysis from Big Data and LLMs Perspective`
- Retrieval: live OpenAlex, DOI, Crossref, Springer redirect, and arXiv PDF header checks on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Third-party agent and provider risk

## Relevance decision

GAP-1059 is relevant to AMC because third-party agents, model providers, hosted tools, data providers, and infrastructure providers can create hidden governance, privacy, contractual, and assurance risks. The source is a finance-risk survey context signal, not an AMC financial-risk subsystem requirement.

AMC closure is a generic third-party provider-risk receipt that captures provider record, attestation, data boundary, contractual control, review date, signed exception workflow, source citations, and evidence lineage. Metadata-only source evidence fails closed.

Reviewed source facts:

- OpenAlex: `https://openalex.org/W4310419549`
- OpenAlex API: `https://api.openalex.org/works/W4310419549`
- DOI: `https://doi.org/10.1007/978-981-92-1468-6_7`
- Crossref API: `https://api.crossref.org/works/10.1007/978-981-92-1468-6_7`
- Springer landing page: `https://link.springer.com/chapter/10.1007/978-981-92-1468-6_7`
- arXiv PDF: `https://arxiv.org/pdf/2211.14997`
- Title: `A Comprehensive Survey on Enterprise Financial Risk Analysis from Big Data and LLMs Perspective`
- OpenAlex publication_year `2026`, publication_date `2026-01-01`, type `preprint`, OA status `green`, OA URL `https://arxiv.org/pdf/2211.14997`, source `Lecture notes in computer science`, host organization `Springer Science+Business Media`
- Crossref status `ok`, type `book-chapter`, publisher `Springer Nature Singapore`, container titles `Lecture Notes in Computer Science` and `Advances in Knowledge Discovery and Data Mining`
- Crossref ISBNs `9789819214679` and `9789819214686`
- DOI HEAD returned HTTP/2 `302` to `https://link.springer.com/10.1007/978-981-92-1468-6_7`, then HTTP/2 `301` to the Springer chapter URL, then a cookie-gated Springer auth redirect.
- arXiv PDF HEAD returned HTTP/2 `200`, content type `application/pdf`, filename `2211.14997v5.pdf`, and ETag `sha256:665dca2ddc0e4c248cd1e87e74fa4a11c9e7f998e49170a36ef4daa7bf8ab92d`.
- `export.arxiv.org` metadata query did not return promptly and was stopped; no arXiv API facts are used for product claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology change. Provider-risk proof is compliance evidence, not a score recalibration. |
| Shield | Indirectly relevant to external provider risk but no Shield detector changed. |
| Enforce | No runtime policy enforcement, circuit breaker, or vendor gateway changed. |
| Vault | Relevant because provider data boundaries, data classes, regions, subprocessors, and retention affect sensitive data posture. |
| Watch | No live drift, monitoring, or alert surface changed. |
| Fleet | No orchestration or trust topology changed. |
| Passport | Relevant because provider-risk receipts can be included in portable trust proof bundles. |
| Comply | Primary surface. Adds auditor-ready provider record, attestation, data boundary, contractual controls, review date, signed exceptions, and evidence-chain hashes. |

## Product closure

Added a generic compliance primitive in `src/compliance/providerRisk.ts`:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

The receipt accepts AMC-owned provider evidence and source citations, computes data-boundary, contractual-control, attestation, row, and receipt hashes, and fails closed when provider-risk proof is incomplete. `src/index.ts` exports the primitive, and `docs/COMPLIANCE_FRAMEWORKS.md` documents third-party provider risk receipts.

## Fail-closed rule

The receipt fails closed when any of these are missing or invalid:

- source citations
- provider record, provider name, or provider type
- owner
- review date
- allowed use cases
- signed attestations
- signed data boundary evidence
- signed contractual controls
- signed exception workflow
- signed evidence refs and SHA-256 event hashes
- row or receipt hashes

Metadata-only evidence fails closed. A DOI, OpenAlex record, Crossref record, Springer landing page, arXiv PDF header, paper title, vendor name, website copy, or unsigned questionnaire cannot satisfy third-party provider risk proof.

## No-bloat boundary

No source-specific subsystem was added. AMC did not add a financial-risk subsystem, Springer importer, arXiv importer, OpenAlex adapter, Crossref adapter, survey parser, provider integration, legal certification claim, copied paper prose, copied PDF text, copied tables, copied datasets, copied benchmark rows, copied prompts, copied figures, copied examples, or generated upstream outputs.

The product change is intentionally generic: third-party provider-risk receipts over existing AMC compliance/passport/vault evidence.

## Verification

Commands run:

- `curl -sSL https://api.openalex.org/works/W4310419549 | jq ...` - passed
- `curl -sSIL https://doi.org/10.1007/978-981-92-1468-6_7` - passed
- `curl -sSL https://api.crossref.org/works/10.1007/978-981-92-1468-6_7 | jq ...` - passed
- `curl -sSIL https://arxiv.org/pdf/2211.14997` - passed
- `curl -sSL 'https://export.arxiv.org/api/query?id_list=2211.14997'` - stopped after no prompt response; not relied on for product claims
- `npx vitest run tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts --reporter=dot` - expected red on missing module; after generic implementation, expected red on missing source-review doc and missing contract ID in audit export
- `npx vitest run tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/dataResidency.test.ts tests/trustInterchange.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 5 files / 74 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic compliance, passport, and trust implementation files returned no GAP-1059 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 906 files / 7,607 tests

Final verification is recorded in the progress ledger for the committed slice.
