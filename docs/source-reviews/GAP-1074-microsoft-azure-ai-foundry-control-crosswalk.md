# GAP-1074 - Microsoft Azure AI Foundry control crosswalk

- Gap: `GAP-1074`
- Dimension: Control crosswalk coverage
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: Microsoft Azure AI Foundry / Microsoft Foundry (`COMP-130`)
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:13:19.000+05:30`
- Status: Done

## Relevance decision

Microsoft Foundry is relevant to AMC as competitor context for enterprise AI platform governance, agent governance, model selection, evaluation, real-time monitoring, trust controls, responsible AI documentation, and control operations. The backlog asks for framework clause, AMC question IDs, evidence type, owner, and exception state proof across NIST AI RMF, ISO 42001, EU AI Act, SOC 2, and sector obligations. That maps directly to AMC's existing generic control-crosswalk receipt.

This gap does not justify a Microsoft integration, Azure adapter, scraper, importer, Foundry clone, evaluation clone, agent-control-plane clone, source-specific API route, or competitor parity claim. Microsoft Foundry is source-review context only; AMC must accept signed AMC-owned crosswalk evidence and reject metadata-only Microsoft Foundry evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing AMC question IDs and control evidence types. No scoring semantics changed. |
| Shield | No Shield pack changed. Control rows can cite safety evidence when present, but this gap does not add a red-team workflow. |
| Enforce | No runtime enforcement path changed. Exception state can reference enforcement evidence, but Foundry metadata cannot approve exceptions. |
| Vault | Relevant. Control evidence references can bind sensitive compliance evidence without adding a Microsoft connector. |
| Watch | No Watch monitor changed. Monitoring evidence can be referenced by the generic crosswalk receipt. |
| Fleet | No Fleet topology changed. Agent governance context can use the same generic crosswalk rows. |
| Passport | Relevant. Auditor-ready export preserves framework clause, AMC question IDs, evidence type, owner, exception state, evidence chain, and source citations. |
| Comply | Relevant. Control crosswalk receipts strengthen compliance proof without changing public methodology. |

## Product closure

No product code changed. Existing `src/compliance/controlCrosswalk.ts` already builds and verifies signed control crosswalk receipts with:

- framework clause
- AMC question IDs
- evidence type
- owner
- exception state
- source citations
- signed evidence chain
- row and receipt hashes
- auditor-ready markdown export

Live source metadata checked:

- `https://azure.microsoft.com/products/ai-foundry` resolved with HTTP `200` to `https://azure.microsoft.com/en-us/products/ai-foundry`.
- `https://azure.microsoft.com/en-us/products/ai-foundry` returned HTTP `200`.
- Product title: `Microsoft Foundry | Microsoft Azure`.
- Product description: `Kickstart innovation with Microsoft Foundry, the AI app and agent factory designed to accelerate AI-driven, cloud-native development across industries.`
- Product headings included `The AI app and agent factory`, `Build, connect, and scale intelligent agents`, `Govern every agent, tool, and knowledge source from a unified control plane`, `Monitor, evaluate, and optimize every agent in real-time`, and `Protect every agent with customizable trust controls`.
- `https://learn.microsoft.com/en-us/azure/foundry/what-is-foundry` returned HTTP `200` with title `What is Microsoft Foundry? - Microsoft Foundry | Microsoft Learn`.
- `https://learn.microsoft.com/en-us/azure/foundry/responsible-use-of-ai-overview` returned HTTP `200` with title `Responsible AI for Microsoft Foundry - Microsoft Foundry | Microsoft Learn`.
- `https://azure.microsoft.com/robots.txt` and `https://learn.microsoft.com/robots.txt` list sitemap locations and do not block the reviewed product or Learn pages.

## Fail-closed rule

AMC must fail closed when a source citation, product title, Learn title, product description, heading, governance claim, evaluation claim, monitoring claim, trust-control claim, or metadata-only Microsoft Foundry evidence replaces signed control-crosswalk evidence. A passing receipt requires source citations, mapped framework clauses, AMC question IDs, evidence types, owners, signed evidence refs, exception signatures when exceptions exist, evidence chain hashes, and valid row and receipt hashes.

## No-bloat boundary

No Microsoft connector, Azure adapter, Azure AI Foundry integration, Microsoft Foundry importer, scraper, control-plane clone, evaluation clone, source-specific compliance adapter, source-specific API route, upstream screenshots, upstream configs, upstream examples, or copied Microsoft implementation material were added. The test also scans generic control-crosswalk, mappings, score, and framework files to ensure Microsoft Foundry source identifiers do not leak into product implementation.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1074MicrosoftAzureAiFoundryControlCrosswalkBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1074-microsoft-azure-ai-foundry-control-crosswalk.md` did not exist; 3 product-boundary tests passed.
- Focused test: `npx vitest run tests/gap1074MicrosoftAzureAiFoundryControlCrosswalkBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired control-crosswalk/compliance tests: `npx vitest run tests/gap1074MicrosoftAzureAiFoundryControlCrosswalkBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/gap1062FloodWarningControlCrosswalkBoundary.test.ts tests/gap1071BigIdExceptionLifecycleBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 7 files / 32 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- No-bloat scan: `rg -n "Azure AI Foundry|Microsoft Foundry|azure\.microsoft\.com|learn\.microsoft\.com/en-us/azure/foundry|COMP-130|microsoft_azure_ai_foundry_control_crosswalk" src/compliance/controlCrosswalk.ts src/compliance/builtInMappings.ts src/score/index.ts docs/COMPLIANCE_FRAMEWORKS.md` returned no matches.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 921 files / 7673 tests.
