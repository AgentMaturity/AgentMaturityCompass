# GAP-0985 - DSPy question-explainability boundary

- Gap: `GAP-0985`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live DSPy site at `https://dspy.ai`, DSPy metrics guide at `https://dspy.ai/getting-started/metrics/`, DSPy metrics and evaluation guide at `https://dspy.ai/diving-deeper/metrics-and-evaluation/`, GitHub repository/API at `https://github.com/stanfordnlp/dspy`, raw README at `https://raw.githubusercontent.com/stanfordnlp/dspy/main/README.md`, raw license at `https://raw.githubusercontent.com/stanfordnlp/dspy/main/LICENSE`, raw project file at `https://raw.githubusercontent.com/stanfordnlp/dspy/main/pyproject.toml`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through web research, GitHub CLI/API, raw GitHub content, and `git ls-remote`.
- Status: closed through existing question-level score explainability receipts only when AMC-owned question evidence exists; no DSPy adapter, optimizer bridge, metric importer, Evaluate runner, trace importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or source-specific question lens added.
- Linear: `AMC-1264`

## Live source metadata

The live DSPy site identifies the product with the tagline `Program, don't prompt`, describes DSPy as a Python framework for building AI systems, and lists python >= 3.10, MIT license, Stanford NLP, 6.4M+ monthly downloads, 433+ contributors, and 35k github stars. Source-review signals include Signatures, Modules, Optimizers, ReAct, tools, GEPA, built-in Evaluation APIs, Debugging & Observability, Tracking DSPy Optimizers, and production-use examples.

The live GitHub page identifies `stanfordnlp/dspy` as a Public repository on branch `main` with 4,562 commits, MIT license metadata, 35.3k stars, 3k forks, 201 watchers, 109 releases, latest release `3.2.1`, and primary language Python. The GitHub API returned `archived` false, `disabled` false, `fork` false, default branch `main`, language Python, MIT License, 35,347 stars, 3,000 forks, 536 open issues, watchers_count `35347`, created_at `2023-01-09T21:01:51Z`, pushed_at `2026-06-18T16:57:05Z`, and updated_at `2026-06-24T11:36:37Z`.

`git ls-remote https://github.com/stanfordnlp/dspy.git HEAD refs/heads/main refs/tags/3.2.1` verified default branch `main` at `498760149b230f402c56bece2aa45df6e1ba946b` and tag `3.2.1` at `27a8e2a134b0b8dbd2d7433ea67ffe9be627d376`. Raw README, LICENSE, and pyproject files returned `HTTP/2 200`.

The metrics guide says optimizers need a metric and baseline evaluation, and that DSPy metrics focus on task goals after Signatures handle output structure. The deeper Metrics and evaluation guide says `Evaluate` runs metrics across datasets, a metric can be any callable returning a score, the optimizer-facing signature can include trace/prediction trace parameters, return types include bool, float, or `dspy.Prediction(score, feedback)`, `Evaluate` aggregates scores, feedback is read by GEPA rather than `Evaluate`, `trace` lets metrics vary between evaluation and optimization, metric failures receive `failure_score`, and `EvaluationResult` is the single return shape.

No DSPy code, README prose beyond short metadata facts, docs prose, examples, prompts, optimizer code, metric code, signatures, datasets, tutorials, production-use examples, screenshots, package metadata beyond minimal facts, generated outputs, model responses, or implementation details were copied into AMC.

## Relevance decision

GAP-0985 is relevant to AMC only through existing question-level score explainability proof. DSPy is directly relevant as a metric/evaluation framework because it emphasizes metrics, baseline evaluation, score/feedback return shapes, traces, and evaluation results. Those concepts reinforce AMC's need to explain why each L0-L5 question moved, which evidence was accepted, which evidence was rejected, what repair hint exists, and which reproducible eval pack or threshold backs the claim.

The accepted AMC primitive is already `buildQuestionExplainabilityReport` plus `buildEvalScoreExplainabilityPack`. DSPy website claims, GitHub popularity, metrics docs, Evaluate docs, trace labels, feedback labels, optimizer labels, production-use labels, local backlog metadata, or source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows, accepted evidence IDs, rejected evidence reasons, repair hints, and L0-L5 question movement rationale. |
| Shield | Relevant when fail-closed thresholds and rejected-evidence reasons prevent metric/docs/source-metadata claims from passing unsupported. |
| Enforce | No runtime policy, optimizer bridge, DSPy runner, metric runner, API key behavior, or circuit breaker changed. |
| Vault | No dataset, prompt, trace, optimizer output, model output, API key, or private artifact storage changed. |
| Watch | Relevant when question-level repair hints connect to reproducible eval packs, CI thresholds, and evidence drilldown; no live monitor changed. |
| Fleet | Agent/ReAct/multi-module context only; no Fleet topology, routing, or orchestration behavior changed. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` behavior with AMC-owned synthetic fixture data.

The positive path proves DSPy source context can be accepted only when AMC-owned question rows include a real question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence, reproducible eval pack, fail-closed thresholds, row hash, and source refs. The negative path fails closed when DSPy website metadata, GitHub metadata, metric labels, Evaluate labels, trace labels, feedback labels, optimizer labels, production-use labels, and local backlog metadata replace AMC-owned question evidence.

## Fail-closed rule

DSPy website identity, GitHub counts, release tags, default-branch SHA, MIT License label, Python label, monthly download labels, contributor labels, Signatures labels, Modules labels, Optimizers labels, ReAct/tool labels, GEPA labels, Evaluate labels, EvaluationResult labels, score/feedback labels, trace labels, failure_score labels, production-use labels, local backlog metadata, or source identity alone cannot prove AMC question-level score explainability.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence refs, row hash, source refs, reproducible eval pack, fail-closed thresholds, Score/Shield/Watch mapping, and no-copy proof.

## No-bloat boundary

No DSPy adapter, optimizer bridge, metric importer, Evaluate runner, trace importer, feedback importer, signature importer, module importer, ReAct wrapper, GEPA bridge, dataset importer, tutorial importer, production-example importer, GitHub importer, pyproject importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific question lens was added.

No upstream code, README prose beyond short metadata facts, docs prose, examples, prompts, optimizer code, metric code, signatures, datasets, tutorials, production-use examples, screenshots, package metadata beyond minimal facts, generated outputs, model responses, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0985DspyQuestionExplainabilityBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0985-dspy-question-explainability.md'`; 3 question-explainability primitive tests passed.
- Focused regression: `npx vitest run tests/gap0985DspyQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0984AgentBenchProviderDriftBoundary.test.ts tests/gap0985DspyQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 832 files / 7,324 tests.
