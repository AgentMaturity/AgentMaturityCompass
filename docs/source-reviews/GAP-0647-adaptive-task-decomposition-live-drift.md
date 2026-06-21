# GAP-0647 — adaptive task decomposition live-drift boundary

- Gap: `GAP-0647`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7131887020` / DOI `10.20944/preprints202602.1841.v1`
- Retrieval: `2026-06-21T04:19:24Z` via OpenAlex API (`status=200`, source `Preprints.org`, type `preprint`, metadata SHA-256 `8db9aa4bd9cd2a9daee7a3ae0381a0df30880df9f67dd3d64c09b9f57dda983a`)

## Relevance decision

Relevant to AMC only through existing Watch live score/behavior drift receipts. Non-stationary task decomposition and strategy updating map to baseline/live behavior signatures, score/pass-rate drift, interaction metrics, alert or waiver proof, signed evidence refs, and source refs.

This does not justify an adaptive task-decomposition subsystem, strategy-update engine, paper importer, simulator, or copied paper content.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Watch | Yes, existing live-drift receipts can represent non-stationary behavior shifts. |
| Score | Yes, only through signed score windows and score-delta thresholds. |
| Shield | Yes, only when behavior drift affects safety/unsupported claims and signed evidence exists. |
| Fleet | Indirect context for multi-agent task decomposition; no Fleet runtime change. |
| Enforce/Vault/Passport/Comply | No direct scope for this gap. |

## Product closure

Closed through existing Watch live score/behavior drift receipts. The regression test builds an AMC-owned baseline/live receipt for adaptive task decomposition and verifies signed evidence, drift alerting, receipt verification, and Watch alert projection without a new subsystem.

## Fail-closed rule

Preprint metadata, DOI, OpenAlex row, strategy/decomposition labels, or source URL alone must fail closed. A live-drift claim passes only with AMC-owned baseline/live samples, behavior signatures, score/pass-rate drift, interaction metrics, alert or waiver proof, signed evidence refs, and source refs.

## No-bloat boundary

No preprint prose, figures, tables, prompts, datasets, strategy algorithms, agent code, or implementation details were copied.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts --reporter=dot`
