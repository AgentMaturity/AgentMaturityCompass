# GAP-0958 - Laminar Studio evidence drilldown boundary

- Gap: `GAP-0958`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.lmnr.ai`, `https://laminar.sh/`, `https://laminar.sh/docs/overview`, `https://laminar.sh/docs/signals/introduction`, `https://laminar.sh/docs/platform/viewing-traces`, `https://laminar.sh/docs/platform/cli`, `https://laminar.sh/docs/evaluations/introduction`, `https://github.com/lmnr-ai/lmnr`
- Retrieval: `2026-06-22` via live Laminar homepage, docs, Signals docs, platform trace docs, CLI docs, evaluations docs, and GitHub repository page. `https://www.lmnr.ai` redirected to `https://laminar.sh/`.
- Status: closed through existing Score/Watch Studio evidence drilldown receipts; no Laminar adapter, trace importer, debugger integration, CLI integration, MCP integration, or source-specific Studio route added.

## Live source metadata

The live Laminar homepage identifies Laminar as `Laminar - Open-source observability for AI agents` and opens with Ship reliable agents. The homepage positions Laminar around agent failure detection, Signals, readable transcript and timeline views, Ask any question about your agent run, Event clusters, Debugger sessions, Evals, View Trace flows, similar events, cost heatmaps, transcript views, automatic eval datasets, self-hosting, Apache 2.0 licensing, HIPAA, SOC 2 Type II, and PII redaction.

The live docs describe Laminar as an open-source observability platform purpose-built for AI agents that can trace every call to an LLM, tool execution, and custom functions. The docs also cover Signals, trace viewing, evals, datasets, replay, full-text search, raw SQL access, dashboards, CLI, MCP server, SQL editor, PII redaction, labeling queues, playground, hosting options, and integrations.

These facts are Studio drilldown context only. No Laminar product copy, docs examples, CLI commands, SDK snippets, trace rows, event examples, failure examples, eval rows, dataset rows, screenshots, dashboards, SQL queries, prompts, MCP config, debugger workflows, self-hosting configs, repository code, generated outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC because Laminar's public product and docs emphasize exactly the operator experience GAP-0958 asks for: a user opens an agent finding, sees trace context, jumps to source artifacts, previews evidence, and understands empty/error states. That maps to AMC's existing Studio evidence drilldown primitive: UI route, source artifact links, evidence preview, and empty/error states, plus trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, and fail-closed response state.

It does not require a Laminar adapter, trace importer, Laminar UI clone, dashboard, debugger, CLI wrapper, MCP client, SQL connector, source-specific route, API surface, scoring semantic change, or methodology version bump. Laminar metadata can label source context, but it cannot replace AMC-owned drilldown previews and receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score-finding drilldown output, question receipt preview, signed evidence, and fail-closed state. |
| Shield | Relevant because unsupported findings must fail closed when trace/receipt/source-artifact/empty/error proof is missing. |
| Watch | Relevant through observability source links and Watch-side source artifact link projection into score drilldowns. |
| Enforce | No runtime policy, provider route, deployment gate, or circuit breaker changed. |
| Vault | No secure-storage, PII redaction, tenant isolation, or secret behavior changed. |
| Fleet | Agent-run and sub-agent trace context only; no Fleet topology or orchestration behavior changed. |
| Passport | No portable trust token, badge, or proof-bundle schema changed. |
| Comply | HIPAA/SOC2/PII context only; no compliance framework mapping changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version, badge semantics, diagnostic question bank, Laminar adapter, trace importer, debugger integration, SQL connector, or source-specific implementation module changed for GAP-0958.

The focused regression exercises the existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` paths. The positive path requires UI route, source artifact links, evidence preview, trace preview, receipt preview, empty/error states, signed evidence refs, accepted/rejected evidence, and a ready non-fail-closed response. The negative path fails closed when Laminar product metadata replaces AMC-owned evidence previews. A missing question receipt pack returns an explicit empty state.

## Fail-closed rule

Laminar name, product URL, canonical URL, docs, repository, Signals, readable transcript/timeline, Ask AI, Event clusters, Debugger, Evals, View Trace, raw SQL access, CLI, MCP, SQL editor, PII redaction, self-hosting, SOC2/HIPAA claims, product screenshots, product examples, or local backlog metadata must fail closed as Studio evidence drilldown proof. Passing evidence requires AMC-owned UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and explicit repair guidance.

## No-bloat boundary

No Laminar adapter, Laminar SDK wrapper, Laminar CLI wrapper, MCP client, SQL connector, debugger integration, trace importer, event importer, dataset importer, eval runner, signal runner, alert connector, PII-redaction mapper, self-hosted deployment profile, source-specific Studio route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No Laminar product copy, docs examples, CLI commands, SDK snippets, trace rows, event examples, failure examples, eval rows, dataset rows, screenshots, dashboards, SQL queries, prompts, MCP config, debugger workflows, self-hosting configs, repository code, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0958LaminarStudioDrilldownBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0957HoneyHivePublicMethodologyBoundary.test.ts tests/gap0958LaminarStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
