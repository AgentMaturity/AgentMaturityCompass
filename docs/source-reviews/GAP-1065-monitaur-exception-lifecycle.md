# GAP-1065 - Monitaur exception and waiver lifecycle

- Gap: `GAP-1065`
- Dimension: `gov-exception-workflow`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: Monitaur official website
- Retrieval: live `curl` HEAD, sitemap, and page fetches on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Exception and waiver lifecycle

## Relevance decision

GAP-1065 is relevant to AMC because temporary policy exceptions and waivers can become unmanaged permanent risk unless they preserve signed request, approval, expiry, compensating-control, renewal outcome, owner, and evidence-chain proof.

The Monitaur source is relevant as competitor governance, model-lifecycle, risk, compliance, audit, monitoring, controls, documentation, inventory, collaboration, and vendor-governance context only. It does not justify copying a competitor workflow, adding a Monitaur integration, or claiming parity with Monitaur.

AMC closure is a generic governance exception lifecycle receipt for existing Comply, Passport, and Vault evidence paths. Monitaur website metadata alone fails closed.

Reviewed source facts:

- Homepage: `https://www.monitaur.ai`
- Platform page: `https://www.monitaur.ai/platform`
- Solutions page: `https://www.monitaur.ai/solutions`
- AI governance page: `https://www.monitaur.ai/ai-governance`
- Security page: `https://www.monitaur.ai/security`
- Homepage HEAD returned HTTP/2 `200`, content-type `text/html; charset=utf-8`, server `cloudflare`, `cf-cache-status: HIT`, and `last-modified: Thu, 25 Jun 2026 00:07:57 GMT`
- Homepage title: `AI Governance software that goes beyond good intentions | Monitaur`
- Homepage description: `Keeping AI honest is a full-time job. Ours. Get Monitaur software and expertise to provide actionable governance for the entire lifecycle of your AI.`
- Platform title: `AI governance software platform`
- Platform description: `AI governance platform with the software and expertise for you to deliver real value from AI systems. Get a single source of truth for safe and trustworthy AI.`
- Solutions title: `Solutions`
- Security title: `Security`
- Parsed official pages contained governance labels around `governance`, `risk`, `compliance`, `audit`, `monitoring`, `controls`, `documentation`, `inventory`, `collaboration`, `vendor governance`, `model lifecycle`, and `responsible AI`.

These facts are source-review signals only. AMC did not use page copy as implementation material.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology change. Exception lifecycle proof can support evidence quality but does not change maturity thresholds. |
| Shield | No assurance pack or detector changed. |
| Enforce | Existing runtime waiver surfaces remain separate; this gap adds a compliance receipt for governance exception proof. |
| Vault | Relevant because signed exception, approval, compensating-control, and renewal evidence may include sensitive governance records that must stay trustworthy. |
| Watch | No live-drift or monitoring change. |
| Fleet | No orchestration or fleet topology change. |
| Passport | Relevant because portable proof bundles can carry exception lifecycle receipt hashes and evidence lineage. |
| Comply | Primary surface. Adds auditor-ready exception request, approver, expiry, compensating control, renewal outcome, source citation, owner, and evidence-chain proof. |

## Product closure

Added a generic compliance primitive in `src/compliance/exceptionLifecycle.ts`:

- `buildGovernanceExceptionLifecycleReceipt`
- `verifyGovernanceExceptionLifecycleReceipt`
- `renderGovernanceExceptionLifecycleAuditExport`

The receipt accepts AMC-owned exception evidence and source citations, computes row and receipt hashes, and fails closed when lifecycle evidence is incomplete. `src/index.ts` exports the primitive, and `docs/COMPLIANCE_FRAMEWORKS.md` documents governance exception lifecycle receipts.

The focused test also proves the lifecycle receipt stays compatible with existing source-cited control-crosswalk rows and signed exception states from `src/compliance/controlCrosswalk.ts`.

## Fail-closed rule

The receipt fails closed when any of these are missing or invalid:

- source citations
- policy ID and control ID
- accountable owner
- signed exception request
- approver and signed approval evidence
- expiry timestamp and signed expiry-check evidence
- signed compensating control
- signed renewal, denial, or not-requested outcome
- signed evidence refs and SHA-256 event hashes
- row or receipt hashes

Metadata-only evidence fails closed. Monitaur page titles, sitemap URLs, product labels, local backlog text, policy names, or unsigned waiver notes cannot satisfy exception lifecycle proof.

## No-bloat boundary

No Monitaur integration, scraper, importer, adapter, workflow clone, governance-platform subsystem, source-specific API route, competitor parity claim, copied page prose, copied screenshots, copied examples, copied prompts, copied configs, or generated upstream outputs were added.

The product change is intentionally generic: exception lifecycle receipts over existing AMC compliance evidence.

## Verification

Commands run:

- `curl -sSIL https://www.monitaur.ai | sed -n '1,80p'` - passed; homepage returned HTTP/2 `200`
- `curl -sSL https://www.monitaur.ai | node -e ...` - passed; parsed title, description, and governance labels
- `curl -sSL https://www.monitaur.ai/robots.txt | sed -n '1,120p'` - passed; sitemap listed
- `curl -sSL https://www.monitaur.ai/sitemap.xml | sed -n '1,160p'` - passed; platform, solutions, AI governance, and security pages listed
- Page fetch loop for `https://www.monitaur.ai/platform`, `https://www.monitaur.ai/solutions`, `https://www.monitaur.ai/ai-governance`, and `https://www.monitaur.ai/security` - passed; titles and governance labels parsed
- `npx vitest run tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts --reporter=dot` - expected red on missing `src/compliance/exceptionLifecycle.ts`
- `npx vitest run tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts --reporter=dot` - passed, 1 file / 5 tests
- `npx vitest run tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts --reporter=dot` - passed, 8 files / 48 tests
- `git diff --check -- . ':(exclude)AMC_OS'` - passed
- Narrow no-bloat scan over generic compliance, enforce, incident, and compliance-doc files returned no Monitaur source identifiers.
- `npm run typecheck` - passed
- `npm test -- --reporter=dot` - passed, 912 files / 7,633 tests
