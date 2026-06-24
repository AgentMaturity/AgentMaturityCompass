# GAP-0949 - LangWatch live drift

- Gap: `GAP-0949`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: live LangWatch homepage at `https://langwatch.ai`, canonical `https://langwatch.ai/`, and docs at `https://docs.langwatch.ai/`
- Retrieval: 2026-06-22 live source review
- Status: Done

## Relevance decision

LangWatch is relevant to AMC only as an observability and evaluation market signal for live score and behavior drift. The live LangWatch homepage positions LangWatch as "The #1 AI engineering platform" for testing AI agents "pre- and in production"; it says teams can "Simulate real-world" scenarios, "Turn production traces into evals", and use Traces, Evaluations, Agent Simulations, Prompt Management, and Auto-prompt optimization. The same homepage claims 780k+ Monthly installs, 900k+ Daily evaluations to prevent hallucinations, and 5,6k+ Total Github stars.

The source is useful because it describes the same operational failure mode AMC Watch already covers: AI agents can break or behave differently in production, a model swap can degrade quality, and a prompt change introduces regressions. It also says teams can monitor production signals, and references Evaluating RAG quality, Testing Multimodal Voice agents, Test Multi-turn Conversations, and Ensure agents use the right tools for simulations.

This does not justify a LangWatch integration. AMC should close the gap through existing Watch live-drift receipts that require a baseline distribution, live sample, drift statistic, and alert receipt linked to signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through score deltas calculated from AMC-owned baseline and live rows. |
| Shield | Relevant when drift indicates quality, refusal, invalid-action, or error-attribution regressions that need escalation. |
| Enforce | No direct runtime policy change in this slice. |
| Vault | No secrets, privacy, or storage change. |
| Watch | Primary surface. Existing live score and behavior drift receipts already model production-signal monitoring and alert receipts. |
| Fleet | Indirectly relevant for multi-step and multi-agent behavior, but no Fleet product change is required. |
| Passport | No portable trust-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code changed. The focused regression proves existing Watch primitives can accept LangWatch-like market context only when AMC has signed baseline/live evidence. The positive path exercises score mean, behavior signature, refusal rate, latency, and cost drift alerts. The negative path fails closed when LangWatch metadata replaces signed evidence.

Live reviewed facts from the LangWatch source include Real-time Evaluations, LLM Observability, Measure the impact of every update, Run thousands of synthetic conversations, Batch Tests & Experiments, Auto-Evals, Data review & labeling, Dataset management, and Convert production traces into reusable test cases, golden datasets, and benchmarks.

The docs identify LangWatch: The Complete LLMOps Platform, describe comprehensive observability, evaluations and agent simulations, and state that Every LLM call, tool usage, and user interaction is tracked with detailed traces, spans, and metadata. The same docs describe online tracing, prompt management, production evaluations, and offline evaluations.

The homepage also says LangWatch is OpenTelemetry native, has Evaluations and Agent Simulations running on your existing testing infra, is Fully open-source, and has No data lock-in.

## Fail-closed rule

LangWatch source metadata, homepage claims, docs copy, install counts, evaluation counts, or GitHub-star counts are not live AMC evidence. A live-drift claim must fail closed unless each baseline and live sample has evidence refs and signed evidence refs, plus enough rows to compute the drift statistic and alert receipt.

## No-bloat boundary

No LangWatch adapter, importer, OpenTelemetry wrapper, simulation runner, benchmark mirror, dataset copy, prompt copy, or source-specific module was added. AMC does not copy upstream code, docs prose, screenshots, examples, configurations, datasets, or generated traces. The closure stays inside existing Watch live-drift receipts.

## Verification

- `npx vitest run tests/gap0949LangWatchLiveDriftBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- `npx vitest run tests/gap0948CometOpikLiveDriftBoundary.test.ts tests/gap0949LangWatchLiveDriftBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- `npm run typecheck` - passed.
