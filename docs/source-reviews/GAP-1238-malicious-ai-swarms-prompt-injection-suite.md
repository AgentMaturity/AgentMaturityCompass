# GAP-1238 - malicious AI swarms prompt-injection suite

- Gap: `GAP-1238`
- Dimension: `security-prompt-injection-suite`
- AMC surfaces requested: Shield, Enforce, Vault
- Source reviewed: How malicious AI swarms can threaten democracy
- Retrieval: 2026-06-25 live OpenAlex API, live Crossref API, DOI redirect, and Science landing URL reachability review
- Status: Done

## Source reviewed

- OpenAlex work: `https://openalex.org/W7125492504`
- OpenAlex API: `https://api.openalex.org/works/W7125492504`
- DOI: `https://doi.org/10.1126/science.adz1697`
- Crossref API: `https://api.crossref.org/works/10.1126/science.adz1697`
- Science landing URL: `https://www.science.org/doi/10.1126/science.adz1697`

Live source metadata at retrieval:

- title: `How malicious AI swarms can threaten democracy`
- journal: `Science`
- publication date: `2026-01-22`
- type: `journal-article`
- DOI: `10.1126/science.adz1697`
- OpenAlex open-access status: `green`
- authors included `Daniel Thilo Schroeder`, `Meeyoung Cha`, `Andrea Baronchelli`, `Nick Bostrom`, `Nicholas A. Christakis`, `David Garcia`, `Amit Goldenberg`, `Yara Kyrychenko`, `Kevin Leyton-Brown`, and `Nina Lutz`
- reviewed concepts included democracy, political science, frontier, political economy, computer security, law and economics, development economics, and information fusion

The OpenAlex abstract metadata states: `The fusion of agentic AI and LLMs marks a new frontier in information warfare.` The DOI resolved to the Science landing URL, but the Science page returned a Cloudflare challenge from this execution environment, so product claims here rely on OpenAlex, Crossref, and DOI redirect metadata rather than scraped article body text.

## Relevance decision

GAP-1238 is relevant to AMC, but not as a paper importer or democracy/information-warfare feature. The relevant AMC need is a generic prompt-injection regression suite receipt that proves direct, indirect, multimodal, and retrieved_content attack-fixture coverage is mapped to blocking policy, observed decisions, signed evidence, and regression status.

This source is a risk signal for agentic AI and LLM information-warfare threat models. AMC closure is the generic Shield/Enforce/Vault requirement: `Attack fixture, policy mapping, observed decision, and regression status`. metadata-only source facts must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. This gap does not change scoring weights or public methodology semantics. |
| Shield | Relevant. Shield needs prompt-injection suite receipts for direct, indirect, multimodal, and retrieved_content attack classes. |
| Enforce | Relevant. Enforce needs expected policy decisions, observed decisions, decision receipts, and regression status before a row can pass. |
| Vault | Relevant. Vault preserves hashes and signed evidence refs without storing paper text, attack payloads, prompts, datasets, screenshots, or model outputs. |
| Watch | Context only. Watch can observe regression failures, but this gap is not a live-drift integration. |
| Fleet | Context only. Agentic swarms are relevant threat context, but no Fleet topology or orchestration primitive changed. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. The receipt can support audit evidence, but no compliance mapping changed. |

## Product closure

Added a generic AMC prompt-injection regression suite receipt in `src/redteam/promptInjectionRegressionSuite.ts` and exported it from `src/redteam/index.ts` and `src/index.ts`.

The receipt binds:

- suite id, suite version, agent id, run id, source refs, evidence refs, and signed evidence refs;
- required vector coverage for direct, indirect, multimodal, and retrieved_content cases;
- fixture id, vector, attack trace ref, attack trace hash, policy id, policy mapping ref, expected decision, observed decision, observed decision receipt id, regression status, evidence refs, signed evidence refs, source metadata, issues, and row hash;
- deterministic receipt hash;
- `pass`, `regressed`, or `fail_closed` suite status;
- fail-closed reasons for missing suite evidence, missing vector coverage, missing row evidence, observed-decision mismatch, or failed regression status.

The focused regression proves that complete suite evidence passes, source metadata alone fails closed, and an observed decision that diverges from the mapped policy blocks the suite.

## Fail-closed rule

The following must fail closed for GAP-1238:

- OpenAlex, Crossref, DOI, Science URL, title, journal, publication date, author list, abstract metadata, concept labels, or local backlog text alone;
- democracy, political science, frontier, political economy, computer security, information fusion, agentic AI, LLM, information warfare, malicious AI swarms, or source identity labels alone;
- missing direct, indirect, multimodal, or retrieved_content vector coverage;
- source refs without suite-level evidence refs and signed evidence refs;
- attack fixture without attack trace ref and attack trace hash;
- attack trace without policy id and policy mapping ref;
- policy mapping without expected decision and observed decision;
- observed decision without an observed decision receipt id;
- observed decision that diverges from the expected policy decision;
- regression status that is missing, failed, pending, skipped, or custom;
- row evidence without signed evidence refs;
- tampered row hash or receipt hash.

## No-bloat boundary

No paper importer, OpenAlex importer, Crossref importer, DOI importer, Science scraper, democracy-risk module, information-warfare subsystem, AI-swarm simulator, social-media influence model, attack-payload corpus, prompt-copy fixture, multimodal dataset importer, RAG dataset importer, API route, CLI command, Studio panel, Watch monitor, methodology version bump, diagnostic question-bank change, or source-specific scoring path was added.

AMC did not copy article prose beyond minimal metadata facts, abstract text beyond the short OpenAlex metadata sentence, paper body text, figures, tables, datasets, prompts, attack payloads, examples, screenshots, model outputs, generated outputs, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts --reporter=dot` first failed because `src/redteam/promptInjectionRegressionSuite.ts` did not exist.
- Product-focused rerun: `npx vitest run tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed 4/5 tests and failed only because this source-review doc did not exist.
- Focused test: `npx vitest run tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1238MaliciousAiSwarmsPromptInjectionSuiteBoundary.test.ts tests/redteam.test.ts tests/security/jailbreak.test.ts tests/redteam/attackPlugins.test.ts tests/gap1237PromptInjectionReviewAdversarialRegressionBoundary.test.ts tests/gap1243GiskardAdversarialRegressionBoundary.test.ts tests/replayBenchmarkCorpus.test.ts tests/gap0626AdversarialRegression.test.ts --reporter=dot` passed, 8 files / 234 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 974 files / 7,902 tests.
