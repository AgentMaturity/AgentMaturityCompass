# GAP-1064 - Credo AI reviewer independence proof

- Gap: `GAP-1064`
- Dimension: `human-reviewer-independence`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: Credo AI official website
- Retrieval: live `curl` HEAD and page fetches on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Reviewer independence proof

## Relevance decision

GAP-1064 is relevant to AMC because high-risk Comply, Passport, and Vault approvals need reviewer-independence proof that is audit-ready and evidence-linked. The Credo AI source is relevant as competitor governance and audit-readiness context only. It does not justify copying a competitor workflow, creating a Credo integration, or claiming parity with Credo AI.

AMC closure stays generic: reviewer-independence receipts must capture requester/control owner, reviewer identity, role separation, conflict flags, second-review requirements, signed approval receipts, and evidence lineage. Metadata from a competitor website cannot satisfy the proof.

Reviewed source facts:

- Homepage: `https://www.credo.ai`
- Product page: `https://www.credo.ai/product`
- Risk management page: `https://www.credo.ai/solutions/risk-management`
- Regulations and standards page: `https://www.credo.ai/solutions/regulations-and-standards`
- Audit artifacts page: `https://www.credo.ai/solutions/artifacts`
- Homepage HEAD returned HTTP/2 `200`, content-type `text/html; charset=utf-8`, server `cloudflare`, `cf-cache-status: HIT`, `last-modified: Wed, 24 Jun 2026 17:42:20 GMT`
- Homepage title: `Credo AI - The Trusted Leader in AI Governance`
- Homepage description: `Operationalize Trusted AI governance with Credo AI: discover AI, enforce policies, prove compliance, and manage risk across every model, agent, and application.`
- Product title: `Credo AI - The Leader in Responsible AI - Product`
- Audit artifacts title: `Credo AI - Create Artifacts for Audit`
- Parsed official pages contained these governance and compliance labels: `AI Governance Platform`, `AI Registry`, `Risk Intelligence`, `Compliance`, `Runtime Governance`, `AI Agent Registry`, `Risk Center`, `Audit Ready`, `Artifacts`, `NIST AI RMF`, `ISO/IEC 42001`, and `EU AI Act`.

These facts are source-review signals only. AMC did not use page copy as implementation material.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology change. Reviewer-independence proof can support audit evidence but does not alter maturity thresholds. |
| Shield | No red-team pack or safety detector changed. |
| Enforce | No runtime guardrail changed. Signed exceptions remain covered by the existing control-crosswalk primitive. |
| Vault | Relevant for high-risk approvals over secrets, DLP, data-boundary, and residency changes that need independent review proof. |
| Watch | No live-drift or monitoring change. |
| Fleet | No orchestration or fleet topology change. |
| Passport | Relevant because portable proof bundles can carry receipt hashes and evidence lineage without exposing unsupported source claims. |
| Comply | Primary surface. The existing reviewer-independence and control-crosswalk receipts provide source citations, owners, signed exceptions, approval receipts, and evidence chains. |

## Product closure

GAP-1064 did not require a Credo-specific product module. AMC already had the generic reviewer-independence receipt from `src/audit/reviewerIndependence.ts` and signed control-crosswalk exceptions from `src/compliance/controlCrosswalk.ts`.

The product change is intentionally narrow: `renderReviewerIndependenceAuditExport` now includes a `Requester/Owner` column so auditor-facing exports show the accountable requester/control owner alongside the reviewer, second reviewer, separation rule, conflicts, and evidence chain.

Updated `docs/COMPLIANCE_FRAMEWORKS.md` to name the requester/control owner in the reviewer metadata description.

## Fail-closed rule

Reviewer-independence proof fails closed when any of these are missing or invalid:

- source citations
- requester/control owner identity
- reviewer identity, role, or org-unit metadata
- separation rule ID
- reviewer/requester separation
- signed conflict check
- empty conflict flags
- signed second review for `high` and `critical` approvals
- signed approval receipt
- signed evidence refs and SHA-256 event hashes
- row or receipt hashes

Control-crosswalk proof fails closed when source citations, owner, evidence lineage, or signed exception evidence are missing. Credo AI page metadata, product labels, website titles, local backlog text, or unsigned reviewer notes are not sufficient evidence.

## No-bloat boundary

No Credo AI integration, scraper, importer, workflow clone, adapter, page mirror, governance-platform subsystem, source-specific API route, competitor parity claim, copied page prose, copied screenshots, copied examples, prompts, configs, or generated outputs were added.

The only product behavior change is a generic audit-export column over existing AMC receipt data.

## Verification

Commands run:

- `curl -sSIL https://www.credo.ai | sed -n '1,80p'` - passed; homepage returned HTTP/2 `200`
- `curl -sSL https://www.credo.ai | node -e ...` - passed; parsed title, description, and governance labels
- `curl -sSL https://www.credo.ai/robots.txt | sed -n '1,120p'` - passed; sitemap listed
- `curl -sSL https://www.credo.ai/sitemap.xml | sed -n '1,120p'` - passed; product, risk, standards, and artifacts pages listed
- Page fetch loop for `https://www.credo.ai/product`, `https://www.credo.ai/solutions/risk-management`, `https://www.credo.ai/solutions/regulations-and-standards`, and `https://www.credo.ai/solutions/artifacts` - passed; titles and governance labels parsed
- `npx vitest run tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts --reporter=dot` - expected red on missing source-review doc and missing `Requester/Owner` audit-export column
- `npx vitest run tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts --reporter=dot` - passed, 1 file / 5 tests
- `npx vitest run tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts --reporter=dot` - passed, 6 files / 36 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic audit, compliance, passport, and compliance-doc files returned no Credo AI source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 911 files / 7,628 tests
