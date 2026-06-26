# GAP-1076 - Childhood safety reviewer independence

- Gap: `GAP-1076`
- Dimension: Reviewer independence proof
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W4407691174`, OpenAlex API `https://api.openalex.org/works/W4407691174`, DOI `https://doi.org/10.2139/ssrn.6836268`, and SSRN landing page `https://www.ssrn.com/abstract=6836268`
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:34:26.000+05:30`
- Status: Done

## Relevance decision

OpenAlex identifies the source as `LLMs and Childhood Safety Identifying Risks and Proposing a Protection Framework for Safe Child-LLM Interaction`, a `preprint` in `SSRN Electronic Journal`, publication_year `2026`, publication_date `2026-01-01`, DOI `https://doi.org/10.2139/ssrn.6836268`, open-access status `green`, and no license value in the OpenAlex payload. OpenAlex concepts include `Risk analysis (engineering)`, `Business`, `Environmental health`, and `Medicine`. The author metadata includes Junfeng Jiao with `The University of Texas at Austin`; OpenAlex did not include an abstract, matching the backlog's `No abstract in OpenAlex metadata` note.

This source is relevant to AMC only as governance and audit context for high-risk approval workflows. It maps to AMC's existing reviewer-independence receipt because the backlog acceptance asks for reviewer metadata, role separation, conflict flags, second-review requirements, and approval receipt evidence. It does not justify a childhood-safety subsystem, a paper importer, an SSRN scraper, a child-safety policy clone, a source-specific route, or an unsupported child-safety claim.

Live access boundary: the DOI returned HTTP/2 `302` to `https://www.ssrn.com/abstract=6836268`. The SSRN destination returned HTTP/2 `403` with a Cloudflare challenge page whose title was `Just a moment...`. AMC therefore treats live OpenAlex metadata and HTTP headers as source-review metadata only, not as retrieved SSRN article contents.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score semantics changed. Reviewer independence can support audit trust for high-risk approvals. |
| Shield | No Shield test pack changed. Reviewer independence can cite Shield evidence when an approval depends on safety review. |
| Enforce | No runtime enforcement path changed. Approval receipts can support release or policy gates elsewhere. |
| Vault | Relevant because review receipts can reference signed evidence without embedding sensitive review payloads. |
| Watch | No Watch monitor changed. Watch evidence can be linked when approval decisions respond to alerts. |
| Fleet | No fleet topology changed. High-risk agent approvals can use the same receipt shape. |
| Passport | Relevant because the audit export provides portable reviewer-independence proof. |
| Comply | Relevant because independent review, conflict checking, and second review are compliance/audit proof requirements for high-risk approvals. |

## Product closure

No product code changed. Existing `src/audit/reviewerIndependence.ts` already builds, verifies, and renders generic reviewer-independence receipts with:

- reviewer identity
- requester identity
- role separation
- conflict flags
- signed conflict check
- second-review requirements for high-risk actions
- approval receipt
- signed evidence refs
- source citations
- evidence-chain hash
- row hash and receipt hash
- auditor-ready markdown export

`tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts` proves this existing primitive accepts an AMC-owned childhood-safety governance approval context and fails closed when paper metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage.

## Fail-closed rule

metadata-only childhood-safety evidence must fail closed. A paper title, OpenAlex work id, DOI, SSRN landing URL, preprint label, concept list, publication date, author name, institutional affiliation, or local backlog text cannot approve high-risk actions. Passing evidence requires source citations plus AMC-owned reviewer metadata, separation rule, conflict check, second-review proof for high-risk actions, approval receipt, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No childhood-safety subsystem, SSRN importer, OpenAlex importer, paper parser, child-safety policy engine, safety framework clone, clinical or child-safety claim, source-specific API route, source-specific CLI command, article scraper, upstream article prose, prompts, figures, tables, datasets, screenshots, model outputs, or implementation details were added. The closure uses the existing generic reviewer-independence primitive.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1076-childhood-safety-reviewer-independence.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W4407691174` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.2139/ssrn.6836268` returned HTTP/2 `302` to SSRN followed by HTTP/2 `403`.
  - `curl -sSL https://doi.org/10.2139/ssrn.6836268` returned a Cloudflare challenge page with title `Just a moment...`.
- Focused test: `npx vitest run tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts --reporter=dot`
- Paired reviewer-independence/compliance/passport regression: `npx vitest run tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/humanOversightQualitySignals.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
