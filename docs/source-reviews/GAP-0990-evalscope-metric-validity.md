# GAP-0990 - EvalScope metric-validity boundary

- Gap: `GAP-0990`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/modelscope/evalscope`, README raw source at `https://raw.githubusercontent.com/modelscope/evalscope/main/README.md`, latest release page at `https://github.com/modelscope/evalscope/releases/tag/v1.8.1`, repository file tree, and pyproject raw source at `https://raw.githubusercontent.com/modelscope/evalscope/main/pyproject.toml`
- Retrieval: `2026-06-24` live source review through GitHub API inspection, repository HEAD check, latest-release API inspection, README keyword scan, file-tree inspection, pyproject inspection, and local backlog metadata.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no EvalScope runner, backend integration, benchmark mirror, dataset importer, report parser, WebUI bridge, agent trace bridge, OpenCompass adapter, VLMEvalKit adapter, RAGEval adapter, stress-test runner, sandbox integration, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific scoring path added.
- Linear: `AMC-1269`

## Live source metadata

The GitHub API identifies `modelscope/evalscope` as a public, active repository with description `A streamlined and customizable framework for efficient large model (LLM, VLM, AIGC) evaluation and performance benchmarking.`, 2977 stars, 405 forks, 39 open issues, default branch `main`, pushed_at `2026-06-24T12:02:15Z`, Python as the primary language, topics including evaluation, llm, performance, rag, and vlm, and Apache License 2.0 metadata.

The latest GitHub release API identifies `v1.8.1` as the latest non-draft, non-prerelease release, published at `2026-06-16T09:51:54Z`.

Repository tree metadata includes `README.md`, `README_zh.md`, `LICENSE`, `pyproject.toml`, `docs`, `evalscope`, `examples`, `requirements`, `tests`, and `skills`. The `requirements` directory includes `requirements/sandbox.txt`. The pyproject metadata identifies package name `evalscope`, description `EvalScope: Lightweight LLMs Evaluation Framework`, license `Apache-2.0`, keywords `python`, `llm`, and `evaluation`, and Python requirement `>=3.10`.

README source-review signals include model evaluation, performance benchmarking, result visualization, model capability evaluation, inference performance stress testing, multimodal and multidomain support, built-in benchmark support, OpenCompass, VLMEvalKit, RAGEval, Agent Evaluation Mode, External Agent Bridge, Trie agentic trace replay, Vendor Verifier benchmarks, agent traces, Docker sandbox labels, WebUI reports, custom datasets, custom models, and custom evaluation metrics.

No repository code, README prose beyond short metadata facts, docs prose, benchmark rows, examples, configs, prompts, traces, reports, datasets, screenshots, package files, sandbox files, model outputs, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0990 is relevant to AMC through existing Score, Shield, and Watch metric-validity receipts because evaluation frameworks can make measurement claims look mature even when the receiving product lacks construct validity, reliability, sample-size, confidence-interval, metric-owner, outcome-alignment, row-hash, and regression-threshold proof.

The accepted AMC primitive is already `buildMetricValidationReport`. EvalScope source context may be cited only when AMC has its own validation table, signed evidence refs, row hashes, sample size, confidence interval, reliability checks, outcome alignment, metric owner, source refs, CI or lifecycle gate, and no-copy proof. Repository identity, README labels, GitHub counts, release labels, benchmark names, backend names, agent-trace labels, WebUI labels, stress-test labels, Docker sandbox labels, custom-metric labels, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, eval-pack manifests, validation table, sample size, confidence interval, reliability checks, and metric owner. |
| Shield | Relevant when signed evidence refs and fail-closed CI gates prevent unsupported eval-quality, benchmark, or safety claims from passing. |
| Enforce | No runtime policy, benchmark backend, agent-loop, sandbox, or circuit breaker changed. |
| Vault | No benchmark dataset, trace file, prompt, report, API key, package artifact, or secure-storage behavior changed. |
| Watch | Relevant when metric validity is monitored through repeated runs, regression thresholds, or lifecycle gates; no new Watch monitor was added. |
| Fleet | Agent-evaluation context only; no multi-agent runner, agent trace bridge, or trust topology changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression exercises the existing generic metric-validity path with AMC-owned synthetic fixture data.

The positive path proves EvalScope source context can be accepted only when AMC-owned evidence includes 24 signed validation samples, construct-validity coverage, inter-rater reliability, test-retest stability, benchmark-backend repeatability, regression-threshold fit, validation table, sample-size evidence, confidence-interval evidence, reliability checks, metric-owner evidence, outcome-alignment proof, source refs, row hashes, and CI gate proof. The negative path fails closed when repository metadata, README labels, release labels, benchmark labels, backend labels, and agent-trace labels replace signed validation evidence.

## Fail-closed rule

EvalScope repository identity, GitHub counts, Apache License 2.0 metadata, Python language metadata, topic labels, release labels, README labels, benchmark labels, Agent Evaluation Mode labels, External Agent Bridge labels, Trie agentic trace replay labels, Vendor Verifier labels, RAGEval labels, OpenCompass labels, VLMEvalKit labels, WebUI labels, stress-test labels, Docker sandbox labels, custom dataset labels, custom metric labels, local backlog metadata, or source identity alone cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, source refs, and no-copy proof.

## No-bloat boundary

No EvalScope runner, backend integration, benchmark mirror, dataset importer, report parser, WebUI bridge, agent trace bridge, OpenCompass adapter, VLMEvalKit adapter, RAGEval adapter, Vendor Verifier runner, Trie trace replay importer, stress-test runner, Docker sandbox integration, custom-metric loader, pyproject parser, GitHub release watcher, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added.

No repository code, README prose beyond short metadata facts, docs prose, benchmark rows, examples, configs, prompts, traces, reports, datasets, screenshots, package files, sandbox files, model outputs, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0990EvalScopeMetricValidityBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0990-evalscope-metric-validity.md'`; 3 metric-validity primitive tests passed.
- Focused regression: `npx vitest run tests/gap0990EvalScopeMetricValidityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0989RheumatologyDiagnosticReplayCorpusBoundary.test.ts tests/gap0990EvalScopeMetricValidityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over the new GAP-0990 doc/test found no matches.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 837 files / 7,343 tests.
