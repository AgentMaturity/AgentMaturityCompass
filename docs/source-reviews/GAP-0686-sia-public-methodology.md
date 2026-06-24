# GAP-0686 - SIA public-methodology boundary

- Gap: `GAP-0686`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/hexo-ai/sia`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live GitHub page identifies `hexo-ai/sia` as a public repository on branch `main`, with MIT license, `1.8k stars`, `208 forks`, `3 issues`, `11 pull requests`, and `18 commits`. The repository page shows `7 tags`, no package listing, and languages `Python 92.0%` and `HTML 8.0%`.

The live README metadata identifies the source as SIA, a self-improving AI framework, and links to the paper at `https://arxiv.org/abs/2605.27276`. It lists built-in tasks `gpqa`, `lawbench`, `longcot-chess`, and `spaceship-titanic`; includes `EVALUATION_GUIDE.md`; describes run artifacts, a run visualizer, private held-out evaluation data, and per-generation evaluation results. These facts identify benchmark and self-improvement context only. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, configs, task rows, dataset contents, run artifacts, visualizer screenshots, benchmark result tables, citation text, prompts, docs prose, or implementation details were copied into AMC.

## Relevance decision

SIA is relevant to AMC as external benchmark and self-improving-agent context: it demonstrates a workflow where agent generations, evaluation results, held-out data, run artifacts, and visualizations matter. That context reinforces AMC's existing evidence-first posture for Score, Shield, and Watch.

SIA is not an AMC public methodology versioning source. The live repository does not define AMC scoring methodology ids, L0-L5 threshold semantics, badge comparability rules, public methodology hashes, deprecation notices, migration guidance, report binding, or AMC diagnostic question-bank changes. SIA repository metadata alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Benchmark/self-improvement context only; no accepted public scoring-methodology proof. |
| Shield | Held-out evaluation and run-artifact context only; no Shield assurance threshold changed. |
| Watch | Run visualizer/evaluation context only; no Watch methodology or alert semantics changed. |
| Enforce | No runtime policy, harness update, or enforcement behavior changed. |
| Vault | No private eval data, API-key, dataset, or storage behavior changed. |
| Fleet | No self-improvement loop, meta-agent, target-agent, feedback-agent, or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No compliance mapping or audit-control mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0686. No public methodology version bump was made.

The closure is a documented no-op: benchmark context only, no public methodology version change.

## Fail-closed rule

SIA repository metadata, stars, forks, issue or pull-request counts, commit counts, tag counts, language labels, arXiv links, SIA result claims, task names, run visualizer labels, evaluator labels, held-out-data labels, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No SIA self-improvement methodology adapter, harness updater, weight-update loop, meta-agent runner, target-agent runner, feedback-agent runner, task importer, MLE-Bench adapter, LawBench adapter, run visualizer clone, held-out dataset importer, evaluation-guide importer, arXiv/paper importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, configs, task rows, dataset contents, run artifacts, visualizer screenshots, benchmark result tables, citation text, prompts, docs prose, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0686SiaPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
