# GAP-0970 - OpenAI Evals metric-validity boundary

- Gap: `GAP-0970`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/openai/evals`, repository docs at `https://github.com/openai/evals/tree/main/docs`, run docs at `https://github.com/openai/evals/blob/main/docs/run-evals.md`, eval templates at `https://github.com/openai/evals/blob/main/docs/eval-templates.md`, completion functions at `https://github.com/openai/evals/blob/main/docs/completion-fns.md`, and official OpenAI evals guide at `https://developers.openai.com/api/docs/guides/evals`
- Retrieval: `2026-06-22` live source review through the web research channel, restricted to official OpenAI/GitHub-hosted source pages for OpenAI product claims.
- Status: closed through existing metric-validity receipts only when AMC-owned validation evidence exists; no OpenAI Evals runner, registry mirror, Git-LFS import, Snowflake integration, dashboard bridge, Completion Function Protocol adapter, custom-eval parser, or source-specific scoring path added.
- Linear: `AMC-1248`

## Live source metadata

The live GitHub repository page identifies `openai/evals` as a public repository with 18.7k stars, 3k forks, 125 issues, 85 pull requests, 691 commits, Python 89.4%, and a repository license link. The README positions OpenAI Evals as a framework for evaluating LLMs and LLM systems, an open-source registry of benchmarks, and a path for custom and private evals. It also notes that users can now configure and run evals in the OpenAI Dashboard.

The repository README and docs identify Git-LFS registry data, local package use for running existing evals, eval templates, the Completion Function Protocol for prompt chains or tool-using agents, optional Snowflake logging, custom eval logic, model-graded YAML contributions, and MIT license contribution posture. The official OpenAI evals guide was also checked as the current OpenAI product documentation surface. These facts are metric-validity context only. No OpenAI repository code, README prose beyond short metadata facts, registry rows, Git-LFS data, eval examples, templates, prompts, completions, notebooks, configs, Snowflake schemas, model outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0970 is relevant to AMC through existing Score, Shield, and Watch metric-validity receipts because eval repositories can make measurement claims look mature even when the receiving product lacks construct validity, reliability, sample-size, confidence-interval, metric-owner, and regression-threshold proof.

The accepted AMC primitive is already `buildMetricValidationReport`. OpenAI Evals source context may be cited only when AMC has its own validation table, signed evidence refs, row hashes, sample size, confidence interval, reliability checks, outcome alignment, metric owner, source refs, CI or lifecycle gate, and no-copy proof. Repository identity, README labels, OpenAI Dashboard labels, registry labels, Git-LFS labels, eval templates, Completion Function Protocol labels, Snowflake labels, custom eval logic labels, model-graded YAML labels, local backlog metadata, or source popularity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validation rows, eval-pack manifests, validation table, sample size, confidence interval, reliability checks, and metric owner. |
| Shield | Relevant when signed evidence refs and fail-closed CI gates prevent unsupported eval-quality or safety claims from passing. |
| Enforce | No runtime policy, guardrail, prompt chain, or circuit breaker changed. |
| Vault | No private eval data, Git-LFS registry data, API key handling, Snowflake credential handling, or secure storage changed. |
| Watch | Relevant when metric validity is monitored through repeated runs, regression thresholds, or lifecycle gates; no new Watch monitor was added. |
| Fleet | Agent-evaluation context only; no multi-agent runner, prompt-chain adapter, or trust topology changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression exercises the existing generic metric-validity path with AMC-owned synthetic fixture data.

The positive path proves OpenAI Evals source context can be accepted only when AMC-owned evidence includes 25 signed validation samples, construct-validity coverage, inter-rater reliability, test-retest stability, registry repeatability, regression-threshold fit, validation table, sample-size evidence, confidence-interval evidence, reliability checks, metric-owner evidence, outcome-alignment proof, source refs, row hashes, and CI gate proof. The negative path fails closed when repository metadata and docs labels replace signed validation evidence.

## Fail-closed rule

OpenAI Evals repository identity, GitHub counts, OpenAI Dashboard label, framework label, open-source registry label, private evals label, Git-LFS label, run existing evals label, eval templates label, Completion Function Protocol label, Snowflake label, custom eval logic label, model-graded YAML label, MIT license label, local backlog metadata, or source identity alone cannot prove AMC metric validity.

Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, reliability checks, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, source refs, and no-copy proof.

## No-bloat boundary

No OpenAI Evals runner, importer, adapter, registry mirror, Git-LFS data import, Snowflake integration, OpenAI Dashboard bridge, Completion Function Protocol bridge, custom-eval parser, eval-template importer, model-graded YAML parser, private-eval loader, prompt-chain runner, tool-using-agent runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added.

No upstream code, README prose beyond short metadata facts, docs prose, registry rows, examples, templates, prompts, eval specs, completion function code, datasets, notebooks, configs, generated outputs, model responses, Snowflake schemas, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0970OpenAiEvalsMetricValidityBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0969UpTrainLiveDriftBoundary.test.ts tests/gap0970OpenAiEvalsMetricValidityBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
