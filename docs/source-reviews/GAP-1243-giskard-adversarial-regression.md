# GAP-1243 - Giskard adversarial regression boundary

- Gap: `GAP-1243`
- Dimension: `eval-adversarial-regression`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: Giskard
- Retrieval: 2026-06-25 live Giskard homepage, live GitHub API, live README, live documentation, and PyPI metadata review
- Status: Done

## Source reviewed

- Product homepage: `https://www.giskard.ai`
- Repository: `https://github.com/Giskard-AI/giskard-oss`
- GitHub API: `https://api.github.com/repos/Giskard-AI/giskard`
- Raw README: `https://raw.githubusercontent.com/Giskard-AI/giskard/main/README.md`
- Documentation: `https://docs.giskard.ai/oss`
- PyPI JSON: `https://pypi.org/pypi/giskard/json`

Live GitHub API metadata at retrieval:

- `full_name`: `Giskard-AI/giskard-oss`
- `default_branch`: `main`
- `license`: `Apache-2.0`
- `language`: `Python`
- `stargazers_count `5464`
- `forks_count `478`
- `open_issues_count `69`
- `pushed_at `2026-06-25T10:10:07Z`
- `updated_at `2026-06-25T08:39:08Z`
- `archived`: `false`
- `disabled`: `false`

The live homepage identifies Giskard as an `AI Red Teaming & LLM Security Platform` and describes assessment outputs such as vulnerability reports, go/no-go deployment recommendations, and remediation guidance. The repository description identifies Giskard as an `Open-Source Evaluation & Testing library for LLM Agents`. The live README headline is `Evals, Red Teaming and Test Generation for Agentic Systems`, and it describes a Python library for testing and evaluating agentic systems, including Giskard Checks, Giskard Scan, vulnerability scanning, prompt injection, data leakage, harmful content, misinformation, RAG evaluation, multi-turn agents, and OWASP LLM Top-10 threat categories. The docs page describes an open-source Python library for testing and evaluating LLM applications, RAG systems, and AI agents. PyPI metadata identifies package `giskard` version `2.19.1`, Apache Software License 2.0, and documentation/source links.

## Relevance decision

GAP-1243 is relevant to AMC through the existing Shield/Enforce/Vault adversarial replay-regression path. Giskard is a strong source signal for AI testing, red teaming, scan/risk/quality workflows, agent vulnerability scanning, prompt injection, data leakage, and go/no-go security recommendations. That does not justify importing Giskard, running Giskard, mirroring its scan model, or adding source-specific product behavior.

AMC closure for this gap is the generic adversarial regression proof requirement:

- preserve a safe exploit-fixture reference;
- bind expected and actual guard decisions;
- rerun the exploit/regression case;
- require rerun output hash and release-gate receipt;
- require red-team benchmark hashes, engine-evaluation evidence, guardrail evidence, alert evidence, and signed baseline/candidate evidence.

metadata-only Giskard source facts cannot satisfy that gate.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter score methodology, scoring weights, or public maturity semantics. |
| Shield | Relevant. Shield must receive adversarial regression evidence for prompt-injection, data-leakage, and harmful-content guardrails. |
| Enforce | Relevant. Enforce requires expected decision, actual decision, rerun output, and release-gate receipt before a regression can pass. |
| Vault | Relevant. Vault preserves hashes and signed evidence refs without copying Giskard prompts, scan configs, payloads, reports, screenshots, or generated outputs. |
| Watch | Context only. Alert receipts can observe failed adversarial rows, but GAP-1243 is not a Watch integration. |
| Fleet | Context only. Agentic-system testing is relevant context, but no Fleet topology or orchestration primitive changed. |
| Passport | Not directly relevant. No portable trust-token or proof-bundle schema changed. |
| Comply | Context only. The receipt can support audit evidence, but no compliance mapping changed. |

## Product closure

No new product code was required. Existing `runReplayBenchmarkCorpus` behavior already supports the required AMC-owned proof path:

- adversarial exploit fixture id;
- expected and actual release decision;
- rerun output hash;
- release gate receipt id;
- taxonomy references;
- red-team benchmark manifest hashes;
- scoring modes and pass threshold;
- result export, trace export, and judge rubric evidence;
- adversarial engine evaluation receipt;
- guardrail rule ids/types;
- prompt-injection detection;
- alert rule receipt;
- signed baseline and candidate evidence refs;
- CI fail-closed receipt.

The focused regression for GAP-1243 binds a synthetic Giskard-style agent vulnerability regression into that existing primitive and proves source metadata alone fails closed.

## Fail-closed rule

The following must fail closed for GAP-1243:

- Giskard homepage, repository, README, docs, PyPI, GitHub API metadata, stars, forks, language, license, branch, topics, or package version alone;
- AI Red Teaming & LLM Security Platform, Open-Source Evaluation & Testing library for LLM Agents, vulnerability scanner, scan/risk/quality, go/no-go recommendation, remediation, prompt injection, data leakage, harmful content, misinformation, RAG evaluation, agent testing, or OWASP LLM Top-10 labels alone;
- local backlog source id `COMP-029` or source title alone;
- source refs without an AMC-owned exploit fixture;
- expected decision without actual decision;
- actual decision without rerun output hash;
- rerun output hash without release gate receipt;
- release gate receipt without signed baseline/candidate evidence;
- red-team benchmark metadata without scoring, result export, trace, judge rubric, threshold, and manifest hashes;
- engine evaluation metadata without trace, annotation, continuous-eval, criteria, variables, explanation, rerun, guardrail, and alert evidence.

## No-bloat boundary

No Giskard scanner, Giskard adapter, Giskard runner, vulnerability-scan importer, Python package dependency, scan-report importer, scenario generator clone, OWASP taxonomy clone, red-team payload copy, RAG evaluator copy, package wrapper, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, or source-specific scoring path was added.

AMC did not copy upstream code, README prose beyond minimal metadata facts, docs prose beyond minimal labels, prompts, scan configs, payloads, examples, benchmark rows, screenshots, generated outputs, reports, scenarios, evaluation logic, package metadata beyond minimal facts, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1243GiskardAdversarialRegressionBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1243GiskardAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1243GiskardAdversarialRegressionBoundary.test.ts tests/gap1240PromptfooDuplicateAdversarialRegressionBoundary.test.ts tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts tests/gap0626AdversarialRegression.test.ts --reporter=dot` passed, 7 files / 184 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 973 files / 7,897 tests.
