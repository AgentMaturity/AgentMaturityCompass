# GAP-3744 - Langfuse session-correlation boundary

- Gap: `GAP-3744`
- Dimension: `obs-session-correlation`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/langfuse/langfuse`, `https://api.github.com/repos/langfuse/langfuse`, `https://raw.githubusercontent.com/langfuse/langfuse/main/README.md`, `https://raw.githubusercontent.com/langfuse/langfuse/main/LICENSE`, and `https://api.github.com/repos/langfuse/langfuse/contents?ref=main`
- Retrieval: live GitHub API/raw-source checks on 2026-06-26.
- Status: closed through AMC's existing generic cross-surface session-correlation helper; no Langfuse integration, importer, SDK wrapper, trace collector, or OpenTelemetry bridge added.

## Live source metadata

The backlog identifies `langfuse/langfuse` as source `GAP-3744`, category `Observability, monitoring, and traces`, dimension `Cross-surface session correlation`, and requested Watch, Studio, and API surfaces.

Live retrieval on 2026-06-26 verified:

- Repository API `https://api.github.com/repos/langfuse/langfuse` returned HTTP 200, first-200KB hash `aae99724be9092223c0dcba7906f39389dbe635345762fe4c9a6a044ca449334`.
- Repository full name `langfuse/langfuse`, default_branch `main`, license `NOASSERTION`, language `TypeScript`, 29,787 stars, 3,098 forks, 670 open issues, pushed_at `2026-06-25T22:59:48Z`, updated_at `2026-06-26T03:28:14Z`.
- Repository description identifies an `Open source AI engineering platform` for `LLM evals`, observability, metrics, prompt management, playground, datasets, OpenTelemetry, LangChain, OpenAI SDK, and LiteLLM integrations.
- Topics include analytics, evaluation, LangChain, LLM evaluation, LLM observability, LLMOps, monitoring, observability, prompt management, self-hosted, and related AI-engineering labels.
- README raw URL `https://raw.githubusercontent.com/langfuse/langfuse/main/README.md` returned HTTP 200, 52,337 bytes, first-200KB hash `5c11fee04264f54da6db38acf06934f5e483dd1dcdcde43b32fa0eb954cd7a94`; reviewed as source metadata only.
- License raw URL `https://raw.githubusercontent.com/langfuse/langfuse/main/LICENSE` returned HTTP 200, 1,609 bytes, first-200KB hash `7605d1b4ea8a8cb4775fb71a15611cecf71852ca2c6d4b5313effb1cde5acd9d`.
- Top-level contents API `https://api.github.com/repos/langfuse/langfuse/contents?ref=main` returned HTTP 200, first-200KB hash `f83ab7925c741794f6d4a2ee5ac5a4b27b0c4db88725a03a836b7b50ae6b0b2c`, and top-level names including `.agents`, `.devcontainer`, `.github`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, `SECURITY.md`, docker-compose files, `ee`, `fern`, `package.json`, `packages`, `scripts`, `specs`, `web`, and `worker`.

These facts are relevant as public observability, evaluation, prompt-management, metrics, dataset, OpenTelemetry, and trace-platform context only. They do not provide AMC session-correlation evidence.

## Relevance decision

GAP-3744 is relevant to AMC because enterprise users need one inspectable session story across Score, Shield, Watch, API, Studio, and adjacent runtime surfaces. A session-correlation claim must show a stable session ID, surface event list, timestamp chain, missing-event checks, failure clusters or failure-mode counts, and live risk/cost/latency trends.

Langfuse is a useful source-review signal because it is explicitly positioned around LLM evals, observability, metrics, prompt management, playgrounds, datasets, OpenTelemetry, LangChain, OpenAI SDK, LiteLLM, and LLMOps. AMC should not copy or mirror those product areas. The accepted AMC primitive is the existing generic `buildCrossSurfaceSessionCorrelation` helper over AMC-owned normalized traces.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; Score events can participate in a correlated session receipt, but no scoring semantics changed. |
| Shield | Context only; Shield risk decisions can participate in a correlated session receipt, but no Shield verifier changed. |
| Enforce | Context only; callers may require Enforce events, but no guardrail or policy path changed. |
| Vault | Context only; callers may require Vault events, but no storage, DLP, or secret handling changed. |
| Watch | Relevant through session-correlated trace events, missing-event checks, timestamp chain validation, failure clusters, and risk/cost/latency trends. |
| Fleet | Context only; no orchestration topology or fleet trust model changed. |
| Passport | Context only; no proof-bundle schema changed. |
| Comply | Context only; no compliance mapping changed. |

## Product closure

No product code change was required for GAP-3744 because `GAP-3742` already added the AMC-native primitive:

- `buildCrossSurfaceSessionCorrelation`
- `AMCSurfaceId`
- `CrossSurfaceSessionEvent`
- `CrossSurfaceSessionCorrelation`

For this gap, the closure is a source-specific relevance and regression receipt over that generic primitive. The focused test proves that AMC-owned traces can correlate Score, Shield, Watch, API, and Studio events into one session with required surface checks, timestamp chain, risk event counts, failure-mode counts, total cost, and p95 latency.

Added focused regression `tests/gap3744LangfuseSessionCorrelationBoundary.test.ts`.

No Langfuse-specific product code, route, schema, UI, connector, or OpenTelemetry bridge was added.

## Fail-closed rule

Langfuse repository URL, GitHub API metadata, README content, license metadata, star/fork/issue counts, default branch, TypeScript language label, topics, Open source AI engineering platform label, LLM evals label, observability label, metrics label, prompt management label, playground label, datasets label, OpenTelemetry label, LangChain label, OpenAI SDK label, LiteLLM label, LLMOps label, monitoring label, top-level source layout, local backlog metadata, or source identity alone must fail closed for AMC session-correlation claims.

Passing evidence requires an AMC-owned stable session ID, surface event list, timestamp chain, missing-event checks, Watch/API/Studio visibility, failure clusters or failure-mode counts when failures exist, risk/cost/latency trends, and no-copy proof.

## No-bloat boundary

No Langfuse adapter, SDK wrapper, API client, repository importer, OpenTelemetry bridge, LangChain integration, OpenAI SDK integration, LiteLLM integration, prompt-management clone, dataset importer, playground clone, experiment runner, metrics dashboard clone, trace collector, ingestion pipeline, self-hosted deployment profile, Docker compose mirror, web app route, worker, source-specific API route, Studio panel, Watch monitor, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata phrases, license text, docs prose, screenshots, configs, docker-compose files, examples, prompts, datasets, generated outputs, test fixtures, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3744LangfuseSessionCorrelationBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; 3 session-correlation/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap3744LangfuseSessionCorrelationBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired session-correlation regression: `npx vitest run tests/gap3744LangfuseSessionCorrelationBoundary.test.ts tests/gap3742TrendRadarSessionCorrelationBoundary.test.ts tests/observability/sessionCorrelator.test.ts tests/traceFailureIndex.test.ts tests/receiptsCorrelationRuntimeDashboard.test.ts --reporter=dot` passed, 5 files / 23 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1025 files / 8116 tests.
