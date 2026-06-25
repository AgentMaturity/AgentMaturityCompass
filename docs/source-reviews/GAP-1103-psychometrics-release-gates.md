# GAP-1103 - psychometrics release gates

- Gap: `GAP-1103`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W4387963810`, OpenAlex API `https://api.openalex.org/works/W4387963810`, DOI `https://doi.org/10.1145/3769688`, ACM DOI page `https://dl.acm.org/doi/10.1145/3769688`, and Crossref API `https://api.crossref.org/works/10.1145/3769688`
- Retrieval: Live OpenAlex, DOI, ACM, and Crossref checks on `2026-06-25T17:35:00.000Z`
- Status: Done

## Relevance decision

`Evaluating General-Purpose AI with Psychometrics` is relevant to AMC only as evaluation-governance context for release gates on general-purpose AI agents. The live source metadata identifies psychometrics, construct validity, reliability, and data-science concepts, and the backlog acceptance asks AMC to block rollout unless score, security, compliance, cost, and observability gates pass for the target environment with signed control evidence, exceptions, and audit export lineage.

The source does not justify a psychometrics scoring subsystem, GPAI benchmark clone, construct-validity framework, ACM importer, DOI adapter, OpenAlex importer, Crossref importer, source-specific release gate, source-specific API route, source-specific CLI command, public methodology bump, or copied article content. GAP-1103 maps to AMC's existing generic release-gate receipt.

## Live source metadata

- OpenAlex work: `https://openalex.org/W4387963810`
- OpenAlex API: `https://api.openalex.org/works/W4387963810`
- DOI: `https://doi.org/10.1145/3769688`
- ACM DOI page: `https://dl.acm.org/doi/10.1145/3769688`
- Crossref API: `https://api.crossref.org/works/10.1145/3769688`
- Title: `Evaluating General-Purpose AI with Psychometrics`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-04-14`
- OpenAlex type `preprint`
- Crossref type `journal-article`
- Crossref published date `2026-04-24`
- Source/container: `Communications of the ACM`
- Publisher: `Association for Computing Machinery (ACM)`
- OpenAlex primary-location license `cc-by`
- Crossref license `https://creativecommons.org/licenses/by/4.0/`
- OpenAlex open access status: `hybrid`
- OpenAlex authors count `8`
- Crossref authors count `8`
- Crossref reference count `45`
- OpenAlex concepts include `Computer science`, `Psychometrics`, `Construct (python library)`, `Task (project management)`, `Reliability (semiconductor)`, `Data science`, `Construct validity`, `Management science`, `Artificial intelligence`, `Psychology`, `Systems engineering`, and `Engineering`.
- DOI returned HTTP/2 `302` to `https://dl.acm.org/doi/10.1145/3769688`.
- ACM DOI page returned HTTP/2 `403` with `cf-mitigated: challenge`; that access boundary was treated as metadata only and not as article-content evidence.
- Crossref returned HTTP `200` with DOI metadata.
- OpenAlex API first 200 KB SHA-256 `fee64943cad87a9daa3430a6076362143e6c98977557e2dc791fbc15498f3672`
- Crossref API first 200 KB SHA-256 `2f3ea8166af22158ad3cf3e9bd21a1a89faa8ff0789a77c79f2864cf415643d8`
- ACM DOI page first 200 KB SHA-256 `ad5bff46ca2cb0151b6e3745817d9df7659e9879c3c0aeb793287d3c06534721`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because release gates can block rollout when maturity, construct-validity, value, or experiment thresholds lack signed evidence. No scoring semantics changed. |
| Shield | Relevant because security release-control evidence must still pass for GPAI rollout. No source-specific security evaluator was added. |
| Enforce | Relevant because release gates enforce pre-production blocking when required controls or evidence are missing. |
| Vault | Relevant because release-gate receipts preserve signed evidence refs and hashes without embedding prompts, user data, eval payloads, or article content. |
| Watch | Relevant because observability and reliability monitoring evidence can block rollout when missing. |
| Fleet | Relevant because the release gate targets agent ID, bundle, environment, and rollout state. |
| Passport | Relevant because the audit export preserves portable gate config, environment, run receipt, failure reasons, override status, evidence hashes, and receipt hash. |
| Comply | Relevant because release decisions need source-cited controls, owner decisions, signed exceptions, failure reasons, and evidence lineage. |

## Product closure

No product code changed. Existing `src/ci/gate.ts` release-gate primitives already satisfy this gap:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`
- `defaultGatePolicy`

The receipt records gate ID, agent ID, target environment, gate config, gate-config hash, policy path, bundle path, evaluated time, pass/fail result, failure reasons, run receipt reference, run receipt hash, override status, override ID, optional score/security/compliance/cost/observability control evidence, source citation IDs, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

`tests/gap1103PsychometricsReleaseGatesBoundary.test.ts` proves this existing primitive accepts source-cited GPAI evaluation-governance release decisions and fails closed when paper metadata replaces signed release-gate proof.

## Fail-closed rule

metadata-only psychometrics evidence must fail closed. A title, DOI, OpenAlex record, Crossref record, ACM DOI page, publication date, author count, reference count, journal name, license label, psychometrics concept, construct-validity concept, reliability concept, local backlog text, source category label, or page hash cannot satisfy a release gate.

A valid release-gate claim requires gate config, target environment, evaluated time, run receipt reference, run receipt hash, failure reason when the gate fails, signed override evidence when an override exists, source citations, signed evidence refs, evidence-chain hash, row hash, receipt hash, and when control evidence is present, complete score, security, compliance, cost, and observability control evidence.

## No-bloat boundary

No psychometrics scoring subsystem, GPAI benchmark clone, construct-validity framework, ACM importer, DOI adapter, OpenAlex importer, Crossref importer, article scraper, source-specific release gate, source-specific API route, source-specific CLI command, public methodology bump, copied article text, copied abstract, copied methods, copied benchmark rows, copied examples, copied figures, copied screenshots, copied data, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1103PsychometricsReleaseGatesBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1103-psychometrics-release-gates.md` did not exist; 3 release-gate/no-bloat tests passed.
- Live source checks:
  - `https://api.openalex.org/works/W4387963810` returned OpenAlex metadata recorded above.
  - `https://doi.org/10.1145/3769688` returned HTTP/2 `302` to the ACM DOI page.
  - `https://dl.acm.org/doi/10.1145/3769688` returned HTTP/2 `403` with `cf-mitigated: challenge`; the first 200 KB hash is recorded above.
  - `https://api.crossref.org/works/10.1145/3769688` returned Crossref metadata recorded above.
- Focused test: `npx vitest run tests/gap1103PsychometricsReleaseGatesBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired release-gate regression: `npx vitest run tests/gap1103PsychometricsReleaseGatesBoundary.test.ts tests/gap1093MachineEconomicAgencyReleaseGatesBoundary.test.ts tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts tests/releaseBundlesArchetypesGate.test.ts --reporter=dot` passed, 7 files / 31 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,005 files / 8,034 tests.
