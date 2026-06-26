# GAP-1083 - LLM agent deployment release gates

- Gap: `GAP-1083`
- Dimension: Deployment and release maturity gates
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7128522356`, OpenAlex API `https://api.openalex.org/works/W7128522356`, DOI `https://doi.org/10.1016/j.ins.2026.123231`, Crossref API `https://api.crossref.org/works/10.1016%2Fj.ins.2026.123231`, and Elsevier linking hub `https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623`
- Retrieval: Live OpenAlex, DOI, Crossref, and publisher-link metadata review on `2026-06-25T08:33:00.000+05:30`
- Status: Done

## Relevance decision

`Bridging AI and software security: A comparative vulnerability assessment of LLM agent deployment paradigms` is relevant to AMC only as governance and security context for existing deployment and release maturity gates. The verified source metadata places the work in software deployment, computer security, vulnerability assessment, and software security assurance, so it maps to release evidence requirements before production agent rollout.

The source does not justify a paper-specific vulnerability assessor, deployment-paradigm simulator, release-gate subsystem, publisher adapter, source-specific API route, source-specific CLI command, or copied paper content. GAP-1083 maps to AMC's existing generic release-gate receipt, which already records gate config, environment, run receipt, failure reason, override status, source citations, signed evidence refs, hashes, and auditor-ready export.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7128522356`
- OpenAlex API: `https://api.openalex.org/works/W7128522356`
- DOI: `https://doi.org/10.1016/j.ins.2026.123231`
- Crossref API: `https://api.crossref.org/works/10.1016%2Fj.ins.2026.123231`
- Elsevier linking hub: `https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623`
- Title: `Bridging AI and software security: A comparative vulnerability assessment of LLM agent deployment paradigms`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-02-11`
- OpenAlex type `article`, language `en`
- Crossref type `journal-article`
- Crossref issued/print date `2026-06`
- Source: `Information Sciences`
- Publisher/host organization: `Elsevier BV`
- ISSN `0020-0255`
- OpenAlex open access status: `closed`; no OpenAlex OA URL; no repository full text; OpenAlex abstract unavailable.
- Crossref license metadata includes TDM and STM policy links starting `2026-06-01`; this is metadata for text/data-mining policy, not a claim that AMC can copy article content.
- Authors/institutions from OpenAlex:
  - Tarek Gasmi, `Manouba University`
  - Ramzi Guesmi, `University of Sfax`, `University of Jendouba`
  - Jihene Bennaceur, `Mediterranean School of Business`
  - Ines Belhadj, `Université Internationale de Tunis`
- Concepts from OpenAlex include `Software deployment`, `Computer security`, `Vulnerability assessment`, `Software security assurance`, `Computer science`, `Vulnerability (computing)`, `Architecture`, and `Software`.
- DOI request returned HTTP/2 `302` to `https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623`.
- Elsevier linking hub returned HTTP/2 `200`, `tdm-reservation: 1`, and HTML title `Redirecting`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because release gates can block rollout when maturity, integrity, trust, value, or experiment thresholds are not met. No scoring semantics changed. |
| Shield | Relevant because security and vulnerability-assessment evidence can be required before production deployment. No source-specific vulnerability assessor was added. |
| Enforce | Adjacent only; this gap closes pre-release evidence rather than runtime enforcement. |
| Vault | Relevant because release-gate receipts preserve signed evidence refs and hashes without embedding customer data or copied paper content. |
| Watch | Relevant because production observability and drift receipts can be required as release evidence. |
| Fleet | Relevant because the gate targets agent rollout by agent ID and environment. |
| Passport | Relevant because the audit export preserves portable release-gate proof, row hashes, evidence-chain hashes, and receipt hash. |
| Comply | Relevant because release decisions need source-cited controls, owner decisions, failure reasons, and signed override status. |

## Product closure

No product code changed. Existing `src/ci/gate.ts` release-gate receipt primitives already satisfy this gap:

- `buildReleaseGateReceipt`
- `verifyReleaseGateReceipt`
- `renderReleaseGateAuditExport`

The existing receipt records gate ID, agent ID, target environment, gate config, gate-config hash, policy path, bundle path, evaluated time, pass/fail result, failure reasons, run receipt reference, run receipt hash, override status, override ID, source citation IDs, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

`tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts` proves this existing primitive accepts source-cited production agent-deployment security release decisions and fails closed when paper metadata replaces signed release-gate proof.

## Fail-closed rule

metadata-only LLM-agent-deployment evidence must fail closed. OpenAlex concepts, DOI redirects, Crossref dates, publisher names, journal names, ISSN values, TDM policy links, citation counts, local backlog text, or a paper title cannot approve a production agent deployment.

A valid release-gate claim requires gate config, target environment, evaluated time, run receipt reference, run receipt hash, failure reason when the gate fails, signed override evidence when an override exists, source citation IDs, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No paper-specific vulnerability assessor, deployment-paradigm simulator, release-gate subsystem, publisher adapter, Elsevier adapter, Crossref adapter, OpenAlex adapter, source-specific route, source-specific CLI command, copied article text, copied abstract, copied paper method, copied benchmark rows, copied examples, copied screenshots, or copied deployment patterns were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1083-llm-agent-deployment-release-gates.md` did not exist; 3 release-gate/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7128522356` returned OpenAlex metadata recorded above.
  - `curl -sSI https://doi.org/10.1016/j.ins.2026.123231` returned HTTP/2 `302` to the Elsevier linking hub.
  - `curl -sS https://api.crossref.org/works/10.1016%2Fj.ins.2026.123231` returned Crossref metadata recorded above.
  - `curl -sSI https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623` returned HTTP/2 `200`, `tdm-reservation: 1`, and the Elsevier linking hub URL.
  - `curl -sSL https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623` returned a redirect-style HTML page with title `Redirecting`.
- Focused test: `npx vitest run tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts --reporter=dot`
- Paired release-gate regression: `npx vitest run tests/gap1083LlmAgentDeploymentReleaseGatesBoundary.test.ts tests/gap1079EverydayFeminismReleaseGatesBoundary.test.ts tests/gap1077ApiRelayAuditReleaseGatesBoundary.test.ts tests/gap1075ArtificialAuthorityReleaseGatesBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
