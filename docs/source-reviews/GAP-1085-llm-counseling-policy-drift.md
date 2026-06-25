# GAP-1085 - LLM counseling policy drift

- Gap: `GAP-1085`
- Dimension: Policy drift and change impact
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7128356801`, OpenAlex API `https://api.openalex.org/works/W7128356801`, DOI `https://doi.org/10.3390/bs16020241`, Crossref API `https://api.crossref.org/works/10.3390%2Fbs16020241`, MDPI article page `https://www.mdpi.com/2076-328X/16/2/241`, and MDPI PDF URL `https://www.mdpi.com/2076-328X/16/2/241/pdf`
- Retrieval: Live OpenAlex, DOI, Crossref, and MDPI metadata review on `2026-06-25T08:49:00.000+05:30`
- Status: Done

## Relevance decision

`Power Distance and Psychological Safety in LLM Counseling: Effects on Self-Efficacy with Implications for Mental Health-Relevant Behavior Change` is relevant to AMC only as policy drift and change-impact context for counseling-adjacent or wellbeing-adjacent agent policies. The source metadata concerns psychology, mental health context, psychological safety, agency, and human factors, so it can inform when a policy change should invalidate prior rollout approvals and trigger rechecks.

The source does not justify a counseling subsystem, mental-health behavior model, clinical claim, MDPI importer, OpenAlex importer, source-specific policy pack, source-specific route, source-specific CLI command, or copied paper content. GAP-1085 maps to AMC's existing generic policy drift receipt, which already records policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, rollout receipt, signed evidence refs, hashes, and auditor-ready export.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7128356801`
- OpenAlex API: `https://api.openalex.org/works/W7128356801`
- DOI: `https://doi.org/10.3390/bs16020241`
- Crossref API: `https://api.crossref.org/works/10.3390%2Fbs16020241`
- MDPI article page: `https://www.mdpi.com/2076-328X/16/2/241`
- MDPI PDF URL: `https://www.mdpi.com/2076-328X/16/2/241/pdf`
- Title: `Power Distance and Psychological Safety in LLM Counseling: Effects on Self-Efficacy with Implications for Mental Health-Relevant Behavior Change`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-02-08`
- OpenAlex type `article`, language `en`
- Crossref type `journal-article`
- Crossref issued/online date `2026-02-08`
- Source: `Behavioral Sciences`
- OpenAlex host organization: `Multidisciplinary Digital Publishing Institute`
- Crossref publisher: `MDPI AG`
- ISSN `2076-328X`
- OpenAlex open access status: `gold`; OpenAlex license `cc-by`
- Crossref license metadata includes `https://creativecommons.org/licenses/by/4.0/`.
- OpenAlex abstract available, but AMC did not copy the abstract text into product code or public methodology.
- Authors/institutions:
  - Shengyu He, `Zhejiang University`
  - Yuxing (Nemo) Chen, `University of Michigan`
- Concepts from OpenAlex include `Construal level theory`, `Vignette`, `Psychology`, `Mental health`, `Belongingness`, `Social psychology`, `Psychological safety`, `Human factors and ergonomics`, and `Suicide prevention`.
- DOI request returned HTTP/2 `302` to `https://www.mdpi.com/2076-328X/16/2/241`.
- MDPI article page request returned HTTP/2 `403` in this environment.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because policy drift can invalidate prior score evidence and require recheck/score-impact evidence. No scoring semantics changed. |
| Shield | Relevant only when counseling-adjacent safety reviews are cited as signed evidence. No clinical or mental-health safety module was added. |
| Enforce | Adjacent only; this gap closes pre-rollout policy-change proof rather than runtime enforcement. |
| Vault | Relevant because policy drift receipts preserve signed evidence refs and hashes without embedding user data, counseling content, or paper content. |
| Watch | Relevant because affected agents and policy pack rollouts can require monitoring/recheck proof. No Watch monitor changed. |
| Fleet | Relevant because affected agent IDs, environments, and required policy versions are preserved. |
| Passport | Relevant because the audit export preserves portable policy diff, impact, rollout, evidence-chain, row, and receipt hashes. |
| Comply | Relevant because policy changes need owner, affected controls, prior decisions, recheck list, rollout receipt, and signed evidence lineage. |

## Product closure

No product code changed. Existing `src/compliance/policyDrift.ts` primitives already satisfy this gap:

- `buildPolicyDriftImpactReceipt`
- `verifyPolicyDriftImpactReceipt`
- `renderPolicyDriftImpactAuditExport`

The receipt records policy diff, previous and next policy versions and hashes, owner, rationale, signed change evidence, affected agents, affected controls, affected tests, prior decisions, recheck items, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts` proves this existing primitive accepts source-cited counseling-adjacent policy drift context and fails closed when paper metadata replaces signed policy drift proof.

## Fail-closed rule

metadata-only LLM counseling evidence must fail closed. Paper title, OpenAlex concepts, OpenAlex abstract availability, DOI redirects, MDPI page labels, Crossref license metadata, journal labels, author names, mental-health context labels, or local backlog text cannot satisfy policy drift/change impact.

A valid policy drift claim requires signed policy diff, affected agents, affected controls, affected tests, prior decisions, recheck list, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No counseling subsystem, mental-health behavior model, clinical workflow, psychological-safety scorer, MDPI importer, OpenAlex importer, Crossref importer, source-specific policy pack, source-specific route, source-specific CLI command, copied paper text, copied abstract, copied tables, copied examples, copied prompts, copied methodology, or copied article content were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1085-llm-counseling-policy-drift.md` did not exist; 3 policy-drift/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7128356801` returned OpenAlex metadata recorded above.
  - `curl -sSI https://doi.org/10.3390/bs16020241` returned HTTP/2 `302` to MDPI.
  - `curl -sS https://api.crossref.org/works/10.3390%2Fbs16020241` returned Crossref metadata recorded above.
  - `curl -sSI https://www.mdpi.com/2076-328X/16/2/241` returned HTTP/2 `403`.
  - `curl -sSL https://www.mdpi.com/2076-328X/16/2/241` did not expose citation metadata from this environment because the page was blocked.
- Focused test: `npx vitest run tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts --reporter=dot`
- Paired policy-drift regression: `npx vitest run tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
