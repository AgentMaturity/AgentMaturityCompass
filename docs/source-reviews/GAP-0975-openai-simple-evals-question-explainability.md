# GAP-0975 - OpenAI Simple Evals question-explainability boundary

- Gap: `GAP-0975`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/openai/simple-evals`, GitHub repository API, OpenAI Evals repository reference at `https://github.com/openai/evals`, SimpleQA arXiv record at `https://arxiv.org/abs/2411.04368`, BrowseComp arXiv record at `https://arxiv.org/abs/2504.12516`, and local backlog metadata
- Retrieval: `2026-06-24` live source review through web research, GitHub API, `git ls-remote`, and the local backlog row.
- Status: closed through existing question-level score explainability receipts only when AMC-owned question evidence exists; no OpenAI Simple Evals adapter, benchmark runner, sampler wrapper, result-table mirror, command bridge, or source-specific question lens added.
- Linear: `AMC-1254`

## Live source metadata

The live GitHub repository page identifies `openai/simple-evals` as a public repository on the `main` branch with 4.5k stars, 492 forks, 34 issues, 22 pull requests, 86 commits, and an MIT license. GitHub repository API verification returned `full_name: openai/simple-evals`, default branch `main`, HEAD `652c89d0ca9df547706735883097e9537d40dc47`, 4,537 stars, 492 forks, combined open issues and pull requests count 56, Python as the primary language, and pushed-at timestamp `2026-04-22T22:16:18Z`.

The live README-visible source signal includes a July 2025 deprecation notice: the repository will no longer be updated for new models or benchmark results, but will continue to host reference implementations for HealthBench, BrowseComp, and SimpleQA. The repository describes itself as a lightweight library for evaluating language models and says it is transparent about the accuracy numbers published alongside newer models.

Relevant source-review signals include Benchmark Results, MMLU, GPQA, MATH, HumanEval, MGSM, DROP, SimpleQA, BrowseComp, HealthBench, zero-shot, chain-of-thought setting, not accepting new evals, a note that the repository is NOT intended as a replacement for `https://github.com/openai/evals`, OpenAI and Claude sampling interfaces, and local run commands such as `python -m simple-evals.simple_evals --list-models` and `python -m simple-evals.simple_evals --model <model_name> --examples <num_examples>`.

No OpenAI Simple Evals code, docs prose beyond short metadata facts, benchmark rows, benchmark datasets, prompts, examples, sampler implementations, result tables, model outputs, command snippets beyond minimal command identity, screenshots, tests, or implementation details were copied into AMC.

## Relevance decision

GAP-0975 is relevant to AMC only through existing question-level score explainability proof. OpenAI Simple Evals is a small, benchmark-oriented evaluation repository, and its deprecation notice makes the no-bloat boundary stronger: AMC should not build a source-specific adapter for a repository that explicitly limits future updates.

The accepted AMC primitive is already `buildQuestionExplainabilityReport` plus `buildEvalScoreExplainabilityPack`. Simple Evals repository metadata, deprecation labels, benchmark table labels, benchmark names, sampler labels, run-command labels, model result labels, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and L0-L5 question movement rationale. |
| Shield | Relevant when fail-closed thresholds and rejected-evidence reasons prevent benchmark-table or source-metadata claims from passing unsupported. |
| Enforce | No runtime policy, evaluator command bridge, model sampler, API key behavior, or circuit breaker changed. |
| Vault | No benchmark dataset, result table, prompt, model output, API key, or private evaluation artifact storage changed. |
| Watch | Relevant when question-level repair hints connect to reproducible eval packs, CI thresholds, and evidence drilldown; no live monitor changed. |
| Fleet | Model-comparison and sampler context only; no Fleet topology, routing, or orchestration changed. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with AMC-owned synthetic fixture data.

The positive path proves OpenAI Simple Evals source context can be accepted only when AMC-owned question rows include a real question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, reproducible eval pack, fail-closed thresholds, row hash, and source refs. The negative path fails closed when repository metadata, deprecation labels, benchmark labels, sampler labels, run-command labels, model-result labels, and local backlog metadata replace AMC-owned question evidence.

## Fail-closed rule

OpenAI Simple Evals repository identity, GitHub counts, deprecation notice, lightweight-library label, transparency label, benchmark-result table labels, MMLU/GPQA/MATH/HumanEval/MGSM/DROP/SimpleQA/BrowseComp/HealthBench labels, zero-shot/chain-of-thought labels, sampler labels, OpenAI/Claude API labels, local command labels, benchmark result labels, local backlog metadata, or source identity alone cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, row hash, source refs, reproducible eval pack, fail-closed thresholds, Score/Shield/Watch mapping, and no-copy proof.

## No-bloat boundary

No OpenAI Simple Evals adapter, SDK/importer, task importer, dataset importer, benchmark runner, result-table mirror, sampler wrapper, OpenAI/Claude API bridge, command bridge, prompt importer, model-output importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific question lens was added.

No upstream code, docs prose beyond short metadata facts, benchmark rows, benchmark datasets, prompts, examples, sampler implementations, result tables, model outputs, command snippets beyond minimal command identity, screenshots, tests, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0975OpenAiSimpleEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0975-openai-simple-evals-question-explainability.md'`; 3 question-explainability primitive tests passed.
- Focused regression: `npx vitest run tests/gap0975OpenAiSimpleEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0974OpenCompassReplayCorpusBoundary.test.ts tests/gap0975OpenAiSimpleEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - 822 files / 7,287 tests passed.
