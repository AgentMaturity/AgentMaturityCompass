# GAP-4768 — Offline and degraded-mode behavior

- Gap: `GAP-4768`
- Dimension: LLMOps, routing, cost, and deployment
- AMC surfaces requested: API; Studio; Fleet
- Source reviewed: The Impact of Response Latency and Task Type on Human-LLM Interaction and Perception
- Retrieval: OpenAlex API, Crossref API, DOI redirect, and ACM DOI URL checked on 2026-06-25
- Status: Done

## Relevance decision

This gap is relevant to AMC because latency, outage, missing retrieval, and policy-service failure are runtime trust boundaries. During degraded operation, an agent must not fail open or silently produce unreliable work. AMC needs a generic receipt that defines the failure mode, allowed behavior, test run, and operator-facing message before an agent can continue in degraded mode.

Live source facts reviewed:

- OpenAlex work: https://openalex.org/W7153665608
- OpenAlex API: https://api.openalex.org/works/W7153665608
- DOI: https://doi.org/10.1145/3772318.3790716
- Crossref API: https://api.crossref.org/works/10.1145/3772318.3790716
- ACM DOI URL reached through DOI redirect: https://dl.acm.org/doi/10.1145/3772318.3790716
- Title: `The Impact of Response Latency and Task Type on Human-LLM Interaction and Perception`
- Crossref container: `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`
- Publisher: `ACM`
- Authors verified from Crossref/OpenAlex include `Felicia Fang-Yi Tan`, `Moritz Alexander Messerschmidt`, `Wen Yin`, and `Oded Nov`.
- OpenAlex concepts include `Latency`, `Perception`, `Task analysis`, and `Human–computer interaction`.

The source is latency and human-interaction context only. AMC does not copy or implement the paper.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because degraded-mode gaps and failed tests should affect maturity evidence and score penalties. |
| Shield | Relevant because unsafe degraded behavior can produce unverified claims or fail-open actions. |
| Enforce | Primary implementation consumer: degraded behavior must be allowed or blocked based on evidence. |
| Vault | Not changed; no storage, secrets, DLP, or residency behavior changed. |
| Watch | Relevant because degraded-mode receipts should be observable and auditable. |
| Fleet | Relevant because operators need fleet-level visibility into which agents are degraded and what they may do. |
| Passport | Not changed; receipts can later be exported in proof bundles. |
| Comply | Relevant for auditability of failure-mode procedures and operator notices. |

## Product closure

Added generic AMC degraded-mode behavior receipts in `src/runtime/degradedModeContract.ts`, exported them from `src/runtime/index.ts`, and re-exported them from `src/index.ts`.

The receipt records:

- Failure mode, allowed behavior, test run, and operator-facing message.
- policy ID, agent ID, allowed behaviors, and disallowed behaviors
- degradation test run ID, scenario, pass/fail result, and evidence ref
- operator message audience, text, and evidence ref
- optional recovery plan ref
- fail-closed reasons and score penalty

Complete and passing degraded-mode tests return `allow_degraded`. Complete but failing tests return `block`. Missing or invalid evidence returns `fail_closed`.

## Fail-closed rule

metadata-only evidence fails closed. Paper title, DOI, OpenAlex metadata, Crossref metadata, ACM URL, latency concepts, task-type concepts, local backlog text, or source identity cannot prove AMC degraded-mode behavior.

Degraded operation fails closed without:

- policy ID
- agent ID
- concrete failure mode
- allowed behavior
- test run ID
- test run scenario
- test run evidence
- operator-facing message
- operator-message evidence

## No-bloat boundary

No latency paper adapter, DOI/OpenAlex/Crossref/ACM importer, latency experiment runner, task-type simulation, paper-specific API route, paper-specific CLI command, Studio screen, methodology bump, upstream prose, ACM page copy, examples, prompts, datasets, figures, or source-specific runtime was added. AMC keeps this as a generic degraded-mode behavior receipt.

## Verification

- `npx vitest run tests/gap4768LatencyOfflineDegradedModeBoundary.test.ts --reporter=dot` initially failed on missing `src/runtime/degradedModeContract.ts`.
- After implementation, the focused test passed product/no-bloat assertions and failed only on this missing source-review document.
- Final focused test passed: `npx vitest run tests/gap4768LatencyOfflineDegradedModeBoundary.test.ts --reporter=dot`, 1 file / 5 tests.
- Related regression passed: `npx vitest run tests/gap4768LatencyOfflineDegradedModeBoundary.test.ts tests/opsResilienceHardening.test.ts tests/runtimeRunManager.test.ts tests/operationalIndependenceDependencyDrift.test.ts tests/gatewayAndSupervise.test.ts --reporter=dot`, 5 files / 31 tests.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 966 files / 7,864 tests.
