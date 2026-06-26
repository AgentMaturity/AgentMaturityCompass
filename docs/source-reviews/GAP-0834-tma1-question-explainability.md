# GAP-0834 - TMA1 question-explainability boundary

- Gap: `GAP-0834`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `tma1-ai/tma1`, `https://github.com/tma1-ai/tma1`
- Retrieval: `2026-06-21` via live GitHub page review and shell header checks. Repository URL returned HTTP/2 200. The live page exposed README.md and LICENSE links, Apache-2.0 license metadata, and Go as the primary implementation language. Direct api.github.com DNS lookup failed in this shell.
- Status: closed through existing question-score explainability receipts; no TMA1 integration, OpenTelemetry collector, MCP tool, hook runtime, agent feedback loop, dashboard, log importer, or source-specific question-explainability adapter added.

## Live source metadata

The live repository page describes TMA1 as `Local-first observability your agent reads back`. The source-review signal includes records every LLM call, hooks, MCP tools, anomaly detection context, dashboard views, OpenTelemetry-related observability, local-first logs, and Go implementation context.

These facts are useful context for why explainability needs trace-backed evidence, but they are not AMC question-level score evidence. No upstream code, README prose beyond minimal metadata facts, hooks, MCP definitions, OpenTelemetry config, logs, dashboards, screenshots, examples, prompts, generated responses, or implementation details were copied into AMC.

## Relevance decision

GAP-0834 is relevant to AMC because observability tools can help explain why a question score moved, but AMC must expose that explanation through its own question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.

The acceptable closure is the existing question-score explainability primitive. Repository metadata, README claims, license metadata, OpenTelemetry labels, MCP labels, hook labels, dashboard labels, anomaly labels, Go language metadata, or TMA1 identity alone fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanation rows that bind question ID, score movement, accepted evidence IDs, rejected evidence reasons, and repair hints. |
| Shield | Relevant through fail-closed signed evidence requirements before observability metadata can support a score claim. |
| Watch | Relevant as observability context only; no Watch ingestion, alert, or monitor changed. |
| Enforce | No runtime hook, MCP policy, telemetry policy, or circuit breaker changed. |
| Vault | No logs, prompts, responses, telemetry spans, secrets, or secure-storage behavior changed. |
| Fleet | Agent-loop context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable proof-bundle schema changed; question evidence remains source-agnostic. |
| Comply | Observability context only; no compliance mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, TMA1 integration, OpenTelemetry collector, MCP tool, hook runtime, agent feedback loop, dashboard, log importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0834.

The focused regression exercises the existing `buildQuestionExplainabilityReport` path. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/license/TMA1 observability metadata replaces AMC-owned question evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, README.md presence, LICENSE presence, Apache-2.0 license metadata, api.github.com DNS lookup failed, Local-first observability your agent reads back label, records every LLM call label, hooks label, MCP tools label, anomaly label, dashboard label, OpenTelemetry label, Go language metadata, local-first logs label, source topic tags, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No TMA1 integration, OpenTelemetry collector, MCP tool, hook runtime, agent feedback loop, dashboard, log importer, repository importer, observability adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific question lens, or source-specific scoring path was added. No upstream code, README prose beyond minimal metadata facts, hooks, MCP definitions, OpenTelemetry config, logs, dashboards, screenshots, examples, prompts, generated responses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0834Tma1QuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
