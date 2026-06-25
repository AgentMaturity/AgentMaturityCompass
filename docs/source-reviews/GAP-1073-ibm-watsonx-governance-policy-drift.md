# GAP-1073 - IBM watsonx.governance policy drift

- Gap: `GAP-1073`
- Dimension: Policy drift and change impact
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: IBM watsonx.governance (`COMP-129`)
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:04:51.000+05:30`
- Status: Done

## Relevance decision

IBM watsonx.governance is relevant to AMC as competitor context for AI governance, risk and compliance, lifecycle governance, governance graph exposure assessment, enforceable controls, monitoring, changing regulation management, and audit workflows. The backlog asks for policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, and rollout receipt proof. That maps directly to AMC's existing generic signed policy-drift impact receipt.

This gap does not justify an IBM integration, scraper, importer, adapter, model-governance clone, workflow clone, source-specific API route, or competitor parity claim. IBM is source-review context only; AMC must accept signed AMC-owned policy drift evidence and reject metadata-only IBM evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Score can consume policy-drift score impact only through existing signed evidence paths. |
| Shield | No Shield runtime changed. Policy drift can trigger assurance rechecks, but this gap does not add a red-team pack. |
| Enforce | No runtime enforcement path changed. Rollout receipts and affected controls can reference Enforce evidence, but IBM metadata cannot enforce policy. |
| Vault | Relevant. Policy drift evidence can include sensitive rollout and rollback references without adding an IBM connector. |
| Watch | Relevant through existing policy monitoring context; no new Watch monitor was added. |
| Fleet | Relevant through affected agent lists and rollout recheck ownership; no new Fleet topology was added. |
| Passport | Relevant. Auditor-ready exports preserve policy diff, affected agents, controls, tests, prior decisions, recheck list, rollout receipt, evidence chain, and source citations. |
| Comply | Relevant. Policy drift impact receipts strengthen compliance proof without changing public methodology. |

## Product closure

No product code changed. Existing `src/compliance/policyDrift.ts` already builds and verifies signed policy drift impact receipts with:

- policy diff
- affected agents
- affected tests
- affected controls
- prior decisions
- recheck list
- rollout receipt
- source citations
- signed evidence chain
- row and receipt hashes
- auditor-ready markdown export

Live source metadata checked:

- `https://www.ibm.com/products/watsonx-governance` returned HTTP/2 `200`.
- Product title: `IBM watsonx.governance`.
- Product description: `Learn how you can direct, manage and monitor your AI with watsonx.governance, a single platform to speed responsible, transparent, explainable AI. Find out how you can address risks that AI presents, adhere and adapt to changing regulations, and help manage the complete AI lifecycle governance.`
- Page headings included `Accelerate ROI with smarter AI governance, risk and compliance`, `Governance Graph`, `Control`, `Closing the loop between intent and reality`, and `AI governance in action`.
- `https://www.ibm.com/products/watsonx-governance/pricing` returned a live page titled `IBM watsonx.governance | Pricing`.
- `https://www.ibm.com/products/watsonx-governance/trial` returned a live page titled `IBM watsonx.governance`.
- `https://www.ibm.com/robots.txt` lists IBM sitemap locations and does not block the reviewed product pages.

## Fail-closed rule

AMC must fail closed when a source citation, website title, product description, heading, lifecycle-governance claim, regulation-management claim, or metadata-only IBM evidence replaces signed policy drift evidence. A passing receipt requires a signed policy diff, affected agent evidence, affected control evidence, affected test evidence, prior-decision evidence, recheck list, rollout receipt, source citations, evidence chain, and valid row and receipt hashes.

## No-bloat boundary

No IBM connector, IBM importer, IBM scraper, watsonx adapter, model-governance clone, governance graph clone, workflow clone, source-specific compliance adapter, source-specific API route, upstream screenshots, upstream configs, upstream examples, or copied IBM implementation material were added. The test also scans generic compliance, claims, fleet, Watch, and framework files to ensure IBM source identifiers do not leak into product implementation.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1073-ibm-watsonx-governance-policy-drift.md` did not exist; 3 product-boundary tests passed.
- Focused test: `npx vitest run tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired policy-drift/compliance tests: `npx vitest run tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 7 files / 32 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- No-bloat scan: `rg -n "IBM|ibm\.com|watsonx\.governance|COMP-129|ibm_watsonx_governance_policy_drift" src/compliance/policyDrift.ts src/claims/governanceLineage.ts src/fleet/governance.ts src/watch/policyPacks.ts docs/COMPLIANCE_FRAMEWORKS.md` returned no matches.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 920 files / 7669 tests.
