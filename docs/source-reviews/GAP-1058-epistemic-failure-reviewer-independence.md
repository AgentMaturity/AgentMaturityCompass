# GAP-1058 - Epistemic failure reviewer independence proof

- Gap: `GAP-1058`
- Dimension: `human-reviewer-independence`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `A Taxonomy of Epistemic Failure Modes in Large Language Models`
- Retrieval: live OpenAlex, Zenodo API, and DOI HEAD checks on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Reviewer independence proof

## Relevance decision

GAP-1058 is relevant to AMC because high-risk approvals in Comply, Passport, and Vault need a reviewer-independence proof that is stronger than a human-oversight score. The source is useful as governance risk context, but it does not justify importing a paper-specific workflow or claiming methodology parity.

AMC closure is a generic reviewer-independence receipt that records reviewer identity, role separation, conflict flags, second-review requirements, signed approval receipts, and evidence lineage. Paper metadata alone fails closed.

Reviewed source facts:

- OpenAlex: `https://openalex.org/W7136127232`
- OpenAlex API: `https://api.openalex.org/works/W7136127232`
- DOI: `https://doi.org/10.5281/zenodo.19042469`
- Zenodo record: `https://zenodo.org/records/19042469`
- Zenodo API: `https://zenodo.org/api/records/19042469`
- Title: `A Taxonomy of Epistemic Failure Modes in Large Language Models`
- OpenAlex publication_year `2026`, publication_date `2026-03-15`, type `preprint`, OA status `green`, repository source `Zenodo (CERN European Organization for Nuclear Research)`, license `cc-by`
- Zenodo publication date `2026-03-15`, resource type `Preprint`, license `cc-by-4.0`
- Creator: `Bosch Rodriguez, Rolando`; ORCID `0009-0005-4896-1112`
- Zenodo file: `A Taxonomy of Epistemic Failure Modes in Large Language Models - Bosch 2026.pdf`, checksum `md5:d4e26daf91a6520b9684a925c3fe2c11`, size `170378`
- DOI HEAD resolved through `https://zenodo.org/doi/10.5281/zenodo.19042469` to `https://zenodo.org/records/19042469` and returned `200 OK`; Zenodo link metadata included `ScholarlyArticle`, ORCID author, describedby API links, item PDF, and CC BY 4.0 license link.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology change. Human oversight scoring remains separate from signed per-approval proof. |
| Shield | Indirectly benefits review integrity but no Shield runtime detector was added. |
| Enforce | No runtime guardrail or policy engine was added. |
| Vault | Relevant for high-risk approvals over secrets, DLP, and data-boundary changes that need independent review proof. |
| Watch | No live-drift or observability surface change. |
| Fleet | No multi-agent orchestration or trust-topology change. |
| Passport | Relevant because portable proof bundles can include the reviewer-independence receipt hash and evidence lineage. |
| Comply | Primary surface. Adds auditor-ready reviewer identity, separation rule, conflict check, second review, approval receipt, and evidence chain proof. |

## Product closure

Added a generic audit primitive in `src/audit/reviewerIndependence.ts`:

- `buildReviewerIndependenceReceipt`
- `verifyReviewerIndependenceReceipt`
- `renderReviewerIndependenceAuditExport`

The receipt accepts AMC-owned approval evidence and source citations, computes row and receipt hashes, and fails closed when independence or evidence requirements are incomplete. `src/index.ts` exports the primitive, and `docs/COMPLIANCE_FRAMEWORKS.md` documents reviewer independence receipts.

## Fail-closed rule

The receipt fails closed when any of these are missing or invalid:

- source citations
- reviewer identity, role, or organization metadata
- separation rule ID
- reviewer/requester separation
- signed conflict check
- empty conflict flags
- signed second review for `high` and `critical` approvals
- signed approval receipt
- signed evidence refs and SHA-256 event hashes
- row or receipt hashes

Metadata-only evidence fails closed. A DOI, OpenAlex record, Zenodo record, paper title, policy name, or unsigned reviewer note cannot satisfy reviewer independence.

## No-bloat boundary

No source-specific subsystem was added. AMC did not add an epistemic-failure importer, reviewer workflow engine, paper parser, clinical/legal claim, OpenAlex adapter, Zenodo adapter, copied source prose, copied PDF text, benchmark data, prompts, examples, screenshots, or generated upstream outputs.

The product change is intentionally generic: reviewer-independence receipts over existing AMC compliance/audit/passport evidence.

## Verification

Commands run:

- `curl -sSL https://api.openalex.org/works/W7136127232 | jq ...` - passed
- `curl -sSL https://zenodo.org/api/records/19042469 | jq ...` - passed
- `curl -sSIL https://doi.org/10.5281/zenodo.19042469` - passed
- `npx vitest run tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts --reporter=dot` - expected red on missing module, then expected red on missing source-review doc
- `npx vitest run tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests
- `npx vitest run tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts tests/humanOversightQualitySignals.test.ts tests/gap0955EpistemicFailureModesJudgeCalibrationBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 5 files / 30 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic audit, compliance, and passport implementation files returned no GAP-1058 source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 905 files / 7,603 tests

Final verification is recorded in the progress ledger for the committed slice.
