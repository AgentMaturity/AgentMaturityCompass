# GAP-1071 - BigID exception lifecycle

- Gap: `GAP-1071`
- Dimension: Exception and waiver lifecycle
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: BigID (`COMP-127`)
- Retrieval: Live HTTP and sitemap review on `2026-06-25T06:48:33.000+05:30`
- Status: Done

## Relevance decision

BigID is relevant to AMC as competitor context for enterprise data security, data governance, privacy operations, AI governance, compliance, data classification, secrets security, and audit workflows. The backlog asks for exception request, approver, expiry, compensating control, and renewal outcome proof. That maps directly to AMC's existing generic governance exception lifecycle receipt and the generic control-crosswalk receipt.

This gap does not justify a BigID integration, crawler, importer, adapter, privacy-ops clone, DSPM subsystem, source-specific policy workflow, or source-specific API surface. BigID is source-review context only; AMC must accept signed AMC-owned evidence and reject metadata-only BigID evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Score can consume the existing signed control and exception receipts when they are present. |
| Shield | No Shield runtime changed. Signed exception evidence can support assurance review where a waiver touches safety or security controls. |
| Enforce | No new enforcement path. Existing Enforce outputs can be referenced as signed evidence, but BigID metadata cannot authorize a waiver. |
| Vault | Relevant. The receipt can bind privacy, secrets, data classification, and retention exceptions to signed evidence without adding a BigID connector. |
| Watch | No Watch monitor changed. Watch evidence may be included in the evidence chain when available. |
| Fleet | No Fleet orchestration changed. Fleet context can cite the same generic exception lifecycle receipt. |
| Passport | Relevant. Auditor-ready exports preserve owner, approver, expiry, renewal, compensating control, evidence chain, and source citations. |
| Comply | Relevant. The exception lifecycle and control crosswalk already cover governance and audit readiness for source-cited obligations. |

## Product closure

No product code changed. Existing `src/compliance/exceptionLifecycle.ts` already builds and verifies signed governance exception lifecycle receipts with:

- exception request
- approver
- expiry
- compensating control
- renewal outcome
- owner
- signed evidence chain
- source citations
- auditor-ready markdown export

Existing `src/compliance/controlCrosswalk.ts` already keeps signed exception states compatible with mapped compliance controls. The closure adds a regression test proving those generic primitives satisfy GAP-1071 for BigID source context while staying source-neutral.

Live source metadata checked:

- `https://bigid.com` returned HTTP/2 `200`.
- Homepage title: `BigID: Enterprise Data Security Platform for DSPM &amp; AI`.
- Homepage description: `BigID delivers enterprise data security, DSPM, and AI governance to discover, classify, and protect sensitive data across cloud, on-prem, and AI systems. Trusted by Fortune 500.`
- `https://bigid.com/robots.txt` includes OpenAI crawler allow rules and lists `https://bigid.com/sitemap_index.xml`.
- `https://bigid.com/sitemap_index.xml` lists `https://bigid.com/page-sitemap.xml`.
- Valid `page-sitemap.xml` routes checked:
  - `https://bigid.com/ai/` - `AI | BigID`
  - `https://bigid.com/bigid-compliance/` - `BigID Compliance | BigID`
  - `https://bigid.com/bigid-security/` - `BigID Security | BigID`
  - `https://bigid.com/privacy-ops/` - `Privacy Ops | BigID`
  - `https://bigid.com/data-classification/` - `Data Classification | BigID`
  - `https://bigid.com/secrets-security/` - `Secrets Security | BigID`
  - `https://bigid.com/operationalize-privacy/` - `Operationalize Privacy | BigID`
  - `https://bigid.com/privacy/pi-pii-inventory/` - `PI/PII Inventory | BigID`
  - `https://bigid.com/compliance/compare-us-privacy-regulations/` - `Compare US Data Privacy Regulations by State | BigID`

## Fail-closed rule

AMC must fail closed when a source citation, website title, sitemap entry, marketing claim, or metadata-only BigID evidence replaces signed lifecycle evidence. A passing exception lifecycle receipt requires policy ID, control ID, owner, requester, signed request evidence, approver, signed approval evidence, expiry check, signed expiry evidence, compensating control evidence, renewal decision evidence, source citations, and a signed evidence chain.

## No-bloat boundary

No BigID connector, BigID importer, BigID crawler, DSPM clone, privacy-ops workflow clone, secrets-security subsystem, source-specific compliance adapter, source-specific API route, upstream screenshots, upstream configs, upstream examples, or copied BigID implementation material were added. The test also scans generic compliance, enforcement, incident, and framework files to ensure BigID source identifiers do not leak into product implementation.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1071BigIdExceptionLifecycleBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1071-bigid-exception-lifecycle.md` did not exist; 4 product-boundary tests passed.
- Focused test: `npx vitest run tests/gap1071BigIdExceptionLifecycleBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Paired compliance tests: `npx vitest run tests/gap1071BigIdExceptionLifecycleBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 7 files / 33 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- No-bloat scan: `rg -n "BigID|bigid\.com|COMP-127|bigid_exception_lifecycle" src/compliance/exceptionLifecycle.ts src/compliance/controlCrosswalk.ts src/compliance/providerRisk.ts src/enforce/policyFirewall.ts src/incidents/incidentTypes.ts docs/COMPLIANCE_FRAMEWORKS.md` returned no matches.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 918 files / 7660 tests.
