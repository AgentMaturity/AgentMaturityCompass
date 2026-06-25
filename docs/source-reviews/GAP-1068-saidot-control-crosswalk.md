# GAP-1068 - Saidot control crosswalk boundary

- Gap: `GAP-1068`
- Dimension: `gov-control-crosswalk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: Saidot official website
- Retrieval: live `curl` checks against `https://www.saidot.ai` on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Control crosswalk coverage

## Relevance decision

GAP-1068 is relevant to AMC as governance, risk, compliance, audit, evidence, policy, graph, inventory, workflow, control, and AI-agent governance context. Saidot's official site presents an AI governance platform, AI policy material, EU AI Act material, governance/control content, agent-first governance content, and AI-agent risk/control content.

No new product code is required because AMC already has the generic `buildControlCrosswalkReceipt` primitive. This gap is closed by proving that Saidot context uses the existing receipt with source citations, framework clause, AMC question IDs, evidence type, owner, exception state, signed exception proof, and evidence lineage. Saidot website metadata alone fails closed.

Reviewed source facts:

- Homepage: `https://www.saidot.ai`
- Product page: `https://www.saidot.ai/product`
- AI policy page: `https://www.saidot.ai/ai-policy`
- EU AI Act guide: `https://www.saidot.ai/introduction-to-the-eu-ai-act-practical-guide-to-governance-compliance-and-regulatory-guidelines`
- Governance/control article: `https://www.saidot.ai/insights/beyond-compliance-building-trust-through-ai-governance-and-control`
- Agent-first governance article: `https://www.saidot.ai/insights/what-is-agent-first-ai-governance`
- AI-agent risk/control article: `https://www.saidot.ai/insights/most-common-ai-agent-risks`
- Homepage returned HTTP/2 `200` with Cloudflare/Webflow headers and `last-modified: Thu, 25 Jun 2026 00:52:16 GMT`.
- Homepage title: `Saidot: Govern all your AI in one connected graph.`
- Homepage description metadata: `The agent-first AI governance platform built on a knowledge graph.`
- Sitemap: `https://www.saidot.ai/sitemap.xml`, listed product, AI policy, EU AI Act guide, AI governance handbook, governance-control, agent-governance, and agent-risk pages.
- Product page title: `Saidot AI Governance Platform`
- AI policy page title: `Saidot AI Policy`
- EU AI Act guide title: `An Introduction to the EU AI Act: Practical Guide to Governance, Compliance, and Regulatory Guidelines`
- Governance/control page title: `Beyond compliance: Building trust through AI governance and control`
- Agent-governance page title: `What is agent-first AI governance, and why is it a must in 2026?`
- Agent-risk page title: `The 14 most common AI agent risks - and controls to mitigate them`
- Parsed page labels included governance, risk, compliance, audit, control, controls, evidence, policy, framework, NIST, ISO, EU AI Act, inventory, workflow, graph, agent, and agents.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. |
| Shield | Agent-risk/control context is safety-adjacent, but no Shield detector changed. |
| Enforce | No runtime guardrail, policy engine, or intervention subsystem changed. |
| Vault | Relevant where crosswalk rows preserve signed evidence refs, row hashes, and evidence-chain hashes. |
| Watch | No live monitoring or drift alert changed. |
| Fleet | Agent-governance context is fleet-adjacent, but no fleet topology or orchestration changed. |
| Passport | Relevant because control-crosswalk receipts can travel in Passport proof bundles. |
| Comply | Primary surface. Existing control-crosswalk receipts map source-backed obligations to framework clauses, AMC questions, evidence types, owners, exception state, and evidence chain. |

## Product closure

No product module changed. GAP-1068 is covered by the existing generic control-crosswalk primitive:

- `buildControlCrosswalkReceipt`
- `verifyControlCrosswalkReceipt`
- `renderControlCrosswalkAuditExport`

Added focused regression coverage in `tests/gap1068SaidotControlCrosswalkBoundary.test.ts` and this source-review note. The positive fixture uses existing mappings for NIST Govern, ISO 42001 Clause 5 Leadership, EU AI Act Art. 9 Risk Management, EU AI Act Art. 12 Record-Keeping, SOC 2 Security, and GDPR Art. 5 Accountability. The negative fixture fails closed when Saidot metadata replaces signed crosswalk evidence.

## Fail-closed rule

The control-crosswalk receipt fails closed when a row lacks an owner, a row lacks evidence lineage, or a non-`none` exception has no signed evidence reference and signature hash. It also fails closed when source citations are missing.

Metadata-only evidence fails closed. Saidot URLs, page titles, description metadata, sitemap routes, product labels, graph claims, policy labels, AI-agent labels, framework labels, NIST/ISO/EU AI Act mentions, local backlog metadata, or competitor identity cannot satisfy control-crosswalk proof without AMC-owned source citations, framework clause, AMC question IDs, evidence types, owner, signed exception workflow, signed evidence refs, row hashes, and receipt hashes.

## No-bloat boundary

No Saidot integration, scraper, importer, adapter, workflow clone, graph-governance subsystem, control library mirror, AI policy template, AI Act classifier, agent-risk taxonomy copy, competitor parity claim, methodology version bump, API route, CLI command, or source-specific control mapping was added.

No upstream page prose, screenshots, examples, prompts, configs, framework tables, policy templates, classifier outputs, controls, generated outputs, or implementation details were copied.

## Verification

Commands run:

- `curl -sSIL https://www.saidot.ai | sed -n '1,120p'` - passed; official homepage returned HTTP/2 `200`.
- `curl -sSL https://www.saidot.ai/robots.txt | sed -n '1,160p'` - passed; sitemap listed.
- `curl -sSL https://www.saidot.ai/sitemap.xml | sed -n '1,220p'` - passed; product, AI policy, EU AI Act, governance-control, agent-governance, and agent-risk pages listed.
- Page fetch loop for `https://www.saidot.ai/product`, `https://www.saidot.ai/ai-policy`, `https://www.saidot.ai/introduction-to-the-eu-ai-act-practical-guide-to-governance-compliance-and-regulatory-guidelines`, `https://www.saidot.ai/insights/beyond-compliance-building-trust-through-ai-governance-and-control`, `https://www.saidot.ai/insights/what-is-agent-first-ai-governance`, and `https://www.saidot.ai/insights/most-common-ai-agent-risks` - passed; page titles and governance/risk/compliance/control/policy/framework labels parsed.
- `npx vitest run tests/gap1068SaidotControlCrosswalkBoundary.test.ts --reporter=dot` - expected red on missing source-review doc; existing product primitive tests passed.
- `npx vitest run tests/gap1068SaidotControlCrosswalkBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1060DarkPatternsControlCrosswalkBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` - passed, 7 files / 31 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow no-bloat scan over generic control-crosswalk, compliance mapping, scoring, and compliance-doc files returned no Saidot identifiers.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 915 files / 7,647 tests.
