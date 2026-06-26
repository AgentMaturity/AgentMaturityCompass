# GAP-0969 - UpTrain live drift

- Gap: `GAP-0969`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/uptrain-ai/uptrain`, live UpTrain docs at `https://docs.uptrain.ai/`, and docs introduction at `https://docs.uptrain.ai/getting-started/introduction`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing Watch live score and behavior drift receipts only; no UpTrain adapter, UpTrain dashboard, evaluator import, RCA import, prompt-drift benchmark import, or source-specific monitor added.
- Linear: `AMC-1247`

## Live source metadata

The live GitHub repository page identifies `uptrain-ai/uptrain` as public and showed 2.4k stars, 202 forks, 44 issues, 11 pull requests, 0 security and quality findings, 770 commits, and Apache-2.0 license labeling during review.

The repository and docs describe UpTrain as an open-source platform for evaluating and improving LLM applications with 20+ preconfigured evaluations, local dashboard usage, root cause analysis, response and context checks, language/code/conversation checks, safety checks such as Prompt Injection and Jailbreak Detection, and integrations including OpenAI, Claude, Ollama, Langfuse, Qdrant, FAISS, and Chroma.

Named evaluation examples reviewed include Response Completeness, Factual Accuracy, Context Relevance, Prompt Injection, and Jailbreak Detection. These names are source-review metadata only.

The repository also includes Monitoring Prompt Drift language around evaluating model behavior on a fixed dataset. That is relevant source-review context, not AMC evidence by itself.

No UpTrain code, docs prose beyond minimal metadata facts, dashboard assets, examples, prompts, datasets, benchmark outputs, configs, traces, screenshots, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0969 is relevant to AMC only through existing Watch live drift receipts. UpTrain's evaluation and prompt-drift context maps to a known AMC requirement: compare a baseline distribution with a live sample, compute a drift statistic, and produce an alert receipt tied to signed evidence.

This does not justify adding UpTrain itself to AMC. AMC should continue to use `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` for source-independent live score and behavior drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through score deltas calculated from AMC-owned baseline and live rows. |
| Shield | Relevant when drift indicates safety, jailbreak, prompt-injection, refusal, invalid-action, or error-attribution regressions. |
| Enforce | No runtime policy or circuit breaker changed in this slice. |
| Vault | No data security, secrets, privacy, or storage behavior changed. |
| Watch | Primary surface. Existing live score and behavior drift receipts already model baseline distribution, live sample, drift statistic, and alert receipt. |
| Fleet | Agent workflow context only; no Fleet product change is required. |
| Passport | No portable trust-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code changed. The focused regression proves existing Watch primitives can accept UpTrain context only when AMC has signed baseline/live evidence. The positive path exercises score mean, behavior signature, refusal rate, latency, and cost drift alerts. The negative path fails closed when UpTrain metadata replaces signed evidence.

## Fail-closed rule

UpTrain source metadata, repository claims, docs claims, dashboard labels, preconfigured-evaluation labels, RCA labels, prompt-drift benchmark labels, fixed-dataset labels, integration labels, star/fork/issue/PR counts, and local backlog metadata are not live AMC evidence.

A live score and behavior drift claim must fail closed unless each baseline and live sample has evidence refs and signed evidence refs, plus enough rows to compute the drift statistic and alert receipt.

## No-bloat boundary

No UpTrain adapter, dashboard clone, evaluator importer, RCA importer, prompt-drift benchmark importer, dataset copy, prompt copy, benchmark mirror, integration wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, benchmark outputs, configs, traces, generated outputs, model responses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0969UpTrainLiveDriftBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0968PatronusReplayCorpusBoundary.test.ts tests/gap0969UpTrainLiveDriftBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
