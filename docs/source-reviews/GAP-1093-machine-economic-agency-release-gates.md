# GAP-1093 - Machine Economic Agency release gates

- Gap: `GAP-1093`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7160770892`, OpenAlex API `https://api.openalex.org/works/W7160770892`, DOI `https://doi.org/10.5281/zenodo.20102985`, Zenodo DOI page `https://zenodo.org/doi/10.5281/zenodo.20102985`, Zenodo record `https://zenodo.org/records/20102985`, Zenodo API `https://zenodo.org/api/records/20102985`, and Crossref boundary `https://api.crossref.org/works/10.5281/zenodo.20102985`
- Retrieval: Live OpenAlex, DOI, Zenodo, and Crossref boundary checks on `2026-06-25T17:30:00.000Z`
- Status: Done

## Relevance decision

`Machine Economic Agency: Risk-First Longitudinal Evaluation of Financial LLM Agents` is relevant to AMC only as governance context for release gates on financial-agent rollouts. The source metadata concerns audit, financial audit, finance, financial market, financial risk, program evaluation, risk governance, agent evaluation, paper trading, market feedback, auditability, backtest integrity, and longitudinal evaluation. That context supports blocking agent rollout unless score, security, compliance, cost, and observability gates pass for the target environment or a signed override is rejected/approved with evidence.

The source does not justify a financial-agent subsystem, trading engine, paper-trading harness, market-data connector, backtest runner, Zenodo importer, OpenAlex importer, DOI adapter, source-specific release gate, source-specific route, source-specific CLI command, public methodology bump, or copied paper content. GAP-1093 maps to AMC's existing generic release-gate receipt.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7160770892`
- OpenAlex API: `https://api.openalex.org/works/W7160770892`
- DOI: `https://doi.org/10.5281/zenodo.20102985`
- Zenodo DOI page: `https://zenodo.org/doi/10.5281/zenodo.20102985`
- Zenodo record: `https://zenodo.org/records/20102985`
- Zenodo API: `https://zenodo.org/api/records/20102985`
- Crossref boundary: `https://api.crossref.org/works/10.5281/zenodo.20102985`
- Title: `Machine Economic Agency: Risk-First Longitudinal Evaluation of Financial LLM Agents`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-05-10`
- OpenAlex type `preprint`
- Source: `Zenodo (CERN European Organization for Nuclear Research)`
- OpenAlex primary-location license `cc-by`
- OpenAlex open access status: `green`
- OpenAlex authors count `1`
- Zenodo record `20102985`
- Zenodo concept DOI `10.5281/zenodo.20102984`
- Zenodo DOI `10.5281/zenodo.20102985`
- Zenodo resource type `Preprint`
- Zenodo files count `1`
- Zenodo license `cc-by-4.0`
- Zenodo creator: Mian Zhang.
- OpenAlex concepts include `Audit`, `Financial Audit`, `Finance`, `Business`, `Protocol (science)`, `Financial market`, `Actuarial science`, `Accounting`, `Economics`, `Risk analysis (engineering)`, `Financial risk`, `Financial analysis`, and `Program evaluation`.
- Zenodo keywords include `Machine Economic Agency`, `Financial LLM Agents`, `AI in Finance`, `Risk Governance`, `Agent Evaluation`, `Paper Trading`, `Market Feedback`, `Auditability`, `Backtest Integrity`, and `Longitudinal Evaluation`.
- DOI returned HTTP/2 `302` to `https://zenodo.org/doi/10.5281/zenodo.20102985`.
- Zenodo DOI page returned HTTP/1.1 `302` to `https://zenodo.org/records/20102985`.
- Zenodo record returned HTTP/1.1 `200`.
- Crossref returned HTTP/2 `404` with body `Resource not found.`
- OpenAlex API first 200 KB SHA-256 `4c8437088a93b41a9771d4858aa55b61d63a70ccb6a3034f2e029d209338b0d1`
- Zenodo API first 200 KB SHA-256 `b180469cce92df5785307dfe74849f33d4d3ad918bb37543c64e77c21cbc2ed1`
- Zenodo record first 200 KB SHA-256 `6395f27d74aa760811bd2c2c2ba650aa7c0ba27cab8433256e918e653204e9c8`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because release gates can block rollout when maturity or value thresholds are not met. No scoring semantics changed. |
| Shield | Relevant because security release-control evidence can block a financial-agent rollout. |
| Enforce | Relevant because the release gate blocks deployment when required controls fail or evidence is missing. |
| Vault | Relevant because release-gate receipts preserve signed evidence refs and hashes without embedding financial prompts, reports, market data, or paper content. |
| Watch | Relevant because observability release-control evidence can block rollout when drift monitoring is missing. |
| Fleet | Relevant because the release gate targets agent ID, bundle, environment, and rollout state. |
| Passport | Relevant because the audit export preserves portable gate config, environment, run receipt, failure reasons, override status, evidence hashes, and receipt hash. |
| Comply | Relevant because release decisions need source-cited controls, owner decisions, failure reasons, and signed override evidence. |

## Product closure

No product code changed. Existing `src/ci/gate.ts` release-gate primitives already satisfy this gap:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`
- `defaultGatePolicy`

The receipt records gate ID, agent ID, target environment, gate config, gate-config hash, policy path, bundle path, evaluated time, pass/fail result, failure reasons, run receipt reference, run receipt hash, override status, override ID, optional score/security/compliance/cost/observability control evidence, source citation IDs, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

`tests/gap1093MachineEconomicAgencyReleaseGatesBoundary.test.ts` proves this existing primitive accepts source-cited financial-agent release decisions and fails closed when paper metadata replaces signed release-gate proof.

## Fail-closed rule

metadata-only Machine Economic Agency evidence must fail closed. A title, DOI, OpenAlex record, Zenodo record, finance labels, audit labels, risk-governance labels, paper-trading labels, file count, license label, creator name, local backlog text, source category label, or page hash cannot satisfy a release gate.

A valid release-gate claim requires gate config, target environment, evaluated time, run receipt reference, run receipt hash, failure reason when the gate fails, signed override evidence when an override exists, source citations, signed evidence refs, evidence-chain hash, row hash, receipt hash, and when control evidence is present, complete score, security, compliance, cost, and observability control evidence.

## No-bloat boundary

No financial-agent subsystem, trading engine, paper-trading harness, market-data connector, backtest runner, economic-agent simulator, Zenodo importer, OpenAlex importer, Crossref importer, DOI adapter, source-specific release gate, source-specific API route, source-specific CLI command, public methodology bump, copied paper text, copied abstract, copied methods, copied benchmark rows, copied examples, copied screenshots, copied data, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1093MachineEconomicAgencyReleaseGatesBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1093-machine-economic-agency-release-gates.md` did not exist; 3 release-gate/no-bloat tests passed.
- Live source checks:
  - `curl -L --max-time 20 -s https://api.openalex.org/works/W7160770892` returned OpenAlex metadata recorded above.
  - `curl -I -L --max-time 20 -s https://doi.org/10.5281/zenodo.20102985` returned DOI/Zenodo redirect metadata recorded above.
  - `curl -L --max-time 20 -s https://zenodo.org/api/records/20102985` returned Zenodo API metadata recorded above.
  - `curl -I -L --max-time 20 -s https://api.crossref.org/works/10.5281/zenodo.20102985` returned HTTP/2 `404`.
  - OpenAlex API, Zenodo API, and Zenodo record first-200KB hashes are recorded above.
- Focused test: `npx vitest run tests/gap1093MachineEconomicAgencyReleaseGatesBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired release-gate regression: `npx vitest run tests/gap1093MachineEconomicAgencyReleaseGatesBoundary.test.ts tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts tests/releaseBundlesArchetypesGate.test.ts --reporter=dot` passed, 6 files / 27 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,004 files / 8,030 tests.
