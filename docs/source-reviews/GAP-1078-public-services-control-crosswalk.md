# GAP-1078 - Public services control crosswalk

- Gap: `GAP-1078`
- Dimension: Control crosswalk coverage
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7125391529`, OpenAlex API `https://api.openalex.org/works/W7125391529`, DOI `https://doi.org/10.1145/3772318.3790297`, and ACM landing page `https://dl.acm.org/doi/10.1145/3772318.3790297`
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:51:10.000+05:30`
- Status: Done

## Relevance decision

OpenAlex identifies `The Promises and Perils of using LLMs for Effective Public Services` as an `article`, publication_year `2026`, publication_date `2026-04-13`, DOI `https://doi.org/10.1145/3772318.3790297`, open-access status `gold`, and license `cc-by`. Concepts include `Work (physics)`, `Public relations`, `Social Welfare`, `Citizen journalism`, `Business`, `Welfare`, `Optimism`, and `Government (linguistics)`. Author affiliations include `University of Toronto`, `Georgia Institute of Technology`, `Canadian Anesthesiologists' Society`, and `University of Wisconsin-Madison`.

This source is relevant to AMC as governance/audit context for public-service delivery and high-stakes decision-making, but only through existing control-crosswalk proof. It does not justify a public-services subsystem, an ACM scraper, a paper importer, a source-specific compliance route, a public-sector policy clone, or a claim that AMC validates public-service outcomes.

Live access boundary: the DOI returned HTTP/2 `302` to `https://dl.acm.org/doi/10.1145/3772318.3790297`. The ACM destination returned HTTP/2 `403` with a Cloudflare challenge page whose title was `Just a moment...`. AMC therefore treats OpenAlex metadata and HTTP headers as source-review context only.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing AMC question IDs mapped in compliance controls. No score semantics changed. |
| Shield | No Shield pack changed. Safety evidence can be referenced by control rows when present. |
| Enforce | No runtime enforcement path changed. Control exceptions can cite enforcement evidence but metadata cannot approve exceptions. |
| Vault | Relevant because control evidence references can bind sensitive audit evidence without embedding payloads. |
| Watch | No Watch monitor changed. Monitoring evidence can be linked to the generic crosswalk receipt. |
| Fleet | No fleet topology changed. Public-service governance context can use the same generic control rows. |
| Passport | Relevant because auditor-ready export preserves framework clause, AMC question IDs, evidence type, owner, exception state, and hashes. |
| Comply | Relevant because framework crosswalks translate AMC evidence into NIST AI RMF, ISO 42001, EU AI Act, SOC 2, GDPR, and other audit contexts. |

## Product closure

No product code changed. Existing `src/compliance/controlCrosswalk.ts` already builds and verifies signed control-crosswalk receipts with:

- framework clause
- AMC question IDs
- evidence type
- owner
- exception state
- source citations
- signed evidence chain
- row and receipt hashes
- auditor-ready markdown export

`tests/gap1078PublicServicesControlCrosswalkBoundary.test.ts` proves this existing primitive accepts source-cited public-services governance context and fails closed when metadata replaces mapped controls, owners, signed exceptions, or signed evidence.

## Fail-closed rule

metadata-only public-services evidence must fail closed. A paper title, OpenAlex work id, DOI, ACM URL, publication date, concept list, author affiliation, open-access label, license label, abstract metadata, or local backlog text cannot satisfy a control crosswalk. Passing evidence requires mapped framework clauses, AMC question IDs, evidence types, owners, source citations, signed evidence refs, signed exception evidence when exceptions exist, row hashes, and receipt hash.

## No-bloat boundary

No public-services subsystem, ACM importer, OpenAlex importer, paper parser, public-sector policy engine, source-specific compliance route, source-specific CLI command, public-service outcome claim, upstream article prose, prompts, figures, tables, datasets, screenshots, model outputs, or implementation details were added. The closure uses the existing generic control-crosswalk primitive.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1078PublicServicesControlCrosswalkBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1078-public-services-control-crosswalk.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7125391529` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.1145/3772318.3790297` returned HTTP/2 `302` to ACM followed by HTTP/2 `403`.
  - `curl -sSL https://doi.org/10.1145/3772318.3790297` returned a Cloudflare challenge page with title `Just a moment...`.
- Focused test: `npx vitest run tests/gap1078PublicServicesControlCrosswalkBoundary.test.ts --reporter=dot`
- Paired control-crosswalk/compliance regression: `npx vitest run tests/gap1078PublicServicesControlCrosswalkBoundary.test.ts tests/gap1074MicrosoftAzureAiFoundryControlCrosswalkBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
