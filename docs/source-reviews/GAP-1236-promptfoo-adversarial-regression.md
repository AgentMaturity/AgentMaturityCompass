# GAP-1236 - promptfoo adversarial regression boundary

- Gap: `GAP-1236`
- Dimension: `eval-adversarial-regression`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: `promptfoo/promptfoo`
- Retrieval: 2026-06-25 live GitHub API, live README, and live official documentation review
- Status: Done

## Source reviewed

- Repository: `https://github.com/promptfoo/promptfoo`
- Raw README: `https://raw.githubusercontent.com/promptfoo/promptfoo/main/README.md`
- Documentation overview: `https://www.promptfoo.dev/docs/intro/`
- Red-team documentation: `https://www.promptfoo.dev/docs/red-team/`
- Configuration guide: `https://www.promptfoo.dev/docs/configuration/guide/`
- CI/CD guide: `https://www.promptfoo.dev/docs/integrations/ci-cd/`
- Latest release checked: `https://github.com/promptfoo/promptfoo/releases/tag/code-scan-action-0.1.8`

Live GitHub API metadata at retrieval:

- `full_name`: `promptfoo/promptfoo`
- `default_branch`: `main`
- `license`: `MIT`
- `language`: `TypeScript`
- `stargazers_count `22573`
- `forks_count `2003`
- `open_issues_count `353`
- `pushed_at `2026-06-25T05:39:35Z`
- `updated_at `2026-06-25T07:37:10Z`
- `archived`: `false`
- `disabled`: `false`
- main commit `4f8103c0ff8c53ae19fb8d64fd40ffb2e37f3ab6`
- release `code-scan-action-0.1.8`, published `2026-06-16T17:46:14Z`

The public source identifies Promptfoo as `Promptfoo: LLM evals & red teaming`, a `CLI and library for evaluating and red-teaming LLM apps`, and states that `Promptfoo is now part of OpenAI` while remaining `open source and MIT licensed`. The repository description includes `Test your prompts, agents, and RAGs`, `Red teaming/pentesting/vulnerability scanning for AI`, and `Simple declarative configs with command line and CI/CD integration`.

The reviewed docs are relevant because they describe red-team `prompt injections`, chained `untrusted user input`, red-team `strategies`, focus on `technical security vulnerabilities`, configuration `assertions`, `tests`, and `threshold` behavior, plus `CI/CD` use and quality gate failure semantics.

## Relevance decision

GAP-1236 is relevant to AMC, but only through the existing adversarial replay-regression and release-gate receipt path. Promptfoo is a strong source signal for prompt, agent, RAG, red-team, vulnerability scanning, assertions, and CI/CD quality-gate workflows. That does not mean AMC should run promptfoo, ingest promptfoo configuration, import its reports, or copy its red-team strategies.

AMC closure for this gap is the generic Shield/Enforce/Vault requirement:

- preserve the attack trace as an AMC-owned synthetic fixture reference;
- bind the guard decision to signed baseline and candidate evidence;
- rerun the exploit/regression suite;
- require an exploit fixture, expected decision, actual decision, rerun output hash, release gate receipt, guardrail evidence, and alert proof before a row can pass.

Metadata-only evidence, including repository identity, README text, docs pages, stars, topics, release labels, or local backlog text, is not enough to prove adversarial regression closure.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter score methodology, scoring weights, or public methodology semantics. |
| Shield | Relevant. Shield must receive adversarial replay receipts that prove prompt-injection/tool-misuse guardrails blocked the expected release decision. |
| Enforce | Relevant. Enforce closure requires the release gate to fail closed when expected decision, actual decision, rerun output, or release receipt is missing or mismatched. |
| Vault | Relevant. Vault boundary is preservation without leakage: signed refs and hashes are stored, while upstream prompts, configs, attacks, reports, and generated outputs are not copied. |
| Watch | Context only. Existing Watch alert proof can observe failed adversarial rows, but GAP-1236 is not a live-drift or observability integration. |
| Fleet | Not directly relevant. No multi-agent topology, routing, or orchestration primitive changes. |
| Passport | Not directly relevant. No portable trust token or external proof-bundle semantics change. |
| Comply | Context only. The receipt can support audit evidence, but this gap does not add a compliance mapping. |

## Product closure

No new product code was required. Existing `runReplayBenchmarkCorpus` behavior already supports the required AMC-owned proof path:

- adversarial exploit fixture id;
- expected and actual release decision;
- rerun output hash;
- release gate receipt id;
- taxonomy references;
- red-team benchmark manifest hashes;
- scoring modes and pass threshold;
- trace/export hashes;
- prompt-optimization proof;
- adversarial engine evaluation receipt;
- guardrail rule ids/types;
- prompt-injection detection;
- alert rule receipt;
- signed baseline and candidate evidence refs;
- CI fail-closed receipt.

The focused regression for GAP-1236 binds a synthetic promptfoo-style red-team regression into that existing primitive and proves metadata-only promptfoo facts fail closed.

## Fail-closed rule

The following must fail closed for GAP-1236:

- `promptfoo/promptfoo` repository identity alone;
- README or docs phrases alone;
- stars, forks, topics, language, license, release, or commit metadata alone;
- promptfoo red-team, assertions, tests, threshold, or CI/CD labels alone;
- source refs without an AMC-owned exploit fixture;
- expected decision without actual decision;
- actual decision without rerun output hash;
- rerun output hash without release gate receipt;
- release gate receipt without signed baseline/candidate evidence;
- red-team benchmark metadata without scoring, result export, and ground-truth manifest hashes;
- engine evaluation metadata without trace, annotation, continuous-eval, criteria, variables, explanation, rerun, guardrail, and alert evidence.

## No-bloat boundary

AMC did not add a promptfoo adapter, promptfoo runner, CLI wrapper, YAML/config parser, report importer, prompt/assertion/test importer, red-team plugin clone, code-scanning integration, provider wrapper, CI template, package dependency, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, or source-specific scoring path.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, prompts, assertions, configs, examples, benchmark rows, screenshots, generated outputs, reports, red-team strategies, workflows, package metadata, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt behavior tests passed.
- Focused test: `npx vitest run tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts tests/gap0626AdversarialRegression.test.ts --reporter=dot` passed, 4 files / 172 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 939 files / 7,746 tests.
