# GAP-1062 - Flood-warning control-crosswalk boundary

- Gap: `GAP-1062`
- Dimension: `gov-control-crosswalk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `A Context-Aware Flood Warning Framework Integrating Ensemble Learning and LLMs`
- Retrieval: live OpenAlex API, Crossref API, DOI redirect, MDPI article headers, and MDPI PDF headers on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Control crosswalk coverage

## Relevance decision

GAP-1062 is relevant to AMC only as governance and control-crosswalk context. A flood-warning paper can illustrate high-stakes AI oversight, robustness, monitoring, availability, and continuity obligations, but AMC is not a flood-warning, smart-city, disaster-management, GIS, ensemble-learning, or emergency-response product.

No new product code is required because GAP-1057 already added the generic `buildControlCrosswalkReceipt` primitive. This gap is closed by proving that flood-warning context uses the existing receipt with source citations, framework clause, AMC question IDs, evidence type, owner, exception state, signed exception proof, and evidence lineage. Paper metadata alone fails closed.

Reviewed source facts:

- OpenAlex: `https://openalex.org/W7134903684`
- OpenAlex API: `https://api.openalex.org/works/W7134903684`
- DOI: `https://doi.org/10.3390/geohazards7010035`
- Crossref API: `https://api.crossref.org/works/10.3390/geohazards7010035`
- MDPI article page: `https://www.mdpi.com/2624-795X/7/1/35`
- MDPI PDF endpoint: `https://www.mdpi.com/2624-795X/7/1/35/pdf`
- Title: `A Context-Aware Flood Warning Framework Integrating Ensemble Learning and LLMs`
- OpenAlex publication_year `2026`, publication_date `2026-03-11`, type `article`, OA status `gold`, OA PDF URL `https://www.mdpi.com/2624-795X/7/1/35/pdf?version=1773202881`, source `GeoHazards`, host organization `Multidisciplinary Digital Publishing Institute`, license `cc-by`
- Crossref status `ok`, type `journal-article`, publisher `MDPI AG`, container `GeoHazards`, published and created date `2026-03-11`
- Crossref license URL includes `https://creativecommons.org/licenses/by/4.0/` for the version of record.
- Authors include `Adnan Ahmed Abi Sen`, `Fares Hamad Aljohani`, `Nour Mahmoud Bahbouh`, `Adel Ben Mnaouer`, `Omar Tayan`, and `Ahmad. B. Alkhodre`
- OpenAlex institution metadata includes `Islamic University of Madinah`, `Northern Border University`, and `Universidad de Granada`
- DOI HEAD returned HTTP/2 `302` to the MDPI article page. Direct MDPI article and PDF HEAD checks returned HTTP/2 `403`, so no MDPI page or PDF prose was used.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only. Control rows preserve AMC question IDs and evidence types, but scoring semantics do not change. |
| Shield | Indirect only. Robustness and safety controls can appear in mappings, but no Shield detector changed. |
| Enforce | No runtime guardrail, disaster-response policy engine, or intervention subsystem changed. |
| Vault | Relevant because signed evidence refs, exception proof, source citations, and audit hashes must remain trustworthy. |
| Watch | No live drift, emergency monitoring, alerting, or telemetry integration changed. |
| Fleet | No multi-agent orchestration, routing, or topology changed. |
| Passport | Relevant because control-crosswalk receipts can travel as portable proof bundles. |
| Comply | Primary surface. Existing control-crosswalk receipts map source-backed obligations to framework clauses, AMC questions, evidence types, owners, exception state, and evidence chain. |

## Product closure

No product module changed. GAP-1062 is covered by the existing generic control-crosswalk primitive:

- `buildControlCrosswalkReceipt`
- `verifyControlCrosswalkReceipt`
- `renderControlCrosswalkAuditExport`

Added focused regression coverage in `tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts` and this source-review note. The positive fixture uses existing mappings for NIST Manage, ISO 42001 Clause 8 Operation, EU AI Act Art. 15 Accuracy Robustness Cybersecurity, EU AI Act Art. 72 Post-Market Monitoring, SOC 2 Availability, and FedRAMP CP Contingency Planning. The negative fixture fails closed when flood-warning paper metadata replaces signed crosswalk evidence.

## Fail-closed rule

The control-crosswalk receipt fails closed when source citations are missing, a row lacks a framework clause, a row lacks AMC question IDs, a row lacks evidence types, a row lacks an owner, a row lacks evidence lineage, an evidence hash or signed evidence ref is invalid, or a non-`none` exception lacks signed evidence reference and signature hash.

Metadata-only evidence fails closed. DOI, OpenAlex, Crossref, MDPI redirects, article title, journal labels, publisher labels, OA status, paper concepts, author/institution metadata, local backlog metadata, or a flood-warning domain label cannot satisfy control-crosswalk proof without AMC-owned source citations, framework clause, AMC question IDs, evidence types, owner, signed exception workflow, and signed evidence refs.

## No-bloat boundary

No flood-warning system, smart-city subsystem, emergency-management workflow, GIS adapter, sensor adapter, ensemble-learning module, MDPI importer, OpenAlex adapter, Crossref adapter, DOI resolver, paper parser, benchmark mirror, dataset import, prompt import, legal-certification claim, methodology version bump, API route, CLI command, or source-specific control mapping was added.

No upstream paper prose, tables, figures, prompts, survey materials, datasets, screenshots, examples, configs, page content, PDF text, or generated outputs were copied.

## Verification

Commands run:

- `curl -sSL https://api.openalex.org/works/W7134903684 | jq ...` - passed
- `curl -sSL https://api.crossref.org/works/10.3390/geohazards7010035 | jq ...` - passed
- `curl -sSIL https://doi.org/10.3390/geohazards7010035` - passed
- `curl -sSIL https://www.mdpi.com/2624-795X/7/1/35` - returned HTTP/2 `403`; not used for page prose
- `curl -sSIL https://www.mdpi.com/2624-795X/7/1/35/pdf` - returned HTTP/2 `403`; not used for PDF prose
- `npx vitest run tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts --reporter=dot` - expected red on missing source-review doc after aligning test fixture strings to existing AMC framework labels; existing product primitive otherwise worked
- `npx vitest run tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 6 files / 27 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic control-crosswalk, mapping, scoring, and compliance-doc implementation files returned no GAP-1062 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 909 files / 7,619 tests

Final verification is recorded in the progress ledger for the committed slice.
