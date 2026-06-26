# GAP-3754 - promptflow risk/cost/latency SLO boundary

- Gap: `GAP-3754`
- Dimension: `obs-risk-cost-latency-slo`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/microsoft/promptflow`, `https://api.github.com/repos/microsoft/promptflow`, `https://raw.githubusercontent.com/microsoft/promptflow/main/README.md`, `https://raw.githubusercontent.com/microsoft/promptflow/main/LICENSE`, and `https://api.github.com/repos/microsoft/promptflow/contents?ref=main`
- Retrieval: live GitHub repository, GitHub API, raw README, raw license, and contents API checks on 2026-06-26.
- Status: closed through AMC's generic risk, cost, and latency SLO receipt builder from GAP-3752; no promptflow integration, importer, runner, pipeline adapter, dashboard clone, or source-specific route added.

## Live source metadata

The backlog identifies `microsoft/promptflow` as source `GAP-3754`, category `Observability, monitoring, and traces`, dimension `Risk, cost, and latency SLOs`, and requested Watch, Studio, and API surfaces. The acceptance line requires `SLO definition, time window, breach evidence, and alert routing`.

Live retrieval on 2026-06-26 verified:

- Repository page `https://github.com/microsoft/promptflow` returned HTTP 200, 369,455 bytes, first-200KB hash `39bf11b02facfa3d4156e4664bea71b1f802d6f75ac810882f841d88299d7d27`, and contained reviewed metadata phrases including `Build high-quality LLM apps`, `prototyping`, `testing`, `production deployment`, `monitoring`, `evaluation`, `tracing`, `metrics`, `prompt`, `flow`, `LLM`, `LLMs`, `Python`, `quality`, `deploy`, `deployment`, and `CI/CD`.
- Repository API `https://api.github.com/repos/microsoft/promptflow` returned HTTP 200, first-200KB hash `cdd0ed37c8c28850d0f61c638739e0cdf369004b2a311ed5984e2adb64264ee3`, full name `microsoft/promptflow`, default_branch `main`, license `MIT`, language `Python`, 11,164 stars, 1,103 forks, 81 open issues, pushed_at `2026-06-18T13:16:52Z`, updated_at `2026-06-25T17:15:47Z`, archived `false`, disabled `false`, and description `Build high-quality LLM apps - from prototyping, testing to production deployment and monitoring.`
- Repository topics include ai, ai-application-development, ai-applications, chatgpt, gpt, llm, prompt, and prompt-engineering.
- Raw README `https://raw.githubusercontent.com/microsoft/promptflow/main/README.md` returned HTTP 200, 9,899 bytes, first-200KB hash `88ee4704b8fe540da6fbf415438ac00ed88818bf812be395cae675a07195e7d2`, and contained reviewed metadata phrases including `prototyping`, `testing`, `production deployment`, `monitoring`, `evaluation`, `tracing`, `metrics`, `prompt`, `flow`, `LLM`, `LLMs`, `Python`, `quality`, `deploy`, `deployment`, and `CI/CD`.
- Raw license `https://raw.githubusercontent.com/microsoft/promptflow/main/LICENSE` returned HTTP 200, 1,141 bytes, first-200KB hash `c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383`.
- Contents API `https://api.github.com/repos/microsoft/promptflow/contents?ref=main` returned HTTP 200, first-200KB hash `157423503ea236445d25489a7504e65d05263a551f13e4f1df70001d1a603d6c`, and top-level names including `.github`, `LICENSE`, `README.md`, `SECURITY.md`, `SUPPORT.md`, `benchmark`, `docs`, `examples`, `migration-guide`, `scripts`, and `src`.

These facts are relevant as public LLM application prototyping, testing, deployment, monitoring, evaluation, tracing, metrics, prompt, flow, and CI/CD context only. They do not provide AMC SLO proof.

## Relevance decision

GAP-3754 is relevant to AMC because production LLM app workflows need operating SLOs that combine reliability, risk incidents, token cost, latency, and escalation rate. The source confirms the same lifecycle pressure from prototyping and testing through production deployment and monitoring.

The accepted AMC primitive is the existing generic `buildRiskCostLatencySloReceipt` added for GAP-3752. Promptflow is source-review context only. AMC closure requires AMC-owned SLO definition, time window, trace rows, failure clusters, live trends, breach evidence, and alert routing. It does not justify importing promptflow flows, executing promptflow pipelines, or cloning promptflow monitoring.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as runtime SLO evidence that can explain score findings; no scoring methodology version changed. |
| Shield | Relevant when risk incidents and escalation breaches indicate safety or review gaps. |
| Enforce | Context only; no runtime guardrail, action block, or circuit breaker changed. |
| Vault | Context only; no secure storage, DLP, privacy, or residency behavior changed. |
| Watch | Primary surface; generic SLO receipts include trace search rows, failure clusters, live trends, breach evidence, and alert routing. |
| Fleet | Relevant because the receipt is per-agent and includes Fleet as an operating-posture surface binding. |
| Passport | Downstream proof-bundle context only; no Passport schema changed. |
| Comply | Audit context only; no compliance mapping changed. |

## Product closure

No product code change was required for GAP-3754. AMC already has the generic primitive for this gap:

- `buildRiskCostLatencySloReceipt`
- `buildRiskCostLatencySloWatchAlerts`

Added focused regression `tests/gap3754PromptflowRiskCostLatencySloBoundary.test.ts`.

The positive path proves promptflow context can be cited only when AMC-owned SLO receipts include SLO definition, time window, trace index entries, row hashes, failure clusters, live risk/cost/latency trends, breach evidence, and alert routing. The negative path fails closed when promptflow repository metadata replaces SLO rows and routing.

## Fail-closed rule

Promptflow repository identity, GitHub API metadata, README metadata, license metadata, contents metadata, Build high-quality LLM apps label, prototyping label, testing label, production deployment label, monitoring label, evaluation label, tracing label, metrics label, prompt label, flow label, LLM labels, Python label, CI/CD label, stars, forks, open issues, default branch, topics, local backlog metadata, or source identity alone must fail closed for risk, cost, and latency SLO proof.

Passing proof requires AMC-owned SLO definition, time window, objective thresholds, alert routing, trace rows, signed or hashed evidence refs, trace row hashes, trace search fields, failure clusters, live trend metrics, breach evidence, alert route IDs, receipt hash, and no-copy proof.

## No-bloat boundary

No promptflow adapter, flow importer, pipeline runner, Azure integration, benchmark importer, example importer, prompt importer, evaluation runner, trace importer, monitoring bridge, CI/CD bridge, dashboard clone, source-specific Watch monitor, Studio panel, API route, CLI command, Fleet state migration, Passport field, methodology bump, package dependency, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata phrases, docs prose, examples, benchmark rows, flow definitions, prompts, configs, screenshots, generated outputs, trace rows, metrics rows, event rows, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3754PromptflowRiskCostLatencySloBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist, with 3 SLO/no-bloat tests passing.
- Focused test after doc: `npx vitest run tests/gap3754PromptflowRiskCostLatencySloBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired SLO regression: `npx vitest run tests/gap3754PromptflowRiskCostLatencySloBoundary.test.ts tests/gap3752OpenTelemetryGenAiRiskCostLatencySloBoundary.test.ts tests/observability/sessionCorrelator.test.ts tests/traceFailureIndex.test.ts tests/fleetGovernance.test.ts --reporter=dot` passed, 5 files / 30 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1031 files / 8140 tests.
