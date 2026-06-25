# GAP-1079 - Everyday feminism release gates

- Gap: `GAP-1079`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7131402372`, OpenAlex API `https://api.openalex.org/works/W7131402372`, DOI `https://doi.org/10.1145/3772318.3790616`, and ACM landing page `https://dl.acm.org/doi/10.1145/3772318.3790616`
- Retrieval: Live HTTP and metadata review on `2026-06-25T07:59:00.000+05:30`
- Status: Done

## Relevance decision

OpenAlex identifies `When LLMs Enter Everyday Feminism on Chinese Social Media: Opportunities and Risks for Women's Empowerment` as an `article`, publication_year `2026`, publication_date `2026-04-13`, DOI `https://doi.org/10.1145/3772318.3790616`, open-access status `gold`, and license `cc-by-nc-nd`. Concepts include `Feminism`, `Solidarity`, `Gender studies`, `Empowerment`, `Sociology`, `Everyday life`, `Public relations`, and `Power (physics)`. Author affiliations include `Hong Kong University of Science and Technology` and `Tongji University`. The OpenAlex abstract metadata starts with the phrase `Everyday digital feminism`.

This source is relevant to AMC only as governance and audit context for user-facing social or empowerment-sensitive releases. It maps to AMC's existing generic release-gate receipt because the backlog acceptance requires `gate config`, target `environment`, run receipt, failure reason list, and override status.

It does not justify an everyday-feminism subsystem, social-media policy engine, ACM importer, OpenAlex importer, paper parser, source-specific release gate, source-specific API route, source-specific CLI command, gender-studies classifier, public empowerment claim, safety claim, or article-content claim.

Live access boundary: `https://api.openalex.org/works/W7131402372` returned HTTP/2 `200`. `https://openalex.org/W7131402372` returned HTTP/2 `403` in this environment. The DOI returned HTTP/2 `302` to `https://dl.acm.org/doi/10.1145/3772318.3790616`, and the ACM destination returned HTTP/2 `403` with a Cloudflare challenge page whose title was `Just a moment...`. AMC therefore treats OpenAlex metadata and HTTP headers as source-review context only.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Release gates can cite Score evidence when maturity or value gates block release. |
| Shield | Relevant as social-impact and misuse-risk context, but no Shield pack, classifier, or paper-derived evaluator was added. Shield evidence must be AMC-owned and signed. |
| Enforce | No runtime enforcement path changed. Existing gates can block release workflows when required evidence is missing. |
| Vault | Relevant because release-gate receipts reference signed evidence without embedding prompts, social-media payloads, private user data, or article content. |
| Watch | Relevant only through signed drift or monitoring evidence referenced by the release-gate receipt. No Watch monitor changed. |
| Fleet | Relevant as deployment context because receipts bind agent id and target `environment` such as production. |
| Passport | Relevant because the auditor-ready export preserves gate decisions, failure reasons, overrides, source citations, row hashes, and receipt hashes. |
| Comply | Relevant because release decisions for user-facing social contexts need auditable evidence chains and explicit override posture. |

## Product closure

No product code changed. Existing `src/ci/gate.ts` release-gate receipt primitives from GAP-1075 already satisfy this gap:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`

The receipt records the gate config, gate config hash, agent id, target environment, policy path, bundle path, evaluated timestamp, pass/fail result, failure reason list, run receipt ref, run receipt hash, override status, override id, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

`tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts` proves this existing primitive accepts source-cited social-governance release context and fails closed when paper metadata replaces signed release-gate proof.

## Fail-closed rule

metadata-only everyday-feminism evidence must fail closed. A source title, DOI, OpenAlex id, ACM URL, publication date, concept list, author affiliation, open-access label, license label, abstract metadata, or local backlog text cannot satisfy a release gate.

A valid release-gate claim requires a valid gate config, target environment, evaluated timestamp, signed evidence refs, run receipt ref, run receipt hash, failure reasons for failed gates, signed override evidence when an override exists, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No everyday-feminism subsystem, social-media policy engine, ACM importer, OpenAlex importer, paper parser, source-specific release gate, source-specific API route, source-specific CLI command, gender-studies classifier, public empowerment claim, safety claim, upstream article prose, prompts, figures, tables, datasets, screenshots, model outputs, examples, or implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1079-everyday-feminism-release-gates.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7131402372` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.1145/3772318.3790616` returned HTTP/2 `302` to ACM followed by HTTP/2 `403`.
  - `curl -sSL https://doi.org/10.1145/3772318.3790616` returned a Cloudflare challenge page with title `Just a moment...`.
  - `curl -sSIL https://openalex.org/W7131402372` returned HTTP/2 `403`.
- Focused test: `npx vitest run tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts --reporter=dot`
- Paired release-gate regression: `npx vitest run tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts tests/releaseBundlesArchetypesGate.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
