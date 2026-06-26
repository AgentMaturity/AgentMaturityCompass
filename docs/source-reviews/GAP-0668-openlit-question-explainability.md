# GAP-0668 — OpenLIT question-explainability boundary

- Gap: `GAP-0668`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/openlit/openlit`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: relevant as AI observability/evaluation context for existing question-level score explainability only; no OpenLIT integration, SDK, or dashboard clone added.

## Live source metadata

The live GitHub page identifies `openlit/openlit` as a public repository on branch `main`, with approximately `2.5k` stars, `304` forks, `25` issues, Apache-2.0 license, and repository positioning around AI engineering, OpenTelemetry-native LLM observability, evaluations, guardrails, prompt management, vault/secrets, playground, GPU monitoring, and integrations with LLM providers, vector databases, agent frameworks, and GPUs.

These facts are source identity and domain context only. No README prose beyond short metadata labels, no setup commands, no SDK examples, no screenshots, no dashboard copy, no OpenTelemetry conventions, no evaluation definitions, no guardrail rules, no configs, no code, and no implementation details were copied.

## Relevance decision

OpenLIT is relevant to AMC only as source-review context for question-level score explainability and observability drilldown expectations. Its public metadata overlaps with AI observability, evaluations, guardrails, and trace collection, which are adjacent to showing why each AMC question moved, which evidence was accepted, which evidence was rejected, and what repair hint remains.

The source is not AMC proof by itself. Repository metadata, README labels, stars, license, observability/evaluation/vault positioning, OpenTelemetry references, SDK names, dashboard screenshots, local collector endpoints, or supported integration lists do not establish question-level score explainability. Accepted claims still need AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, trace/receipt/source artifact previews, signed evidence refs, thresholds, row hashes, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC question-score explainability rows with accepted/rejected evidence and repair hints. |
| Shield | Relevant only when unsupported observability/evaluation/guardrail claims are rejected with signed evidence and thresholds. |
| Watch | Relevant only when caller-owned traces, receipts, source previews, empty states, and error states are hash-bound through AMC evidence. |
| Enforce | No guardrail/policy engine implementation. |
| Vault | No secrets, vault, or data-residency implementation. |
| Fleet | No OpenTelemetry collector, OpAMP, or fleet-management implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/diagnostic`, `src/guide`, `src/passport`, `src/watch`, `src/vault`, API, CLI, Studio, Console, or scoring behavior changed for GAP-0668. The existing question-score explainability path remains the accepted product primitive: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, source artifact links, trace/receipt previews, empty/error states, signed evidence refs, thresholds, and row hashes.

## Fail-closed rule

OpenLIT repository metadata, stars/forks/issues, license, README labels, OpenTelemetry references, SDK names, dashboard claims, collector endpoints, evaluation-type labels, guardrail labels, vault/secrets wording, prompt-management labels, integration lists, local demo output, or source identity alone must fail closed for Score, Shield, or Watch question-explainability claims. Passing evidence requires AMC-owned question rows, accepted/rejected evidence, repair hints, trace/receipt/source previews, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No OpenLIT SDK integration, OpenTelemetry collector, OTLP endpoint, dashboard clone, evaluation wrapper, guardrail adapter, prompt-management bridge, vault/secrets feature, GPU monitor, OpAMP/FleetHub implementation, importer, source artifact schema, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No upstream code, README/docs prose, commands, SDK snippets, configs, examples, screenshots, images, dashboard text, evaluation labels beyond short metadata, trace schemas, prompt templates, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0668OpenlitQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
