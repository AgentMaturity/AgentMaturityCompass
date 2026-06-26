# GAP-1067 - Holistic AI policy drift and change impact

- Gap: `GAP-1067`
- Dimension: `gov-policy-drift`
- AMC surfaces requested: Comply; Passport; Vault
- Source reviewed: Holistic AI official website
- Retrieval: 2026-06-25 live `curl` checks against `https://www.holisticai.com`
- Status: Done

Policy drift and change impact is relevant to AMC only when policy changes produce signed, source-cited evidence about the policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, rollout receipt, and evidence lineage.

## Relevance decision

Holistic AI is relevant as competitor governance, risk, compliance, audit, evidence, policy, inventory, workflow, monitoring, regulatory-alignment, operational-alignment, and Guardian Agents context only. The official site positions Holistic AI around AI governance, compliance workflows, audit evidence, policies, approval workflows, inventory, Regulatory Alignment, Operational Alignment, and Guardian Agents.

AMC closure is a generic policy drift and change-impact receipt for existing Comply, Passport, and Vault evidence paths. It proves whether a policy change invalidates prior decisions, which agents/tests/controls are affected, which rechecks are required, and which signed rollout receipt authorizes the change. Holistic AI website metadata alone fails closed.

## Source retrieval

- Homepage: `https://www.holisticai.com`
- Governance platform: `https://www.holisticai.com/ai-governance-platform`
- Operational Alignment: `https://www.holisticai.com/operational-alignment`
- Regulatory Alignment: `https://www.holisticai.com/regulatory-alignment`
- Enforce: `https://www.holisticai.com/enforce`
- Guardian Agents: `https://www.holisticai.com/guardian-agents`
- AI Inventory: `https://www.holisticai.com/ai-inventory`
- AI Audits: `https://www.holisticai.com/ai-audits`
- AI Risk Management: `https://www.holisticai.com/ai-risk-management`

Live metadata checked:

- `https://www.holisticai.com` returned HTTP/2 `200`, Cloudflare/Webflow headers, and `last-modified: Sat, 20 Jun 2026 12:27:19 GMT`.
- Homepage title, normalized: `Holistic AI - The Leading AI Governance Platform`
- Governance-platform title: `An End to End AI Governance Platform - Holistic AI`
- Operational-alignment title: `Empower Teams with Aligned, Embedded Governance - Holistic AI`
- Additional page titles included Guardian Agents, AI Inventory, AI Audits, AI Risk Management, Enforce, and Regulatory Alignment context.
- Sitemap listed `ai-governance-platform`, `operational-alignment`, `regulatory-alignment`, `enforce`, `guardian-agents`, `ai-inventory`, `ai-audits`, and `ai-risk-management`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only: affected tests and prior decisions can trigger rescoring, but no scoring methodology changed. |
| Shield | Out of scope for this gap; policy drift can affect security controls, but no red-team pack was added. |
| Enforce | Out of scope for this gap; the receipt can reference rollout gates, but no runtime policy engine changed. |
| Vault | Relevant: signed evidence refs, policy hashes, row hashes, receipt hash, and evidence-chain hashes preserve audit evidence integrity. |
| Watch | Out of scope for this gap; no monitoring adapter or alerting workflow was added. |
| Fleet | Indirect only: affected agents are recorded, but no fleet orchestrator changed. |
| Passport | Relevant: the receipt can be exported as portable policy-change proof. |
| Comply | Relevant: the receipt maps policy diffs, controls, prior decisions, rechecks, and rollout receipts to governance/compliance evidence. |

## Product closure

Added a generic AMC-owned policy drift impact primitive in `src/compliance/policyDrift.ts`, exported it from `src/index.ts`, documented it in `docs/COMPLIANCE_FRAMEWORKS.md`, and covered it with `tests/gap1067HolisticAiPolicyDriftBoundary.test.ts`.

The primitive requires:

- policy diff proof;
- affected agents proof;
- affected tests proof;
- affected controls proof;
- prior decisions proof;
- recheck list proof;
- rollout receipt proof;
- source citations;
- evidence refs;
- row hashes, receipt hash, and evidence-chain hash.

## Fail-closed rule

Metadata-only evidence fails closed. Holistic AI page titles, sitemap URLs, product labels, policy names, Guardian Agents labels, inventory text, or unsigned impact notes cannot satisfy policy drift proof.

Verification rejects missing or unsigned policy diffs, missing affected agents, missing affected controls, missing affected tests, missing prior decisions, missing recheck items, missing or unsigned rollout proof, missing evidence lineage, unknown source citations, and row or receipt hash mismatches.

## No-bloat boundary

No Holistic AI integration, scraper, importer, adapter, workflow clone, governance-platform subsystem, source-specific API route, competitor parity claim, copied page prose, copied screenshots, copied examples, copied prompts, copied configs, or generated upstream outputs were added.

## Verification

- `curl -sSIL https://www.holisticai.com | sed -n '1,120p'` - passed; official homepage returned HTTP/2 `200`.
- `curl -sSL https://www.holisticai.com | /opt/homebrew/bin/rg ...` - passed; parsed homepage title, description metadata, and governance/risk/compliance/audit/policy labels.
- `curl -sSL https://www.holisticai.com/robots.txt | sed -n '1,160p'` - passed; sitemap listed.
- `curl -sSL https://www.holisticai.com/sitemap.xml | sed -n '1,180p'` - passed; governance, enforcement, inventory, audit, risk, and alignment routes listed.
- Page fetch loop for `https://www.holisticai.com/ai-governance-platform`, `https://www.holisticai.com/operational-alignment`, `https://www.holisticai.com/regulatory-alignment`, `https://www.holisticai.com/enforce`, `https://www.holisticai.com/guardian-agents`, `https://www.holisticai.com/ai-inventory`, `https://www.holisticai.com/ai-audits`, and `https://www.holisticai.com/ai-risk-management` - passed; titles and governance/audit/risk/policy/inventory labels parsed.
- `npx vitest run tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot` - expected red on missing `src/compliance/policyDrift.ts`.
- `npx vitest run tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot` - passed, 1 file / 5 tests.
- `npx vitest run tests/gap1067HolisticAiPolicyDriftBoundary.test.ts tests/governanceLineage.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/fleetGovernance.test.ts --reporter=dot` - passed, 8 files / 67 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- No-bloat scan across `src/compliance/policyDrift.ts`, `src/claims/governanceLineage.ts`, `src/fleet/governance.ts`, `src/watch/policyPacks.ts`, and `docs/COMPLIANCE_FRAMEWORKS.md` - passed; no Holistic AI identifiers in generic product files.
- `npm run typecheck` - passed.
- `npm test -- --reporter=dot` - passed, 914 files / 7,643 tests.
