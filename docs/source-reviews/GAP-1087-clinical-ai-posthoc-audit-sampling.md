# GAP-1087 - clinical AI post-hoc audit sampling

- Gap: `GAP-1087`
- Dimension: Post-hoc human audit sampling
- AMC surfaces requested: Comply; Passport; Vault
- Source reviewed: `Large language models for clinical artificial intelligence in healthcare a systematic review`
- Retrieval: Live OpenAlex, DOI, Springer, and Crossref metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as governance context for post-hoc human audit sampling. Live metadata identifies the article as a 2026 review in `Discover Artificial Intelligence`; source metadata and landing-page facts point to clinical AI governance concerns including ethical governance, hallucinations, bias, privacy risks, and regulatory compliance.

GAP-1087 maps to AMC's existing Comply, Passport, and Vault primitive for signed post-hoc audit sampling. AMC should sample completed autonomous actions, preserve reviewed actions, record human findings, link each corrective action, and reflect any score impact through existing evidence receipts.

The source does not justify a clinical AI subsystem, clinical benchmark, paper importer, medical workflow, diagnosis helper, or healthcare-specific scoring path. The paper is source-review context only; AMC must reject metadata-only clinical paper evidence.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7125913448`
- OpenAlex API: `https://api.openalex.org/works/W7125913448`
- DOI: `https://doi.org/10.1007/s44163-025-00784-x`
- Springer article page: `https://link.springer.com/article/10.1007/s44163-025-00784-x`
- Crossref API: `https://api.crossref.org/works/10.1007/s44163-025-00784-x`
- Title: `Large language models for clinical artificial intelligence in healthcare a systematic review`
- Source: `Discover Artificial Intelligence`
- Publisher metadata: Springer Nature / Springer Science and Business Media LLC
- Publication date verified from live metadata: `2026-01-28`
- Open access metadata: gold open access with CC BY license metadata in OpenAlex/Crossref records

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through signed score impact rows when sampled action review changes maturity evidence. No scoring methodology change. |
| Shield | Adjacent only; clinical hallucinations or safety issues may appear in findings, but no Shield pack changed. |
| Enforce | Adjacent only; corrective actions may reference enforcement regressions, but this gap is retrospective audit proof. |
| Vault | Relevant because evidence refs, hashes, signatures, and receipt hashes preserve sensitive review lineage without embedding clinical payloads. |
| Watch | Adjacent only; completed action telemetry may feed the sampled population, but no live monitor changed. |
| Fleet | Adjacent only; sampled actions can identify agent IDs, but no fleet orchestrator changed. |
| Passport | Relevant because the audit export is portable proof of sample plan, reviewed actions, findings, corrective actions, score impact, and evidence chain. |
| Comply | Relevant because post-hoc human audit sampling supports governance, audit readiness, exception handling, and owner accountability. |

## Product closure

No product code changed. Existing `src/audit/posthocAuditSampling.ts` already provides AMC-owned post-hoc audit sampling receipts through:

- `buildPosthocAuditSamplingReceipt`
- `verifyPosthocAuditSamplingReceipt`
- `renderPosthocAuditSamplingAuditExport`

The existing primitive records sample plan proof, reviewed actions, reviewer decisions, evidence links, source citations, findings, corrective action rows, score impact rows, row hashes, evidence-chain hashes, receipt hashes, and auditor-ready markdown export. `tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts` closes GAP-1087 by proving the generic receipt handles a clinical AI sampled action without adding a clinical subsystem or paper-specific implementation.

## Fail-closed rule

metadata-only evidence fails closed. The OpenAlex ID, DOI, Springer page, Crossref metadata, article title, journal name, publication date, source topics, author names, ethical governance labels, hallucinations labels, bias labels, privacy risks labels, or regulatory compliance labels cannot replace signed AMC audit evidence.

A passing GAP-1087 claim requires a signed sample plan, completed reviewed actions, signed review evidence, evidence chain, source citations, findings for non-passing reviews, corrective action rows for findings, score impact rows, valid row hashes, valid evidence-chain hashes, and a valid receipt hash.

## No-bloat boundary

No clinical subsystem, clinical workflow, healthcare adapter, medical claim, paper importer, OpenAlex importer, Crossref importer, Springer importer, diagnosis module, triage module, benchmark clone, source-specific API route, source-specific CLI command, copied paper text, copied abstract, copied tables, copied examples, copied prompts, copied configs, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; the generic post-hoc audit behavior tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7125913448` returned the OpenAlex metadata recorded above.
  - `curl -sSI -L https://doi.org/10.1007/s44163-025-00784-x` resolved to the Springer article page.
  - `curl -sSL https://link.springer.com/article/10.1007/s44163-025-00784-x` returned Springer citation metadata for the article title, DOI, journal, date, and source facts.
  - `curl -sS https://api.crossref.org/works/10.1007/s44163-025-00784-x` returned Crossref metadata for the DOI, title, publisher, published-online date, and license facts.
- Focused test: `npx vitest run tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired audit regression: `npx vitest run tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1072OneTrustPosthocAuditBoundary.test.ts tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 5 files / 25 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 942 files / 7760 tests.
