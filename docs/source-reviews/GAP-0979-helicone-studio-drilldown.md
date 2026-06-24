# GAP-0979 - Helicone Studio drilldown boundary

- Gap: `GAP-0979`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/Helicone/helicone`, raw README at `https://raw.githubusercontent.com/Helicone/helicone/main/README.md`, raw license at `https://raw.githubusercontent.com/Helicone/helicone/main/LICENSE`, docs root `https://docs.helicone.ai/`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub CLI/API, raw GitHub content, and `git ls-remote`.
- Status: closed through existing Score/Watch Studio evidence drilldown receipts only; no Helicone adapter, AI Gateway integration, trace importer, request-log importer, dashboard clone, analytics importer, OpenLLMetry bridge, MCP server bridge, or source-specific Studio panel added.
- Linear: `AMC-1258`

## Live source metadata

The live GitHub API identifies `Helicone/helicone` as a public, non-archived TypeScript repository. Current review metadata showed 5,854 stars, 609 forks, 33 open issues, 55 watchers, Apache License 2.0, default branch `main`, pushed_at `2026-06-11T19:46:29Z`, updated_at `2026-06-24T10:15:01Z`, created_at `2023-01-31T22:34:44Z`, and latest release `v2025.08.21-1` published `2025-08-21T18:47:38Z`.

`git ls-remote --symref https://github.com/Helicone/helicone.git HEAD` verified default branch `main` at `4df16a30ab79bc6f31e4b3a29aca179d767db878`. Tag discovery included `v0.0.1`, `v1.0.0`, `v2025.08.20`, `v2025.08.21`, and `v2025.08.21-1`.

The raw README identifies Helicone as an AI Gateway and LLM Observability Platform. Source-review signals relevant to Studio evidence drilldown include observability, agent tracing, LLM routing, cost and latency tracking, datasets and fine-tuning, automatic fallbacks, traces and sessions, cost/latency/quality metrics, prompt management, OpenAI, Anthropic, LangChain, Gemini, Vercel AI SDK, OpenLLMetry, RAGAS, request export, data ownership, and MCP server context.

The GitHub contents API shows source areas including `web`, `worker`, `packages`, `sdk`, `shared`, `clickhouse`, `supabase`, `docker`, `docs`, `helicone-mcp`, `helicone-cron`, `helicone-heartbeat`, and `tests`. These are useful source-review signals for observability and drilldown context only.

No Helicone code, README prose beyond short metadata facts, docs prose, screenshots, UI assets, request logs, traces, prompts, datasets, configs, Docker/Helm files, generated outputs, model responses, or implementation details were copied into AMC.

## Relevance decision

GAP-0979 is relevant to AMC only through existing Studio evidence drilldown behavior. The useful source signal is an operator workflow for inspecting traces, sessions, receipts, request metadata, costs, latency, prompts, and source artifacts from one place. It does not justify a Helicone integration or a new AMC observability subsystem.

The accepted AMC primitive already exists: `buildScoreEvidenceDrilldown` plus `buildWatchObsStudioSourceArtifactLinks`. Valid proof requires UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, accepted/rejected evidence, row hash, and signed Score/Shield/Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through Score evidence drilldown rows that bind findings to accepted/rejected signed evidence. |
| Shield | Relevant when guardrail, prompt, unsafe-behavior, or request evidence appears in the drilldown preview. |
| Enforce | No runtime policy, AI Gateway, routing, fallback, or circuit breaker changed. |
| Vault | No secrets, request logs, data ownership, DLP, privacy, or storage behavior changed. |
| Watch | Relevant through existing Watch source artifact links, observability preview receipts, and empty/error states. |
| Fleet | Agent tracing context only; no Fleet topology or orchestration behavior changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | SOC 2/GDPR positioning is context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing Studio drilldown primitives can accept Helicone context only when AMC has a UI route, source artifact links, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source artifact preview hash, empty-state hash, error-state hash, accepted evidence, rejected evidence, and row hash proof.

The acceptance contract remains UI route, source artifact links, evidence preview, and empty/error states, with all preview hashes and evidence IDs owned by AMC. The negative path fails closed when Helicone repository metadata replaces AMC-owned evidence preview receipts.

## Fail-closed rule

Helicone repository metadata, README labels, license labels, star/fork/issue/watcher counts, release tags, default-branch SHA, TypeScript label, AI Gateway label, LLM Observability Platform label, agent tracing label, LLM routing label, cost and latency tracking label, datasets and fine-tuning label, automatic fallbacks label, traces and sessions labels, prompt management labels, provider names, OpenLLMetry label, RAGAS label, MCP server label, folder names, docs links, local backlog metadata, or source identity alone cannot prove Studio evidence drilldown.

A Studio evidence drilldown claim must fail closed unless UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, accepted/rejected evidence, row hash, and signed evidence exist.

## No-bloat boundary

No Helicone adapter, AI Gateway integration, request-log importer, trace importer, analytics importer, dashboard clone, prompt manager, cost database importer, data-export importer, OpenLLMetry bridge, MCP server bridge, ClickHouse/Supabase/Minio integration, Docker/Helm integration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata facts, docs prose, screenshots, UI assets, request logs, traces, prompts, datasets, configs, Docker/Helm files, generated outputs, model responses, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0979HeliconeStudioDrilldownBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0979-helicone-studio-drilldown.md'`; 3 Studio drilldown primitive tests passed.
- Focused regression: `npx vitest run tests/gap0979HeliconeStudioDrilldownBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0978AutonomousAgentsReviewQuestionExplainabilityBoundary.test.ts tests/gap0979HeliconeStudioDrilldownBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - passed, 826 files / 7,303 tests.
- Cleanup: `npm run clean` - removed generated `dist/` output before staging.
