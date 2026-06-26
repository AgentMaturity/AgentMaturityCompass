# GAP-1072 - OneTrust AI Governance post-hoc audit sampling

- Gap: `GAP-1072`
- Dimension: Post-hoc human audit sampling
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OneTrust AI Governance (`COMP-128`)
- Retrieval: Live HTTP and metadata review on `2026-06-25T06:56:40.000+05:30`
- Status: Done

## Relevance decision

OneTrust AI Governance is relevant to AMC as competitor context for AI governance workflows, AI risk, compliance automation, policy-driven controls, model and agent monitoring, data-use governance, third-party risk, audit readiness, and control operations. The backlog asks for sample plan, reviewed actions, findings, corrective action, and score impact proof. That maps directly to AMC's existing generic post-hoc human audit sampling receipt.

This gap does not justify a OneTrust integration, scraper, importer, adapter, GRC workflow clone, AI governance workflow clone, assessment clone, source-specific API route, or competitor parity claim. OneTrust is source-review context only; AMC must accept signed AMC-owned audit evidence and reject metadata-only OneTrust evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through signed score-impact rows created from reviewed actions and findings. No scoring semantics changed. |
| Shield | No Shield pack changed. Audit findings may reference safety/security issues, but this gap does not add a red-team subsystem. |
| Enforce | No runtime enforcement path changed. Corrective actions may reference enforcement regressions, but OneTrust metadata cannot enforce policy. |
| Vault | Relevant. The receipt can bind sensitive governance evidence to signed evidence references without adding a OneTrust connector. |
| Watch | No Watch monitor changed. Runtime evidence can be referenced in the audit sample evidence chain. |
| Fleet | No Fleet orchestration changed. Fleet-level actions can be sampled by the same generic receipt. |
| Passport | Relevant. Auditor-ready export preserves sample plan, reviewed actions, findings, corrective actions, score impact, evidence chain, and source citations. |
| Comply | Relevant. Post-hoc audit sampling strengthens compliance proof without changing the public methodology. |

## Product closure

No product code changed. Existing `src/audit/posthocAuditSampling.ts` already builds and verifies signed post-hoc audit sampling receipts with:

- sample plan
- reviewed actions
- findings
- corrective action
- score impact
- reviewer and policy metadata
- source citations
- signed evidence chain
- row and receipt hashes
- auditor-ready markdown export

Live source metadata checked:

- `https://www.onetrust.com/products/ai-governance/` returned HTTP/2 `301` to `https://www.onetrust.com/solutions/ai-governance/`.
- `https://www.onetrust.com/solutions/ai-governance/` returned HTTP/2 `200`.
- AI Governance title: `AI Governance Software | Solutions | OneTrust`.
- AI Governance description: `Manage AI risk, automate compliance, and enforce policy-driven controls across the AI lifecycle. OneTrust AI Governance software helps enterprises monitor models and agents while scaling responsible AI.`
- AI Governance headings included `Protect the ROI of AI`, `Catalog AI Systems and Assess Risk`, and `Programmatically Enforce Controls`.
- `https://www.onetrust.com/products/policy-management/` resolved to a live page titled `Compliance Automation | Products | OneTrust` and described compliance management resources and audit readiness.
- `https://www.onetrust.com/products/third-party-risk-management/` resolved to a live page titled `Third-Party Risk Management | Products | OneTrust`.
- `https://www.onetrust.com/products/data-discovery/` resolved to a live page titled `Data Use Governance | Solutions | OneTrust`.
- `https://www.onetrust.com/robots.txt` lists `https://www.onetrust.com/sitemap.xml` and does not block the reviewed product pages.

## Fail-closed rule

AMC must fail closed when a source citation, website title, redirect, product label, governance claim, AI workflow claim, or metadata-only OneTrust evidence replaces signed post-hoc audit evidence. A passing receipt requires a valid signed sample plan, reviewed action metadata, signed review evidence, evidence chain, source citations, findings for non-passing reviews, corrective actions for findings, score-impact rows, and valid row and receipt hashes.

## No-bloat boundary

No OneTrust connector, OneTrust importer, OneTrust scraper, GRC workflow clone, assessment workflow clone, AI governance workflow clone, policy-management clone, data-governance subsystem, source-specific compliance adapter, source-specific API route, upstream screenshots, upstream configs, upstream examples, or copied OneTrust implementation material were added. The test also scans generic audit, compliance, score, incident, and framework files to ensure OneTrust source identifiers do not leak into product implementation.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1072OneTrustPosthocAuditBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1072-onetrust-ai-governance-posthoc-audit.md` did not exist; 4 product-boundary tests passed.
- Focused test: `npx vitest run tests/gap1072OneTrustPosthocAuditBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Paired audit/compliance tests: `npx vitest run tests/gap1072OneTrustPosthocAuditBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 7 files / 34 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- No-bloat scan: `rg -n "OneTrust|onetrust\.com|COMP-128|onetrust_ai_governance_posthoc_audit" src/audit/posthocAuditSampling.ts src/audit/reviewerIndependence.ts src/compliance/controlCrosswalk.ts src/compliance/exceptionLifecycle.ts src/incidents/incidentTypes.ts src/score/scoreExplainer.ts docs/COMPLIANCE_FRAMEWORKS.md` returned no matches.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 919 files / 7665 tests.
