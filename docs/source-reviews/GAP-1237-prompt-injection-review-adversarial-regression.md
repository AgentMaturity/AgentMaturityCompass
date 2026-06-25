# GAP-1237 - prompt injection review adversarial regression

- Gap: `GAP-1237`
- Dimension: `eval-adversarial-regression`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review of Vulnerabilities, Attack Vectors, and Defense Mechanisms
- Retrieval: 2026-06-25 live OpenAlex API, live Crossref API, DOI landing metadata, and live MDPI article page review
- Status: Done

## Source reviewed

- OpenAlex work: `https://openalex.org/W7118532765`
- OpenAlex API: `https://api.openalex.org/works/W7118532765`
- DOI: `https://doi.org/10.3390/info17010054`
- Crossref API: `https://api.crossref.org/works/10.3390/info17010054`
- MDPI article page: `https://www.mdpi.com/2078-2489/17/1/54`

Live source metadata at retrieval:

- title: `Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review of Vulnerabilities, Attack Vectors, and Defense Mechanisms`
- journal: `Information`
- publication date: `2026-01-07`
- type: `journal-article`
- DOI: `10.3390/info17010054`
- open-access status: `gold`
- Crossref license URL: `https://creativecommons.org/licenses/by/4.0/`
- authors included `Saidakhror Gulyamov`, `Said Gulyamov`, `Andrey Rodionov`, `Rustam Khursanov`, `Kambariddin Mekhmonov`, `Djakhongir Babaev`, and `Akmaljon Rakhimjonov`
- reviewed concepts included computer security, vulnerability assessment, threat model, vulnerability management, credential, and risk analysis

The article is relevant source-review context because its public metadata and abstract frame prompt injection as an AI-agent security concern across direct jailbreaking, indirect injection, Model Context Protocol exposure, tool poisoning, credential theft, and OWASP Top 10 for LLM Applications 2025-style defense expectations. AMC uses that context only to test whether its existing adversarial regression receipt path rejects paper metadata as proof.

## Relevance decision

GAP-1237 is relevant to AMC. The source maps to the existing Shield, Enforce, and Vault adversarial replay-regression path: AMC must preserve a safe exploit-fixture reference, expected guard decision, actual rerun decision, rerun output hash, release-gate receipt, red-team benchmark manifests, and signed baseline/candidate evidence before a prompt-injection regression can pass.

The implementation does not treat the paper as a benchmark corpus, attack catalog, exploit payload source, or imported taxonomy. Its role is a source-review signal for the acceptance rule: `Exploit fixture, expected decision, rerun output, and release gate receipt`. metadata-only evidence must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not alter scoring weights, maturity levels, or public methodology semantics. |
| Shield | Relevant. Shield requires adversarial regression evidence proving prompt-injection and tool-poisoning guardrails reached the expected block decision. |
| Enforce | Relevant. Enforce requires a release gate receipt and fails closed when exploit rerun proof is absent or mismatched. |
| Vault | Relevant. Vault boundary is evidence preservation without storing paper text, exploit prompts, payloads, generated outputs, copied tables, figures, or reports. |
| Watch | Context only. Alert receipts can observe failed adversarial rows, but this gap is not a live-drift integration. |
| Fleet | Context only. Multi-agent and MCP risk is relevant context, but no Fleet topology, router, or coordination primitive changed. |
| Passport | Not directly relevant. No portable trust-token or external proof-bundle schema changed. |
| Comply | Context only. The receipt can support audit evidence, but no compliance mapping changed. |

## Product closure

No new product code was required. Existing `runReplayBenchmarkCorpus` behavior already supports the required AMC-owned proof path:

- adversarial exploit fixture id;
- expected and actual guard decision;
- rerun output hash;
- release gate receipt id;
- taxonomy references for direct, indirect, and tool-poisoning-style prompt injection;
- red-team benchmark manifest hashes;
- scoring modes, result export, judge rubric, trace export, pass threshold, and question count evidence;
- adversarial engine evaluation receipt;
- guardrail rule ids/types;
- prompt-injection detection;
- alert rule receipt;
- signed baseline and candidate evidence refs;
- CI fail-closed receipt.

The focused regression for GAP-1237 binds synthetic prompt-injection review context into that existing primitive and proves paper metadata alone cannot satisfy the adversarial regression gate.

## Fail-closed rule

The following must fail closed for GAP-1237:

- OpenAlex, Crossref, DOI, or MDPI source metadata alone;
- the title, journal, publication date, author list, open-access status, concept list, abstract terms, or license alone;
- direct jailbreaking, indirect injection, Model Context Protocol, tool poisoning, credential theft, OWASP Top 10 for LLM Applications 2025, or other taxonomy labels alone;
- source refs without an AMC-owned exploit fixture;
- expected decision without actual decision;
- actual decision without rerun output hash;
- rerun output hash without release gate receipt;
- release gate receipt without signed baseline/candidate evidence;
- red-team benchmark metadata without scoring configuration, result export, trace, judge rubric, question count, threshold, and manifest hashes;
- engine evaluation metadata without trace, annotation, continuous-eval, criteria, variables, explanation, rerun, guardrail, and alert evidence.

## No-bloat boundary

No paper importer, OpenAlex importer, Crossref importer, DOI importer, MDPI scraper, prompt-injection review adapter, attack taxonomy clone, exploit prompt copy, benchmark runner, MCP bridge, OWASP mapper, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, or source-specific scoring path was added.

AMC did not copy paper prose beyond minimal metadata facts, upstream code, abstracts, tables, figures, diagrams, attack prompts, exploit payloads, examples, reports, generated outputs, benchmark rows, screenshots, workflows, package metadata, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts --reporter=dot` failed before this doc existed with `ENOENT` while the three receipt behavior tests passed.
- Focused test: `npx vitest run tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related regression: `npx vitest run tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts tests/gap1236PromptfooAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts tests/gap0626AdversarialRegression.test.ts --reporter=dot` passed, 5 files / 176 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 971 files / 7,889 tests.
