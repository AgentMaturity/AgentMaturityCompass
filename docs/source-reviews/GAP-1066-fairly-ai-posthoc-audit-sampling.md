# GAP-1066 - Fairly AI post-hoc human audit sampling

- Gap: `GAP-1066`
- Dimension: `human-posthoc-audit`
- AMC surfaces requested: Comply; Passport; Vault
- Source reviewed: Fairly AI / Asenion official website
- Retrieval: 2026-06-25 live `curl` checks against `https://www.fairly.ai` and `https://asenion.ai`
- Status: Done

Post-hoc human audit sampling is relevant to AMC only when it produces signed, source-cited evidence about completed autonomous actions, human review findings, corrective actions, and score impact.

## Relevance decision

Fairly AI is relevant as competitor governance, risk, compliance, audit, oversight, documentation, trust-center, incident-reporting, and enterprise-agent-management context only. The current official site redirects `https://www.fairly.ai` to `https://asenion.ai`, and the Asenion pages position the product around AI Governance, Risk and Compliance, oversight, Audit, Risk, Documentation, incident reporting, trust, and enterprise agent management.

AMC closure is a generic post-hoc human audit sampling receipt for existing Comply, Passport, and Vault evidence paths. It samples completed autonomous actions for human review, records findings, links corrective actions, and records signed score impact evidence. Fairly AI / Asenion website metadata alone fails closed.

## Source retrieval

- Original backlog source: `https://www.fairly.ai`
- Current official home: `https://asenion.ai`
- Governance platform: `https://asenion.ai/ai-governance-platform`
- AI TRiSM: `https://asenion.ai/ai-trism`
- Incident Reporting: `https://asenion.ai/incident-reporting`
- Trust center: `https://asenion.ai/trust/fairly-ai`
- Enterprise Agent Management: `https://asenion.ai/enterprise-agent-management`

Live metadata checked:

- `https://www.fairly.ai` returned HTTP/2 `301` to `https://www.asenion.ai/`, then to `https://asenion.ai/`.
- `https://asenion.ai` returned HTTP/2 `200`, Cloudflare/Webflow headers, and `last-modified: Wed, 24 Jun 2026 10:53:16 GMT`.
- Homepage title: `Asenion | AI Governance, Risk and Compliance Management Platform`
- Governance-platform title: `Asenion | AI Governance Platform`
- Incident-reporting title: `AI Incident Reporting Form | Fairly AI`
- Sitemap listed `ai-governance-platform`, `ai-trism`, `incident-reporting`, `third-party-risk-assessment`, `trust/fairly-ai`, `enterprise-agent-management`, `product/premium`, and `product/pro`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only: signed score-impact rows make audit findings visible to diagnostic scoring; no scoring methodology change. |
| Shield | Out of scope for this gap; audit sampling can surface security findings but does not add a red-team pack. |
| Enforce | Out of scope for this gap; corrective actions may reference enforcement regressions but no runtime guardrail changes were added. |
| Vault | Relevant: signed evidence refs, row hashes, receipt hash, and evidence-chain hashes preserve audit evidence integrity. |
| Watch | Out of scope for this gap; no live monitoring adapter or alerting workflow was added. |
| Fleet | Out of scope for this gap; no fleet orchestrator or source-specific agent registry was added. |
| Passport | Relevant: the receipt can be exported as portable audit proof for sampled action reviews. |
| Comply | Relevant: the receipt maps post-hoc audit samples, findings, corrective actions, and score impacts to governance/compliance evidence. |

## Product closure

Added a generic AMC-owned post-hoc audit sampling primitive in `src/audit/posthocAuditSampling.ts`, exported it from `src/index.ts`, documented it in `docs/COMPLIANCE_FRAMEWORKS.md`, and covered it with `tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts`.

The primitive requires:

- sample plan proof;
- reviewed actions proof;
- findings proof;
- corrective action proof;
- score impact proof;
- source citations;
- evidence refs;
- row hashes, receipt hash, and evidence-chain hash.

## Fail-closed rule

Metadata-only evidence fails closed. Fairly AI / Asenion page titles, redirect behavior, sitemap URLs, product labels, trust-center text, policy names, or unsigned review notes cannot satisfy post-hoc human audit sampling proof.

Verification rejects missing or unsigned sample plans, missing reviewed-action metadata, unsigned review evidence, missing evidence lineage, non-passing reviews with no findings, findings with no corrective actions, missing score impact rows, unknown source citations, and row or receipt hash mismatches.

## No-bloat boundary

No Fairly AI or Asenion integration, scraper, importer, adapter, workflow clone, governance-platform subsystem, source-specific API route, competitor parity claim, copied page prose, copied screenshots, copied examples, copied prompts, copied configs, or generated upstream outputs were added.

## Verification

- `curl -sSIL https://www.fairly.ai | sed -n '1,120p'` - passed; official source redirected from Fairly AI to Asenion and final site returned HTTP/2 `200`.
- `curl -sSIL https://www.asenion.ai | sed -n '1,120p'` - passed; Asenion redirected to `https://asenion.ai/` and final site returned HTTP/2 `200`.
- `curl -sSL https://asenion.ai | /opt/homebrew/bin/rg ...` - passed; parsed homepage title, description metadata, and governance/risk/compliance/audit labels.
- `curl -sSL https://asenion.ai/robots.txt | sed -n '1,160p'` - passed; sitemap listed.
- `curl -sSL https://asenion.ai/sitemap.xml | sed -n '1,180p'` - passed; governance, incident, trust, and agent-management routes listed.
- Page fetch loop for `https://asenion.ai/ai-governance-platform`, `https://asenion.ai/ai-trism`, `https://asenion.ai/incident-reporting`, `https://asenion.ai/third-party-risk-assessment`, `https://asenion.ai/enterprise-agent-management`, `https://asenion.ai/trust/fairly-ai`, `https://asenion.ai/product/premium`, and `https://asenion.ai/product/pro` - passed; titles and governance/audit/risk/documentation labels parsed.
- `npx vitest run tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` - expected red on missing `src/audit/posthocAuditSampling.ts`.
- `npx vitest run tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` - passed, 1 file / 5 tests.
- `npx vitest run tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts --reporter=dot` - passed, 8 files / 49 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Narrow no-bloat scan over generic audit, compliance, score, incident, and compliance-doc files returned no Fairly AI or Asenion source identifiers.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 913 files / 7,638 tests.
