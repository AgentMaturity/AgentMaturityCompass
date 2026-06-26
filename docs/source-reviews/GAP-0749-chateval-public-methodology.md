# GAP-0749 - ChatEval public-methodology boundary

- Gap: `GAP-0749`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/thunlp/ChatEval` and README `https://github.com/thunlp/ChatEval/blob/main/README.md`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and README fetch; shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, multi-agent debate evaluator, FastChat demo, or ChatEval runner added.

## Live source metadata

The GitHub connector identifies `thunlp/ChatEval` as a public, unarchived repository with default branch `main`. The README identifies the project as code for `ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate`, with a paper link to `https://arxiv.org/abs/2308.07201`. Relevant source-review signals include LLM-based evaluators, human evaluation on generated text, roles acted by LLMs, autonomous debate, assigned personas, judgments, a transparent referee process, FastChat-based arena-style demo, multiple LLM referees, OpenAI API usage, data examples under `agentverse/tasks/llm_eval/data/faireval/preprocessed_data/test.json`, custom debater agent configuration, `prompt_template`, `config.yaml`, one-by-one communication, `2` agent roles, `2` discussion turns, evaluation results, and citation metadata for Chi-Min Chan, Weize Chen, Yusheng Su, Jianxuan Yu, Wei Xue, Shanghang Zhang, Jie Fu, and Zhiyuan Liu.

These facts are useful as LLM-evaluator and multi-agent-debate context, but they do not define AMC scoring semantics, evidence taxonomy, changelog entries, deprecation notices, migration guidance, validation artifacts, badge behavior, or public comparability rules. Repository metadata, README feature lists, arXiv links, demo steps, config examples, dataset examples, output examples, evaluator roles, or debate labels alone cannot justify an AMC methodology version bump. No upstream README prose beyond minimal metadata facts, code snippets, command examples, dataset rows, output examples, prompt/config snippets, screenshots, videos, citation text, or implementation details were copied into AMC.

## Relevance decision

GAP-0749 is relevant to AMC only as public-methodology boundary evidence. ChatEval-style multi-agent debate evaluators can inform future evidence taxonomy, evaluator-bias, and judge-calibration work, but AMC already has public methodology/versioning primitives and should not treat a research repository as a methodology source.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because `thunlp/ChatEval` metadata and README features do not provide AMC-owned methodology proof. A source citation can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background evaluator/debate context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background evaluator-bias and judge-calibration context only; no new safety threshold or assurance rule. |
| Watch | Background evaluator-run context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime judge policy, debate policy, or enforcement behavior changed. |
| Vault | No datasets, prompts, API keys, outputs, evaluation logs, or secure-storage behavior changed. |
| Fleet | Multi-agent debate context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, ChatEval runner, multi-agent debate evaluator, judge-calibration module, FastChat demo, dataset importer, prompt/config importer, or public methodology docs changed for GAP-0749.

The closure is a no-bloat source-review boundary: ChatEval, multi-agent debate, LLM-based evaluator, human-evaluation, autonomous referee, persona, FastChat, OpenAI API, agentverse, prompt_template, config.yaml, one-by-one communication, two-agent/two-turn, evaluation-result, arXiv, repository, and README labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

Repository URL, README URL, repository name, stars, language, public/unarchived status, default branch, arXiv link, paper title, author list, LLM-evaluator labels, multi-agent-debate labels, human-evaluation labels, autonomous-referee labels, persona labels, FastChat labels, OpenAI API labels, dataset-example labels, config-example labels, output-example labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No ChatEval runner, multi-agent debate evaluator, autonomous-referee workflow, FastChat demo, agentverse integration, dataset importer, prompt importer, config importer, output importer, judge-calibration module, evaluator-bias module, arXiv importer, GitHub importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code snippets, command examples, dataset rows, output examples, prompt/config snippets, screenshots, videos, citation text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0749ChatEvalPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
