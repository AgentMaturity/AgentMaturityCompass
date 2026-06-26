# GAP-0972 - lm-evaluation-harness question-explainability boundary

- Gap: `GAP-0972`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/EleutherAI/lm-evaluation-harness`, docs directory at `https://github.com/EleutherAI/lm-evaluation-harness/tree/main/docs`, interface docs at `https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/interface.md`, and task guide at `https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/task_guide.md`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing question-level score explainability receipts only when AMC-owned question evidence exists; no lm-evaluation-harness adapter, task importer, benchmark runner, leaderboard mirror, YAML parser, backend wrapper, or source-specific question lens added.
- Linear: `AMC-1250`

## Live source metadata

The live GitHub repository page identifies EleutherAI lm-evaluation-harness, `EleutherAI/lm-evaluation-harness`, as a public repository with 13k stars, 3.4k forks, 573 issues, 301 pull requests, 4,025 commits, and MIT license. The README names the Language Model Evaluation Harness and describes it as a unified framework to test generative language models on many evaluation tasks.

Relevant source-review signals include Over 60 standard academic benchmarks, hundreds of subtasks and variants, support for `transformers`, vLLM, OpenAI, TextSynth, local models and benchmarks, publicly available prompts for reproducibility and comparability, custom prompts and evaluation metrics, Open LLM Leaderboard backend usage, CLI refactored with subcommands `run, ls, validate`, YAML config file support, docs for interface usage, and the Task Guide.

No lm-evaluation-harness code, README prose beyond short metadata facts, docs prose, examples, prompts, YAML configs, task definitions, result tables, leaderboard rows, backend wrappers, tests, datasets, or implementation details were copied into AMC.

## Relevance decision

GAP-0972 is relevant to AMC only through existing question-level score explainability proof. The source's benchmark/task/model context reinforces why each AMC L0-L5 question needs a concrete explanation: question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, fail-closed thresholds, row hash, and source refs.

The accepted AMC primitive is already `buildQuestionExplainabilityReport` plus `buildEvalScoreExplainabilityPack`. lm-evaluation-harness repository metadata, README labels, task names, backend labels, leaderboard labels, CLI labels, YAML labels, docs pages, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and L0-L5 movement rationale. |
| Shield | Relevant when fail-closed thresholds and rejected-evidence reasons prevent unsafe or unsupported benchmark-style claims from passing. |
| Enforce | No runtime policy, model backend, task runner, YAML config, or circuit breaker changed. |
| Vault | No dataset storage, benchmark row storage, credential handling, or private model artifact handling changed. |
| Watch | Relevant when question-level repair hints tie to reproducible eval packs, CI thresholds, and evidence drilldown; no live monitor changed. |
| Fleet | Benchmark and model-provider context only; no Fleet topology or orchestration changed. |
| Passport | No portable proof-bundle schema changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with AMC-owned synthetic fixture data.

The positive path proves lm-evaluation-harness source context can be accepted only when AMC-owned question rows include a real question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, reproducible eval pack, fail-closed thresholds, row hash, and source refs. The negative path fails closed when repository metadata, docs labels, task labels, backend labels, CLI labels, and leaderboard labels replace AMC-owned question evidence.

## Fail-closed rule

lm-evaluation-harness repository identity, GitHub counts, Language Model Evaluation Harness label, benchmark count labels, subtasks and variants labels, backend labels, OpenAI/TextSynth/vLLM/transformers labels, publicly available prompt labels, custom metric labels, Open LLM Leaderboard labels, CLI labels, `run, ls, validate` labels, YAML config labels, Task Guide labels, local backlog metadata, or source identity alone cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, row hash, source refs, reproducible eval pack, fail-closed thresholds, Score/Shield/Watch mapping, and no-copy proof.

## No-bloat boundary

No lm-evaluation-harness adapter, SDK/importer, task importer, dataset importer, benchmark runner, leaderboard mirror, YAML parser, backend wrapper, prompt importer, model-provider integration, CLI bridge, API route, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific question lens was added.

No upstream code, README prose beyond short metadata facts, docs prose, examples, prompts, YAML configs, task definitions, result tables, leaderboard rows, backend wrappers, tests, datasets, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0972LmEvaluationHarnessQuestionExplainabilityBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0971InspectAiReplayCorpusBoundary.test.ts tests/gap0972LmEvaluationHarnessQuestionExplainabilityBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
