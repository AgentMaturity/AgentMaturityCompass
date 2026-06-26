# GAP-0954 - PromptLayer replay corpus

- Gap: `GAP-0954`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live PromptLayer homepage `https://promptlayer.com` redirected to `https://www.promptlayer.com/`, docs `https://docs.promptlayer.com/overview`, and GitHub repository `https://github.com/MagnivOrg/prompt-layer-library`
- Retrieval: `2026-06-22` via live source review
- Status: Done

## Live source metadata

The live PromptLayer homepage identified PromptLayer as PromptLayer - Version and test your agents, and described the product as the collaboration layer for AI engineering teams. It also described a prompt CMS, eval harness, and observability stack, and stated that domain experts collaborate without touching the codebase.

The live docs described Observability and evaluations for AI teams and said See what happened. Prove what improved. The docs describe using observability to trace production requests and understand quality, cost, and latency, using Tables to monitor results and run evaluations, and using Prompt Registry to keep approved versions clear. Additional docs signals included Trace, evaluate, release, Compare changes against real examples before they reach users, Eval score, Latency, A simple loop from signal to release, Capture requests, responses, metadata, cost, latency, and feedback in one timeline, Organize datasets, score experiments, and compare versions against real behavior, Ship approved prompt versions, Release Labels, AB Testing, OpenTelemetry, Self-hosting, and MCP.

The live GitHub repository page for `MagnivOrg/prompt-layer-library` showed Star 771, Fork 90, Issues 15, Pull requests 6, 514 Commits, and Apache-2.0 license. The repository README says PromptLayer helps Version, test, and monitor every prompt and agent with robust evals, tracing, and regression sets, and the repository about text says Track, debug, and replay old completions.

Those facts are relevant to AMC only as source-review context for replayable eval evidence. They do not justify a PromptLayer SDK, prompt importer, eval runner, dataset mirror, or source-specific replay path.

## Relevance decision

`GAP-0954` is relevant through AMC's existing eval replay corpus primitive. PromptLayer's prompt-management, eval-harness, observability, tables, datasets, eval-score, release, OpenTelemetry, and replay language maps to AMC's need for a replay manifest, fixture hash, fixed seed, score delta, signed evidence rows, and CI receipt.

The product closure is not PromptLayer parity. It is an AMC-owned replay receipt that proves Score, Shield, and Watch evidence is reproducible without copying upstream prompts, datasets, traces, configs, examples, SDK code, or model outputs.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Primary surface. Replay evidence must include manifest, fixture hash, fixed seed, score delta, and signed rows before score changes are credible. |
| Shield | Relevant when replay rows exercise safety/quality regressions and must fail closed without signed evidence. |
| Watch | Relevant as observability context, but no Watch runtime change is required. |
| Enforce | No runtime policy changed. |
| Vault | No upstream prompts, traces, request logs, API keys, datasets, or outputs stored. |
| Fleet | Agent-monitoring context only; no Fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with PromptLayer-style source context. The positive path proves AMC accepts this context only through an AMC-owned replay manifest, fixture hash, fixed seed, source refs, baseline/candidate run IDs, score delta, signed evidence refs, Score/Shield/Watch coverage, and CI receipt. The negative path proves PromptLayer product/docs/repository/eval/observability/table/dataset/replay metadata fails closed when it replaces AMC-owned replay evidence.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

## Fail-closed rule

Live PromptLayer homepage reachability, docs reachability, GitHub reachability, prompt CMS labels, eval harness labels, observability stack labels, domain-expert collaboration labels, production request trace labels, quality/cost/latency labels, Tables labels, dataset labels, eval-score labels, Prompt Registry labels, release labels, AB Testing labels, OpenTelemetry labels, Self-hosting labels, MCP labels, Star 771, Fork 90, Issues 15, Pull requests 6, 514 Commits, Apache-2.0 license, robust evals/tracing/regression-set labels, Track/debug/replay old completions labels, local backlog metadata, or competitor identity alone must fail closed for replay-corpus evidence.

Passing replay-corpus evidence requires AMC-owned source refs, replay manifest, fixture hash, fixed seed, score delta, signed evidence refs, Score/Shield/Watch coverage, CI receipt, and no copied upstream artifacts.

## No-bloat boundary

No PromptLayer integration, SDK wrapper, prompt importer, eval runner, table importer, dataset mirror, registry sync, release-label sync, OpenTelemetry exporter, replay-old-completions importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, source-specific implementation module, source-specific scoring path, or parity wrapper was added. No PromptLayer code, docs prose beyond minimal metadata facts, screenshots, examples, configs, prompts, traces, request logs, datasets, eval rows, benchmark rows, model outputs, generated outputs, API keys, or implementation details were copied into AMC.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0954PromptLayerReplayCorpusBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the replay receipt, fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0954PromptLayerReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression with `GAP-0953`: `npx vitest run tests/gap0953LunaryQuestionExplainabilityBoundary.test.ts tests/gap0954PromptLayerReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
