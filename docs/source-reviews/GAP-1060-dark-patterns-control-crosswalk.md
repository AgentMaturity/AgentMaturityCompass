# GAP-1060 - Dark patterns control crosswalk boundary

- Gap: `GAP-1060`
- Dimension: `gov-control-crosswalk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `The Siren Song of LLMs: How Users Perceive and Respond to Dark Patterns in Large Language Models`
- Retrieval: live OpenAlex, Crossref, DOI, and ACM redirect checks on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Control crosswalk coverage

## Relevance decision

GAP-1060 is relevant to AMC as governance and compliance control-crosswalk context. LLM dark patterns can affect transparency, fairness, human oversight, and privacy obligations, so the source maps to existing Comply/Passport/Vault evidence paths.

No new product code is required because GAP-1057 already added the generic `buildControlCrosswalkReceipt` primitive. This gap is closed by proving that dark-patterns context uses that existing receipt with source citations, framework clause, AMC question IDs, evidence type, owner, exception state, signed exception proof, and evidence lineage. Paper metadata alone fails closed.

Reviewed source facts:

- OpenAlex: `https://openalex.org/W4415250053`
- OpenAlex API: `https://api.openalex.org/works/W4415250053`
- DOI: `https://doi.org/10.1145/3772318.3791149`
- Crossref API: `https://api.crossref.org/works/10.1145/3772318.3791149`
- ACM DOI page: `https://dl.acm.org/doi/10.1145/3772318.3791149`
- Title: `The Siren Song of LLMs: How Users Perceive and Respond to Dark Patterns in Large Language Models`
- OpenAlex publication_year `2026`, publication_date `2026-04-13`, type `article`, OA status `gold`, license `cc-by`
- Crossref status `ok`, type `proceedings-article`, publisher `ACM`, container `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`
- Authors include `Yike Shi`, `Qing Xiao`, `Qing Hu`, `Hong Shen`, and `Hua Shen`
- OpenAlex/Crossref affiliations include `Carnegie Mellon University` and `New York University Shanghai`
- DOI HEAD returned HTTP/2 `302` to `https://dl.acm.org/doi/10.1145/3772318.3791149`; ACM page HEAD returned HTTP/2 `403` with a Cloudflare challenge, so no ACM page prose was used.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. |
| Shield | Dark-patterns context is safety-adjacent, but no Shield detector changed. |
| Enforce | No runtime guardrail, policy engine, or intervention subsystem changed. |
| Vault | Relevant where dark-patterns controls intersect privacy/data-boundary obligations. |
| Watch | No live monitoring or drift alert changed. |
| Fleet | No fleet topology or multi-agent orchestration changed. |
| Passport | Relevant because control-crosswalk receipts can travel in Passport proof bundles. |
| Comply | Primary surface. Existing control-crosswalk receipts map source-backed obligations to framework clauses, AMC questions, evidence types, owners, exception state, and evidence chain. |

## Product closure

No product module changed. GAP-1060 is covered by the existing generic control-crosswalk primitive:

- `buildControlCrosswalkReceipt`
- `verifyControlCrosswalkReceipt`
- `renderControlCrosswalkAuditExport`

Added focused regression coverage in `tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts` and this source-review note. The positive fixture uses existing mappings for NIST Govern, EU AI Act Art. 13 Transparency, EU AI Act Art. 14 Human Oversight, GDPR Art. 5 Lawfulness Fairness Transparency, and SOC 2 Privacy. The negative fixture fails closed when dark-patterns metadata replaces signed crosswalk evidence.

## Fail-closed rule

The control-crosswalk receipt fails closed when source citations are missing, a row lacks an owner, a row lacks evidence lineage, or a non-`none` exception has no signed evidence reference and signature hash.

Metadata-only evidence fails closed. DOI, OpenAlex, Crossref, ACM redirects, article title, CHI/ACM venue labels, dark-patterns labels, source concepts, local backlog metadata, or paper identity cannot satisfy control-crosswalk proof without AMC-owned source citations, framework clause, AMC question IDs, evidence types, owner, signed exception workflow, and signed evidence refs.

## No-bloat boundary

No dark-patterns detector, UX persuasion subsystem, ACM importer, OpenAlex adapter, Crossref adapter, paper parser, benchmark mirror, dataset import, prompt import, legal-certification claim, methodology version bump, API route, CLI command, or source-specific control mapping was added.

No upstream paper prose, tables, figures, prompts, survey materials, participant data, datasets, screenshots, examples, or generated outputs were copied.

## Verification

Commands run:

- `curl -sSL https://api.openalex.org/works/W4415250053 | jq ...` - passed
- `curl -sSL https://api.crossref.org/works/10.1145/3772318.3791149 | jq ...` - passed
- `curl -sSIL https://doi.org/10.1145/3772318.3791149` - passed
- `npx vitest run tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts --reporter=dot` - expected red on missing source-review doc and a mapping-label mismatch; existing product primitive otherwise worked
- `npx vitest run tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 5 files / 23 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic control-crosswalk, compliance mapping, scoring, and compliance-doc files returned no GAP-1060 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 907 files / 7,611 tests

Final verification is recorded in the progress ledger for the committed slice.
