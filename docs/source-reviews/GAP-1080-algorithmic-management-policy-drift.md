# GAP-1080 - Algorithmic management policy drift

- Gap: `GAP-1080`
- Dimension: Policy drift and change impact
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7134908244`, OpenAlex API `https://api.openalex.org/works/W7134908244`, DOI `https://doi.org/10.3390/ai7030102`, MDPI landing page `https://www.mdpi.com/2673-2688/7/3/102`, and MDPI PDF `https://www.mdpi.com/2673-2688/7/3/102/pdf`
- Retrieval: Live HTTP and metadata review on `2026-06-25T08:08:00.000+05:30`
- Status: Done

## Relevance decision

OpenAlex identifies `LLM-Augmented Algorithmic Management: A Governance-Oriented Architecture for Explainable Organizational Decision Systems` as an `article` in `AI`, publication_year `2026`, publication_date `2026-03-10`, DOI `https://doi.org/10.3390/ai7030102`, open-access status `gold`, license `cc-by`, and PDF URL `https://www.mdpi.com/2673-2688/7/3/102/pdf`. Concepts include `Computer science`, `Blueprint`, `Corporate governance`, `Architecture`, `Management science`, `Audit`, `Key (lock)`, and `Interoperability`. Author affiliations include `Technical University of Sofia` and `Institute of Information and Communication Technologies`. The OpenAlex abstract metadata starts with the phrase `Algorithmic management systems`.

This source is relevant to AMC only as governance/audit context for policy drift and change impact in organizational decision systems. It maps to AMC's existing generic policy-drift receipt because the backlog acceptance requires policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, and rollout receipt.

It does not justify an algorithmic-management subsystem, MDPI importer, OpenAlex importer, paper parser, architecture clone, organizational decision engine, source-specific policy route, source-specific CLI command, management-science claim, organizational-decision claim, or copied article content.

Live access boundary: `https://api.openalex.org/works/W7134908244` returned HTTP/2 `200`. `https://openalex.org/W7134908244` returned HTTP/2 `403` in this environment. The DOI returned HTTP/2 `302` to `https://www.mdpi.com/2673-2688/7/3/102`, and the MDPI landing page returned HTTP/2 `403` with page title `Access Denied`. The MDPI PDF URL also returned HTTP/2 `403`. AMC therefore treats OpenAlex metadata and HTTP headers as source-review context only.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Score evidence can be cited by policy-drift receipts when policy changes invalidate prior decisions. |
| Shield | No Shield evaluator or management-risk classifier was added. Shield evidence must be AMC-owned and signed when cited. |
| Enforce | No runtime enforcement path changed. Policy-drift receipts can inform existing rollout and recheck gates. |
| Vault | Relevant because receipts reference signed evidence without embedding decision payloads, employee data, policies, or article content. |
| Watch | Relevant because policy drift can trigger recheck and monitoring evidence, but no Watch monitor changed. |
| Fleet | Relevant because the receipt binds affected agents and production/staging impact context. |
| Passport | Relevant because the auditor-ready export preserves policy diff, impacts, rechecks, rollout receipt, row hashes, and receipt hash. |
| Comply | Relevant because policy changes can invalidate prior approvals and controls unless mapped to signed evidence and recheck work. |

## Product closure

No product code changed. Existing `src/compliance/policyDrift.ts` policy-drift receipt primitives already satisfy this gap:

- `buildPolicyDriftImpactReceipt`
- `verifyPolicyDriftImpactReceipt`
- `renderPolicyDriftImpactAuditExport`

The receipt records policy diff, affected agents, affected controls, affected tests, prior decisions, invalidated decisions, recheck list, rollout receipt, source citations, signed evidence refs, policy diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts` proves this existing primitive accepts source-cited algorithmic-management governance context and fails closed when paper metadata replaces signed policy-drift impact proof.

## Fail-closed rule

metadata-only algorithmic-management evidence must fail closed. A source title, DOI, OpenAlex id, MDPI URL, publication date, concept list, author affiliation, open-access label, license label, abstract metadata, or local backlog text cannot satisfy policy drift and change impact.

A valid policy-drift claim requires a signed policy diff, changed policy versions and hashes, change owner, affected agents, affected controls, affected tests, prior decisions, recheck list, rollout receipt, signed evidence refs, source citations, policy diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No algorithmic-management subsystem, MDPI importer, OpenAlex importer, paper parser, architecture clone, organizational decision engine, source-specific policy route, source-specific CLI command, management-science claim, organizational-decision claim, upstream article prose, prompts, figures, tables, datasets, screenshots, model outputs, examples, or implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1080-algorithmic-management-policy-drift.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7134908244` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.3390/ai7030102` returned HTTP/2 `302` to MDPI followed by HTTP/2 `403`.
  - `curl -sSL https://doi.org/10.3390/ai7030102` returned title `Access Denied`.
  - `curl -sSIL https://openalex.org/W7134908244` returned HTTP/2 `403`.
  - `curl -sSIL https://www.mdpi.com/2673-2688/7/3/102/pdf` returned HTTP/2 `403`.
- Focused test: `npx vitest run tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts --reporter=dot`
- Paired policy-drift regression: `npx vitest run tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
