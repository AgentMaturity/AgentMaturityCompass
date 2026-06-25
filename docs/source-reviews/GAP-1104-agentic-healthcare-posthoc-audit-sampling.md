# GAP-1104 - agentic healthcare post-hoc audit sampling

- Gap: `GAP-1104`
- Dimension: Post-hoc human audit sampling
- AMC surfaces requested: Comply; Passport; Vault
- Source reviewed: `Exploring Agentic AI in Healthcare: A Study on Its Working Mechanism`
- Retrieval: Live OpenAlex, DOI, Frontiers, and Crossref metadata review on `2026-06-25`
- Status: Done

## Relevance decision

The source is relevant to AMC as governance context for post-hoc human audit sampling of completed agent actions in healthcare settings. Live metadata identifies the work as a `2026-01-28` article in `Frontiers in Medicine`, published by `Frontiers Media SA`, with the DOI resolving to the Frontiers article page.

GAP-1104 maps to AMC's existing Comply, Passport, and Vault primitive for signed post-hoc audit sampling. AMC already needs sampled completed actions, human review decisions, findings, corrective action ownership, score impact, and evidence lineage for auditor-ready governance proof.

The source does not justify a healthcare-agent subsystem, clinical workflow, medical advice feature, Frontiers/OpenAlex importer, DOI adapter, paper-specific scoring path, or source-specific audit engine. The paper is source-review context only; AMC must reject metadata-only paper evidence.

## Source retrieval

- OpenAlex work: `https://openalex.org/W7125926542`
- OpenAlex API: `https://api.openalex.org/works/W7125926542`
- DOI: `https://doi.org/10.3389/fmed.2025.1753443`
- Frontiers article page: `https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2025.1753443/full`
- Crossref API: `https://api.crossref.org/works/10.3389/fmed.2025.1753443`
- Title: `Exploring Agentic AI in Healthcare: A Study on Its Working Mechanism`
- Source: `Frontiers in Medicine`
- Publisher metadata: `Frontiers Media SA`
- Publication date verified from live metadata: `2026-01-28`
- OpenAlex access metadata: `gold`
- OpenAlex author count metadata: `4`
- Frontiers article first 200 KB SHA-256: `5ac31942b3118570af782ae4add6e4b6167162ad90c2c2df5e6439309ca85186`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through signed score impact rows when sampled action review changes maturity evidence. No scoring methodology change. |
| Shield | Adjacent only; safety findings may be recorded, but this gap does not add a Shield workflow. |
| Enforce | Adjacent only; corrective actions can reference enforcement regressions, but this gap is retrospective audit proof. |
| Vault | Relevant because signed evidence refs, row hashes, evidence-chain hashes, and receipt hashes preserve sensitive review lineage without embedding healthcare payloads. |
| Watch | Adjacent only; completed action telemetry may define the sample population, but no live monitor changed. |
| Fleet | Adjacent only; sampled actions retain agent IDs, but no fleet orchestrator changed. |
| Passport | Relevant because the audit export is portable proof of sample plan, reviewed actions, findings, corrective actions, score impact, and evidence chain. |
| Comply | Relevant because post-hoc human audit sampling supports governance, audit readiness, exception handling, and accountable remediation. |

## Product closure

No product code changed. Existing `src/audit/posthocAuditSampling.ts` already provides AMC-owned post-hoc audit sampling receipts through:

- `buildPosthocAuditSamplingReceipt`
- `verifyPosthocAuditSamplingReceipt`
- `renderPosthocAuditSamplingAuditExport`

The existing primitive records sample plan proof, reviewed actions, reviewer decisions, evidence links, source citations, findings, corrective action rows, score impact rows, row hashes, evidence-chain hashes, receipt hashes, and auditor-ready markdown export. `tests/gap1104AgenticHealthcarePosthocAuditSamplingBoundary.test.ts` closes GAP-1104 by proving the generic receipt handles a sampled healthcare-agent action without adding a healthcare subsystem or paper-specific implementation.

## Fail-closed rule

metadata-only evidence fails closed. The OpenAlex ID, DOI, Frontiers page, Crossref metadata, article title, journal name, publisher name, publication date, author count, open-access metadata, backlog row, source topics, or page hash cannot replace signed AMC audit evidence.

A passing GAP-1104 claim requires a signed sample plan, completed reviewed actions, signed review evidence, evidence chain, source citations, findings for non-passing reviews, corrective action rows for findings, score impact rows, valid row hashes, valid evidence-chain hashes, and a valid receipt hash.

## No-bloat boundary

No healthcare subsystem, clinical workflow, medical advice feature, healthcare adapter, paper importer, OpenAlex importer, Crossref importer, Frontiers importer, DOI adapter, diagnosis module, triage module, benchmark clone, source-specific API route, source-specific CLI command, methodology bump, copied paper text, copied abstract, copied tables, copied examples, copied prompts, copied configs, or copied upstream outputs were added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1104AgenticHealthcarePosthocAuditSamplingBoundary.test.ts --reporter=dot` failed only because this source-review document did not exist; the generic post-hoc audit behavior tests passed.
- Live source checks:
  - `curl -L --max-time 20 -s https://api.openalex.org/works/W7125926542` returned the OpenAlex metadata recorded above.
  - `curl -I -L --max-time 20 -s https://doi.org/10.3389/fmed.2025.1753443` resolved to the Frontiers article page.
  - `curl -L --max-time 20 -s https://api.crossref.org/works/10.3389/fmed.2025.1753443` returned Crossref metadata for the DOI, title, publisher, journal, and publication date.
  - `curl -L --max-time 20 -s https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2025.1753443/full | head -c 200000 | shasum -a 256` returned the hash recorded above.
- Focused test: `npx vitest run tests/gap1104AgenticHealthcarePosthocAuditSamplingBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired audit regression: `npx vitest run tests/gap1104AgenticHealthcarePosthocAuditSamplingBoundary.test.ts tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts tests/gap1072OneTrustPosthocAuditBoundary.test.ts tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 6 files / 29 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 998 files / 8,006 tests.
- Linear: `AMC-1423`.
