# GAP-1069 - ValidMind policy drift boundary

- Gap: `GAP-1069`
- Dimension: `gov-policy-drift`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: ValidMind official website
- Retrieval: live `curl` checks against `https://validmind.com` on 2026-06-25 Asia/Kolkata
- Status: Done
- Backlog improvement: Policy drift and change impact

## Relevance decision

GAP-1069 is relevant to AMC as model risk management, model validation, agentic AI governance, governance workflow, policy, approval, compliance, audit, evidence, monitoring, regulatory-framework, and financial-services governance context. ValidMind's official site positions the platform around agentic AI governance for regulated financial services, AI governance workflows, model risk management, validation, monitoring, documentation, approvals, and regulatory readiness.

No new product code is required because GAP-1067 already added the generic `buildPolicyDriftImpactReceipt` primitive. This gap is closed by proving that ValidMind context uses the existing receipt with policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, rollout receipt, source citations, signed evidence refs, row hashes, receipt hash, and evidence lineage. ValidMind website metadata alone fails closed.

Reviewed source facts:

- Homepage: `https://validmind.com`
- Agent Authority: `https://validmind.com/platform/agent-authority/`
- AI Governance: `https://validmind.com/platform/ai-governance/`
- AI and model risk management: `https://validmind.com/platform/ai-model-risk-management/`
- Validation: `https://validmind.com/platform/validation/`
- Validate: `https://validmind.com/platform/validate/`
- Monitor: `https://validmind.com/platform/monitor/`
- AI risk management: `https://validmind.com/ai-risk-management/`
- AI governance assessment: `https://validmind.com/ai-governance-assessment/`
- Homepage returned HTTP/2 `200` with Cloudflare/Kinsta headers.
- Homepage title: `ValidMind | Agentic AI Governance Platform`
- Homepage description metadata: `ValidMind is the agentic AI governance platform for regulated financial services.`
- `robots.txt` listed `https://validmind.com/sitemap_index.xml`.
- Sitemap index listed post, page, tech-briefs, events, and news sitemaps.
- Page sitemap listed `platform/agent-authority`, `platform/ai-governance`, `platform/ai-model-risk-management`, `platform/validation`, `platform/validate`, `platform/monitor`, `ai-risk-management`, and `ai-governance-assessment`.
- Agent Authority title: `ValidMind Agent Authority: Agentic AI Governance`
- AI Governance title: `ValidMind AI Governance Solution | Enterprise Oversight`
- AI and model risk management title: `ValidMind AI & Model Risk Management | Enterprise Grade`
- Additional page titles included `Validation - ValidMind`, `Model Validation | ValidMind`, `Ongoing Model Monitoring | ValidMind`, `ValidMind: The AI Governance Platform`, and `Enterprise AI Governance Assessment | ValidMind`.
- Parsed page labels included governance, risk, model risk, validation, compliance, audit, control, controls, evidence, policy, policies, framework, workflow, regulatory, documentation, monitoring, approval, SR 11-7, EU AI Act, SS1/23, and E-23.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. |
| Shield | Model-risk and validation context is safety-adjacent, but no Shield detector changed. |
| Enforce | No runtime guardrail, policy engine, or intervention subsystem changed. |
| Vault | Relevant because policy drift receipts preserve signed evidence refs, hashes, and evidence-chain integrity. |
| Watch | Monitoring context is relevant only through receipt evidence; no live alert or adapter changed. |
| Fleet | Agentic governance context is fleet-adjacent, but no fleet topology or orchestration changed. |
| Passport | Relevant because policy-drift receipts can travel as portable policy-change proof. |
| Comply | Primary surface. Existing policy-drift receipts prove policy diff, affected agents, controls, tests, prior decisions, rechecks, rollout approval, source citations, and evidence lineage. |

## Product closure

No product module changed. GAP-1069 is covered by the existing generic policy-drift primitive:

- `buildPolicyDriftImpactReceipt`
- `verifyPolicyDriftImpactReceipt`
- `renderPolicyDriftImpactAuditExport`

Added focused regression coverage in `tests/gap1069ValidMindPolicyDriftBoundary.test.ts` and this source-review note. The positive fixture proves a model-validation policy change that affects production agents, EU AI Act and SR 11-7 controls, validation tests, prior release approvals, recheck items, rollout receipt, and signed evidence lineage. The negative fixture fails closed when ValidMind metadata replaces signed policy drift evidence.

## Fail-closed rule

The policy-drift receipt fails closed when source citations are missing or unknown, policy diff proof is missing or unsigned, affected agents are missing, affected controls are missing, affected tests are missing, prior decisions are missing, recheck items are missing, rollout proof is missing or unsigned, evidence lineage is missing, or hashes do not verify.

Metadata-only evidence fails closed. ValidMind URLs, page titles, description metadata, sitemap routes, model-risk labels, validation labels, regulatory-framework mentions, SR 11-7 labels, EU AI Act labels, SS1/23 labels, E-23 labels, monitoring text, local backlog metadata, or competitor identity cannot satisfy policy drift proof without AMC-owned signed policy diff, affected-agent proof, affected-test proof, affected-control proof, prior-decision proof, recheck proof, rollout proof, source citations, row hashes, and receipt hashes.

## No-bloat boundary

No ValidMind integration, scraper, importer, adapter, workflow clone, validation platform clone, model-risk subsystem, monitor adapter, regulatory-framework mirror, competitor parity claim, methodology version bump, API route, CLI command, or source-specific policy mapping was added.

No upstream page prose, screenshots, examples, prompts, configs, framework tables, validation templates, test outputs, generated outputs, or implementation details were copied.

## Verification

Commands run:

- `curl -sSIL https://validmind.com | sed -n '1,120p'` - passed; official homepage returned HTTP/2 `200`.
- `curl -sSL https://validmind.com | node -e ...` - passed; parsed homepage title, description metadata, and governance/model-risk/validation/compliance/audit/policy/workflow labels.
- `curl -sSL https://validmind.com/robots.txt | sed -n '1,160p'` - passed; sitemap index listed.
- `curl -sSL https://validmind.com/sitemap_index.xml | sed -n '1,220p'` - passed; page sitemap listed.
- `curl -sSL https://validmind.com/page-sitemap.xml | sed -n '1,240p'` - passed; platform, model-risk, validation, monitoring, and governance-assessment pages listed.
- Page fetch loop for `https://validmind.com/platform/agent-authority/`, `https://validmind.com/platform/ai-governance/`, `https://validmind.com/platform/ai-model-risk-management/`, `https://validmind.com/platform/validation/`, `https://validmind.com/platform/validate/`, `https://validmind.com/platform/monitor/`, `https://validmind.com/ai-risk-management/`, and `https://validmind.com/ai-governance-assessment/` - passed; titles and governance/model-risk/validation/compliance/policy/monitoring/regulatory labels parsed.
- `npx vitest run tests/gap1069ValidMindPolicyDriftBoundary.test.ts --reporter=dot` - expected red on missing source-review doc; existing product primitive tests passed.
- `npx vitest run tests/gap1069ValidMindPolicyDriftBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts tests/governanceLineage.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/fleetGovernance.test.ts --reporter=dot` - passed, 8 files / 67 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow no-bloat scan over generic policy-drift, governance-lineage, fleet, watch, and compliance-doc files returned no ValidMind identifiers.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 916 files / 7,651 tests.
