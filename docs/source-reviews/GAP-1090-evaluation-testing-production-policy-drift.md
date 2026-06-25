# GAP-1090 - Evaluation/testing production policy drift

- Gap: `GAP-1090`
- Dimension: Policy drift and change impact
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7163803520`, OpenAlex API `https://api.openalex.org/works/W7163803520`, DOI `https://doi.org/10.5281/zenodo.20583927`, Zenodo DOI page `https://zenodo.org/doi/10.5281/zenodo.20583927`, Zenodo record `https://zenodo.org/records/20583928`, Zenodo API `https://zenodo.org/api/records/20583928`, and Crossref API boundary `https://api.crossref.org/works/10.5281/zenodo.20583927`
- Retrieval: Live OpenAlex, DOI, Zenodo, and Crossref boundary review on `2026-06-25T16:51:23.000Z`
- Status: Done

## Relevance decision

`Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"` is relevant to AMC only as policy drift and change-impact context for production LLM-agent evaluation and testing governance. The source metadata is a Zenodo dataset/replication-package signal with concepts including systematic review, data extraction, and audit; it can inform when production policy changes should invalidate prior release approvals and trigger rechecks.

The source does not justify a Zenodo importer, replication-package importer, systematic-review parser, dataset mirror, file downloader, production-evaluation clone, source-specific policy pack, source-specific route, source-specific CLI command, or copied package content. GAP-1090 maps to AMC's existing generic policy drift receipt, which already records policy diff, affected agents, affected tests, affected controls, prior decisions, recheck list, rollout receipt, signed evidence refs, hashes, and auditor-ready export.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7163803520`
- OpenAlex API: `https://api.openalex.org/works/W7163803520`
- DOI: `https://doi.org/10.5281/zenodo.20583927`
- Zenodo DOI page: `https://zenodo.org/doi/10.5281/zenodo.20583927`
- Zenodo record: `https://zenodo.org/records/20583928`
- Zenodo API: `https://zenodo.org/api/records/20583928`
- Crossref API boundary: `https://api.crossref.org/works/10.5281/zenodo.20583927`
- Title: `Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-06-07`
- OpenAlex type `dataset`
- Source: `Zenodo (CERN European Organization for Nuclear Research)`
- OpenAlex open access status: `green`
- OpenAlex author count metadata: `5`
- Zenodo API canonical record: `20583928`
- Zenodo API DOI: `10.5281/zenodo.20583928`
- Zenodo API resource type: `Dataset`
- Zenodo API creators: 5 creators
- Zenodo API files: 1 file
- Zenodo creators include `Carlos Chinchilla Corbacho`, `Daniel Hernández de la Iglesia`, `André Sales Mendes`, `Diego M. Jiménez-Bravo`, and `Alfonso José López-Rivero`.
- OpenAlex concepts include `Computer science`, `Information retrieval`, `Systematic review`, `Replication (statistics)`, `Data mining`, `Quality (philosophy)`, `Data extraction`, and `Audit`.
- DOI request returned HTTP/2 `302` to `https://zenodo.org/doi/10.5281/zenodo.20583927`, then HTTP/1.1 `302 FOUND` to `https://zenodo.org/records/20583928`, then HTTP/1.1 `200 OK`.
- Crossref API request returned HTTP/2 `404`; Crossref was treated as an unavailable boundary, not proof.
- Zenodo record first 200 KB SHA-256 in this environment: `b70ea004d90ef157fcb3de4b96f2f20f3d4bc88cd35557fe71050c5e05f5c754`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because policy drift can invalidate prior production evaluation evidence and require recheck or score-impact evidence. No scoring semantics changed. |
| Shield | Relevant only when production safety or regression controls are cited as signed evidence. No Shield pack changed. |
| Enforce | Adjacent only; this gap closes pre-rollout policy-change proof rather than runtime enforcement. |
| Vault | Relevant because policy drift receipts preserve signed evidence refs and hashes without embedding Zenodo files, datasets, production payloads, or package content. |
| Watch | Relevant because production policy changes can require monitoring and recheck proof. No Watch monitor changed. |
| Fleet | Relevant because affected production agent IDs, environments, and required policy versions are preserved. |
| Passport | Relevant because the audit export preserves portable policy diff, impact, rollout, evidence-chain, row, and receipt hashes. |
| Comply | Relevant because policy changes need owner, affected controls, prior decisions, recheck list, rollout receipt, and signed evidence lineage. |

## Product closure

No product code changed. Existing `src/compliance/policyDrift.ts` primitives already satisfy this gap:

- `buildPolicyDriftImpactReceipt`
- `verifyPolicyDriftImpactReceipt`
- `renderPolicyDriftImpactAuditExport`

The receipt records policy diff, previous and next policy versions and hashes, owner, rationale, signed change evidence, affected agents, affected controls, affected tests, prior decisions, recheck items, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1090EvaluationTestingProductionPolicyDriftBoundary.test.ts` proves this existing primitive accepts source-cited production-agent evaluation/testing policy drift context and fails closed when replication-package metadata replaces signed policy drift proof.

## Fail-closed rule

metadata-only replication-package evidence must fail closed. Paper/package title, OpenAlex concepts, DOI redirects, Zenodo labels, Zenodo file counts, creator names, Crossref 404 boundary, local backlog text, or page hashes cannot satisfy policy drift/change impact.

A valid policy drift claim requires signed policy diff, affected agents, affected controls, affected tests, prior decisions, recheck list, rollout receipt, source citations, evidence refs, policy-diff hash, impact hash, rollout hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No Zenodo importer, replication-package importer, systematic-review parser, dataset mirror, file downloader, production-evaluation clone, production-testing framework, source-specific policy pack, source-specific route, source-specific CLI command, copied package files, copied extracted rows, copied code, copied datasets, copied tables, copied examples, copied prompts, copied methodology, or copied article/package content were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1090EvaluationTestingProductionPolicyDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1090-evaluation-testing-production-policy-drift.md` did not exist; 3 policy-drift/no-bloat tests passed.
- Live source checks:
  - `curl -L --max-time 20 -s https://api.openalex.org/works/W7163803520` returned OpenAlex metadata recorded above.
  - `curl -I -L --max-time 20 -s https://doi.org/10.5281/zenodo.20583927` returned the DOI-to-Zenodo redirect chain recorded above.
  - `curl -I --max-time 20 -s https://api.crossref.org/works/10.5281/zenodo.20583927` returned HTTP/2 `404`.
  - `curl -L --max-time 20 -s https://zenodo.org/api/records/20583928` returned Zenodo API metadata recorded above.
  - `curl -L --max-time 20 -s https://zenodo.org/records/20583928 | head -c 200000 | shasum -a 256` returned the hash recorded above.
- Focused test: `npx vitest run tests/gap1090EvaluationTestingProductionPolicyDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired policy-drift regression: `npx vitest run tests/gap1090EvaluationTestingProductionPolicyDriftBoundary.test.ts tests/gap1088AgenticFintechPolicyDriftBoundary.test.ts tests/gap1085LlmCounselingPolicyDriftBoundary.test.ts tests/gap1080AlgorithmicManagementPolicyDriftBoundary.test.ts tests/gap1073IbmWatsonxGovernancePolicyDriftBoundary.test.ts tests/gap1069ValidMindPolicyDriftBoundary.test.ts tests/gap1067HolisticAiPolicyDriftBoundary.test.ts --reporter=dot` passed, 7 files / 29 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,000 files / 8,014 tests.
- Linear: `AMC-1425`.
