# GAP-1070 - ModelOp audit binder boundary

- Gap: `GAP-1070`
- Dimension: `gov-auditor-binder`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: ModelOp official website
- Retrieval: live `curl` checks against `https://www.modelop.com` on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Auditor-ready evidence binder

## Relevance decision

GAP-1070 is relevant to AMC as AI governance, model operations, model risk, compliance, audit, evidence, policy, control, inventory, reporting, workflow, and regulatory-framework context. ModelOp's official site presents AI governance software, inventory, reporting, controls, financial-services governance, legal/risk/compliance leader workflows, SR 11-7, NIST AI RMF, and EU AI Act content.

No new product code is required because AMC already has a signed `.amcaudit` binder artifact path. This gap is closed by proving that ModelOp context uses the existing auditor-ready evidence binder with Binder manifest, control index, receipt hashes, reviewer notes, signed artifact verification, privacy/secret scan, and evidence lineage. ModelOp website metadata alone fails closed.

Reviewed source facts:

- Homepage: `https://www.modelop.com`
- AI governance software: `https://www.modelop.com/ai-governance-software`
- Inventory: `https://www.modelop.com/ai-governance-software/inventory`
- Reporting: `https://www.modelop.com/ai-governance-software/reporting`
- Controls: `https://www.modelop.com/ai-governance-software/controls`
- Financial services: `https://www.modelop.com/solutions/financial-services`
- Legal, risk, and compliance leaders: `https://www.modelop.com/solutions/legal-risk-compliance-leaders`
- AI governance: `https://www.modelop.com/ai-governance`
- SR 11-7: `https://www.modelop.com/ai-governance/ai-regulations-standards/sr-11-7`
- NIST AI RMF: `https://www.modelop.com/ai-governance/ai-regulations-standards/nist-ai-rmf`
- EU AI Act: `https://www.modelop.com/ai-governance/ai-regulations-standards/eu-ai-act`
- Homepage returned HTTP/2 `200`, content-type `text/html; charset=utf-8`, and server `cloudflare`.
- Homepage title: `Industrialized AI Delivery for Enterprise Leaders - ModelOp`
- Sitemap: `https://www.modelop.com/sitemap.xml`, listed AI governance software, inventory, reporting, controls, financial services, legal/risk/compliance leaders, AI governance, SR 11-7, NIST AI RMF, ISO/IEC 42001, EU AI Act, and related pages.
- AI governance software title: `ModelOp Center - AI Governance Software`
- Inventory title: `Evergreen AI Model Inventory | ModelOp`
- Reporting title: `AI Governance Reporting Engine`
- Controls title: `Automate AI Governance Workflows & Enforce Compliance`
- Financial-services title: `AI Governance for Finance: Banks, Insurance, Investment Firms, Financial Services`
- Legal/risk/compliance title: `AI Governance for Legal, Risk, & Compliance Leaders | ModelOp`
- AI governance title: `What is AI Governance? | ModelOp`
- SR 11-7 title: `SR 11-7 Model Risk Management: Compliance, Validation & Governance`
- NIST title: `NIST AI RMF`
- EU AI Act title: `EU AI Act: Summary & Compliance Requirements`
- Parsed page labels included governance, risk, model risk, model operations, compliance, audit, control, controls, evidence, policy, policies, framework, workflow, regulatory, documentation, monitoring, inventory, validation, approval, SR 11-7, NIST, and EU AI Act.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. |
| Shield | Model-risk context is safety-adjacent, but no Shield detector changed. |
| Enforce | No runtime guardrail, policy engine, or intervention subsystem changed. |
| Vault | Relevant because `.amcaudit` binders enforce allowlisted fields, signatures, hashes, and PII/secret scanning. |
| Watch | No live monitoring or alert changed. |
| Fleet | No fleet topology or orchestration changed. |
| Passport | Relevant because audit binders are portable proof bundles for external review. |
| Comply | Primary surface. Existing audit binders package control-family evidence, maturity notes, governance notes, assurance notes, proof bindings, signatures, and verification status. |

## Product closure

No product module changed. GAP-1070 is covered by the existing signed audit-binder path:

- `createAuditBinderArtifact`
- `verifyAuditBinderFile`
- `inspectAuditBinder`
- `scanBinderForPii`

Added focused regression coverage in `tests/gap1070ModelOpAuditBinderBoundary.test.ts` and this source-review note. The positive fixture creates a signed `.amcaudit` package and verifies binder manifest, control index, proof hashes, signature digest, reviewer-note arrays, PII scan, and artifact verification. The negative fixture tampers with binder notes and proves digest/signature verification fails closed; metadata-only reviewer notes with PII also fail scanning.

## Fail-closed rule

The audit binder fails closed when binder contents are tampered after signing, when digest or signature verification fails, or when reviewer notes contain PII/secret-like data. Exported binders must preserve deterministic binder manifest, control index, proof bindings, receipt hashes, reviewer notes, signature envelope, and verification status.

Metadata-only evidence fails closed. ModelOp URLs, page titles, sitemap routes, AI governance software labels, model operations labels, inventory labels, reporting labels, controls labels, SR 11-7 labels, NIST labels, EU AI Act labels, local backlog metadata, or competitor identity cannot satisfy auditor-binder proof without an AMC-owned signed `.amcaudit` artifact and verification result.

## No-bloat boundary

No ModelOp integration, scraper, importer, adapter, workflow clone, model-ops subsystem, model inventory clone, reporting engine clone, regulatory-framework mirror, competitor parity claim, methodology version bump, API route, CLI command, or source-specific audit binder was added.

No upstream page prose, screenshots, examples, prompts, configs, framework tables, inventory templates, reporting templates, control libraries, generated outputs, or implementation details were copied.

## Verification

Commands run:

- `curl -sSIL https://www.modelop.com | sed -n '1,120p'` - passed; official homepage returned HTTP/2 `200`.
- `curl -sSL https://www.modelop.com | node -e ...` - passed; parsed homepage title and governance/model-operations/compliance/audit/control/evidence/policy/workflow labels.
- `curl -sSL https://www.modelop.com/robots.txt | sed -n '1,160p'` - passed; sitemap listed.
- `curl -sSL https://www.modelop.com/sitemap.xml | sed -n '1,240p'` - passed; AI governance software, inventory, reporting, controls, financial services, legal/risk/compliance leaders, AI governance, SR 11-7, NIST AI RMF, and EU AI Act pages listed.
- Page fetch loop for `https://www.modelop.com/ai-governance-software`, `https://www.modelop.com/ai-governance-software/inventory`, `https://www.modelop.com/ai-governance-software/reporting`, `https://www.modelop.com/ai-governance-software/controls`, `https://www.modelop.com/solutions/financial-services`, `https://www.modelop.com/solutions/legal-risk-compliance-leaders`, `https://www.modelop.com/ai-governance`, `https://www.modelop.com/ai-governance/ai-regulations-standards/sr-11-7`, `https://www.modelop.com/ai-governance/ai-regulations-standards/nist-ai-rmf`, and `https://www.modelop.com/ai-governance/ai-regulations-standards/eu-ai-act` - passed; titles and governance/model-risk/compliance/audit/control/policy/framework/inventory labels parsed.
- `npx vitest run tests/gap1070ModelOpAuditBinderBoundary.test.ts --reporter=dot` - expected red on missing source-review doc; existing product primitive tests passed.
- `npx vitest run tests/gap1070ModelOpAuditBinderBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1070ModelOpAuditBinderBoundary.test.ts tests/gap1063ScaleDonovanAuditBinderBoundary.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts tests/vault-extensions.test.ts --reporter=dot` - passed, 5 files / 47 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow no-bloat scan over generic audit-binder, passport, vault, and audit-binder docs files returned no ModelOp identifiers.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 917 files / 7,655 tests.
