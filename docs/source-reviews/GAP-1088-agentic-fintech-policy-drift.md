# GAP-1088 - Agentic FinTech policy drift

- Gap: `GAP-1088`
- Dimension: Policy drift and change impact
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7127378038`, OpenAlex API `https://api.openalex.org/works/W7127378038`, DOI `https://doi.org/10.2139/ssrn.6136529`, Crossref API `https://api.crossref.org/works/10.2139/ssrn.6136529`, SSRN redirect target `https://www.ssrn.com/abstract=6136529`, and SSRN papers URL `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6136529`
- Retrieval: Live OpenAlex, DOI, Crossref, and SSRN metadata review on `2026-06-25T16:43:27.000Z`
- Status: Done

## Relevance decision

`Agentic FinTech: A Comprehensive Survey on AI Agents in Finance in the Era of LLMs` is relevant to AMC only as policy drift and change-impact context for finance agents and high-risk financial workflows. The source metadata concerns finance, financial risk, financial services, economics, and financial markets, so it can inform when policy changes should invalidate prior finance-agent rollout approvals and trigger rechecks.

The source does not justify a FinTech subsystem, trading engine, portfolio advisor, financial-advice module, SSRN importer, OpenAlex importer, DOI adapter, source-specific policy pack, source-specific route, source-specific CLI command, or copied paper content. GAP-1088 maps to AMC's existing generic policy drift receipt, which already records policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, rollout receipt, signed evidence refs, hashes, and auditor-ready export.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7127378038`
- OpenAlex API: `https://api.openalex.org/works/W7127378038`
- DOI: `https://doi.org/10.2139/ssrn.6136529`
- Crossref API: `https://api.crossref.org/works/10.2139/ssrn.6136529`
- SSRN redirect target: `https://www.ssrn.com/abstract=6136529`
- SSRN papers URL: `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6136529`
- Title: `Agentic FinTech: A Comprehensive Survey on AI Agents in Finance in the Era of LLMs`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-01-01`
- OpenAlex type `preprint`
- Crossref type `posted-content`
- Crossref created date `2026-02-03T14:53:31Z`
- Source: `SSRN Electronic Journal`
- Crossref publisher: `Elsevier BV`
- OpenAlex open access status: `green`
- OpenAlex author count metadata: `2`
- Crossref authors include `Yaxiong Wu` and `Yixuan Li`.
- OpenAlex concepts include `Finance`, `Financial risk`, `Financial services`, `Economics`, `Financial literacy`, `Business`, and `Financial market`.
- DOI request returned HTTP/2 `302` to `https://www.ssrn.com/abstract=6136529`, followed by HTTP/2 `403` from this environment.
- SSRN papers URL request returned HTTP/2 `403` from this environment.
- SSRN papers URL first 200 KB SHA-256 in this environment: `052c9a3d453ebbbcc96a51cc1afe562aaa86969b22fd7e25b8d943074caa4a8d`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because policy drift can invalidate prior score evidence and require recheck or score-impact evidence. No scoring semantics changed. |
| Shield | Relevant only when finance-agent safety or fraud-risk controls are cited as signed evidence. No Shield pack changed. |
| Enforce | Adjacent only; this gap closes pre-rollout policy-change proof rather than runtime enforcement. |
| Vault | Relevant because policy drift receipts preserve signed evidence refs and hashes without embedding financial payloads, customer data, or paper content. |
| Watch | Relevant because affected finance-agent policies can require monitoring and recheck proof. No Watch monitor changed. |
| Fleet | Relevant because affected agent IDs, environments, and required policy versions are preserved. |
| Passport | Relevant because the audit export preserves portable policy diff, impact, rollout, evidence-chain, row, and receipt hashes. |
| Comply | Relevant because policy changes need owner, affected controls, prior decisions, recheck list, rollout receipt, and signed evidence lineage. |

## Product closure

No product code changed. Existing `src/compliance/policyDrift.ts` primitives already satisfy this gap:

- `buildPolicyDriftImpactReceipt`
- `verifyPolicyDriftImpactReceipt`
- `renderPolicyDriftImpactAuditExport`

The receipt records policy diff, previous and next policy versions and hashes, owner, rationale, signed change evidence, affected agents, affected controls, affected tests, prior decisions, recheck items, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1088AgenticFintechPolicyDriftBoundary.test.ts` proves this existing primitive accepts source-cited finance-agent policy drift context and fails closed when paper metadata replaces signed policy drift proof.

## Fail-closed rule

metadata-only Agentic FinTech evidence must fail closed. Paper title, OpenAlex concepts, DOI redirects, SSRN labels, Crossref publisher/type metadata, author names, finance labels, local backlog text, or page hashes cannot satisfy policy drift/change impact.

A valid policy drift claim requires signed policy diff, affected agents, affected controls, affected tests, prior decisions, recheck list, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No FinTech subsystem, trading engine, portfolio advisor, investment advice feature, financial-risk model, SSRN importer, OpenAlex importer, Crossref importer, DOI adapter, source-specific policy pack, source-specific route, source-specific CLI command, copied paper text, copied abstract, copied tables, copied examples, copied prompts, copied methodology, or copied article content were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1088AgenticFintechPolicyDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1088-agentic-fintech-policy-drift.md` did not exist; 3 policy-drift/no-bloat tests passed.
- Live source checks:
  - `curl -L --max-time 20 -s https://api.openalex.org/works/W7127378038` returned OpenAlex metadata recorded above.
  - `curl -I -L --max-time 20 -s https://doi.org/10.2139/ssrn.6136529` returned HTTP/2 `302` to SSRN followed by HTTP/2 `403`.
  - `curl -L --max-time 20 -s https://api.crossref.org/works/10.2139/ssrn.6136529` returned Crossref metadata recorded above.
  - `curl -I -L --max-time 20 -s 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6136529'` returned HTTP/2 `403`.
  - `curl -L --max-time 20 -s 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6136529' | head -c 200000 | shasum -a 256` returned the hash recorded above.
- Focused test: `npx vitest run tests/gap1088AgenticFintechPolicyDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired policy-drift regression: `npx vitest run tests/gap1088AgenticFintechPolicyDriftBoundary.test.ts tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot` passed, 6 files / 25 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 999 files / 8,010 tests.
- Linear: `AMC-1424`.
