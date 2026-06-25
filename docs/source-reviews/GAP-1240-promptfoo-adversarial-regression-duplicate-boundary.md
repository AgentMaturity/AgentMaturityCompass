# GAP-1240 - promptfoo adversarial regression duplicate boundary

- Gap: `GAP-1240`
- Dimension: `eval-adversarial-regression`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: promptfoo competitor/product signal
- Retrieval: 2026-06-25 live promptfoo homepage, live GitHub API, live README, and live red-team documentation review
- Status: Done - no duplicate product code

## Source reviewed

- Product homepage: `https://www.promptfoo.dev`
- Repository: `https://github.com/promptfoo/promptfoo`
- GitHub API: `https://api.github.com/repos/promptfoo/promptfoo`
- Raw README: `https://raw.githubusercontent.com/promptfoo/promptfoo/main/README.md`
- Red-team documentation: `https://www.promptfoo.dev/docs/red-team/`
- Prior overlapping AMC closure: `docs/source-reviews/GAP-1236-promptfoo-adversarial-regression.md`

Live GitHub API metadata at retrieval:

- `full_name`: `promptfoo/promptfoo`
- `default_branch`: `main`
- `license`: `MIT`
- `language`: `TypeScript`
- `stargazers_count `22589`
- `forks_count `2003`
- `open_issues_count `355`
- `pushed_at `2026-06-25T08:56:54Z`
- `updated_at `2026-06-25T11:53:39Z`
- `archived`: `false`
- `disabled`: `false`

The live README identifies `Promptfoo: LLM evals & red teaming`, describes promptfoo as a CLI and library for evaluating and red-teaming LLM apps, and states that Promptfoo is now part of OpenAI while remaining open source and MIT licensed. The product homepage positions the service around `Ship agents, not vulnerabilities`, red teaming, guardrails, model security, Model Context Protocol proxy context, CI/CD code scanning, evaluations for prompts, models, RAG pipelines, and custom attacks including prompt injection. The red-team guide describes red-team test generation and evaluation flows, including prompt injection and jailbreaking as automation candidates, with emphasis on technical security vulnerabilities.

## Relevance decision

GAP-1240 is relevant to AMC, but it is a duplicate promptfoo/source-dimension slice of the already completed GAP-1236 adversarial regression closure. The correct implementation is not a second promptfoo adapter, second promptfoo test runner, or additional source-specific product path. The relevant AMC primitive is the existing Shield/Enforce/Vault adversarial replay-regression receipt path covered by `GAP-1236`.

No duplicate product code was added. The focused GAP-1240 regression reuses the same AMC-owned primitive and records why promptfoo competitor metadata cannot pass as adversarial regression proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This duplicate gap does not alter score methodology, scoring weights, or public maturity semantics. |
| Shield | Relevant. Shield requires exploit replay and guardrail evidence, already covered by the existing adversarial regression receipt path. |
| Enforce | Relevant. Enforce requires expected and actual guard decisions plus release-gate receipts before a regression can pass. |
| Vault | Relevant. Vault requires preserving evidence refs and hashes without copying upstream prompts, configs, attacks, screenshots, reports, or generated outputs. |
| Watch | Context only. Alert receipts can observe failed adversarial rows, but GAP-1240 is not a Watch integration. |
| Fleet | Not directly relevant. No multi-agent topology or orchestration primitive changed. |
| Passport | Not directly relevant. No portable proof-bundle schema changed. |
| Comply | Context only. The proof can support audit evidence, but no compliance mapping changed. |

## Product closure

No new product code was required. Existing `runReplayBenchmarkCorpus` adversarial regression behavior already supports:

- adversarial exploit fixture id;
- expected and actual release decision;
- rerun output hash;
- release gate receipt id;
- taxonomy references;
- red-team benchmark manifest hashes;
- scoring modes, pass threshold, result export, trace export, and judge rubric evidence;
- adversarial engine evaluation receipt;
- guardrail rule ids/types;
- prompt-injection detection;
- alert rule receipt;
- signed baseline and candidate evidence refs;
- CI fail-closed receipt.

The focused GAP-1240 test proves that this promptfoo competitor row maps to the existing primitive and that metadata-only promptfoo facts fail closed.

## Fail-closed rule

The following must fail closed for GAP-1240:

- promptfoo homepage, repository, README, docs, GitHub API metadata, stars, forks, language, license, branch, release, or product labels alone;
- `Promptfoo: LLM evals & red teaming`, `Ship agents, not vulnerabilities`, red teaming, guardrails, Model Context Protocol, CI/CD, prompt injection, jailbreaking, vulnerability scanning, or test-generation labels alone;
- local backlog source id `COMP-026` or source title alone;
- references to GAP-1236 without a concrete AMC adversarial regression row;
- source refs without an exploit fixture;
- expected decision without actual decision;
- actual decision without rerun output hash;
- rerun output hash without release gate receipt;
- release gate receipt without signed baseline/candidate evidence;
- red-team benchmark metadata without scoring, result export, trace, judge rubric, threshold, and manifest hashes;
- engine evaluation metadata without trace, annotation, continuous-eval, criteria, variables, explanation, rerun, guardrail, and alert evidence.

## No-bloat boundary

No duplicate product code, promptfoo adapter, promptfoo runner, CLI wrapper, YAML/config parser, report importer, prompt/assertion/test importer, red-team plugin clone, code-scanning integration, MCP proxy bridge, provider wrapper, CI template, package dependency, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, or source-specific scoring path was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, prompts, assertions, configs, examples, benchmark rows, screenshots, generated outputs, reports, red-team strategies, workflows, package metadata, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1240PromptfooDuplicateAdversarialRegressionBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1240PromptfooDuplicateAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1240PromptfooDuplicateAdversarialRegressionBoundary.test.ts tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts tests/gap0626AdversarialRegression.test.ts --reporter=dot` passed, 6 files / 180 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 972 files / 7,893 tests.
