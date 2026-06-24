# GAP-0877 - ruby_llm-contract question-explainability boundary

- Gap: `GAP-0877`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `justi/ruby_llm-contract`, `https://github.com/justi/ruby_llm-contract`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 14, Fork 0, Issues 0, Pull requests 0, 97 Commits, README.md, LICENSE, MIT license, No releases published, Ruby 100.0%, repository folders `doc/ decisions`, `docs`, `examples`, `lib/ ruby_llm`, and `spec`, and files including `CHANGELOG.md`, `Gemfile`, `Rakefile`, and `ruby_llm-contract.gemspec`.
- Status: completed as a question-level score explainability boundary over existing AMC receipts.

## Live source metadata

The live repository identifies ruby_llm-contract as contracts for LLM quality. Relevant source-review signals include JSON output schema, `retry_policy`, cost tracking, `compare_models`, fail-fast behavior, CI gate, baseline regression detection, eval history, `score_trend`, drift, Prompt A/B testing, observe DSL, `estimate_eval_cost`, and provider labels OpenAI, Anthropic, and Gemini.

These facts are useful contract-validation and regression-eval context, but they are not question-level score explainability proof by themselves. No upstream Ruby code, gem metadata, contract schemas, prompts, provider configs, test fixtures, eval outputs, cost estimates, histories, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability receipts because contract validation, retry rules, model comparison, cost tracking, and regression metadata can inform how users reason about Score, Shield, and Watch question movement. The closure is not a ruby_llm-contract adapter, Ruby gem integration, JSON schema validator, retry engine, model comparison runner, cost tracker, or CI gate mirror; it is a fail-closed boundary showing that ruby_llm-contract metadata is accepted only as source-review context unless AMC-owned question explainability proof exists.

For question-level score explainability to pass, AMC needs question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof. GitHub/README/license/contract-validation metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, and row-hashed question score receipts. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question-level evidence. |
| Watch | Relevant through existing replayability and source-ref visibility; no live monitor changed. |
| Enforce | No runtime JSON-schema policy, retry policy, model fallback policy, or circuit breaker changed. |
| Vault | No provider configs, prompts, eval outputs, cost histories, schemas, or secure-storage behavior changed. |
| Fleet | Contract-validation context only; no ruby_llm-contract runner or orchestration topology added. |
| Passport | Existing question explainability receipts can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0877.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive ruby_llm-contract-style question explainability packet and a negative source-metadata-only packet. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, source refs, thresholds, row hashes, and replayability. The negative path fails closed when GitHub/README/license/contract-validation metadata replaces signed question-level score evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, LICENSE presence, MIT license metadata, Star 14, Fork 0, Issues 0, Pull requests 0, 97 Commits, No releases published, Ruby 100.0%, folder names, file names, Contracts for LLM quality labels, JSON output schema labels, `retry_policy` labels, cost tracking labels, `compare_models` labels, fail-fast labels, CI gate labels, baseline regression detection labels, eval history labels, `score_trend` labels, drift labels, Prompt A/B testing labels, observe DSL labels, `estimate_eval_cost` labels, OpenAI labels, Anthropic labels, Gemini labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence rows, source refs, thresholds, row hashes, replayability, and no-copy proof.

## No-bloat boundary

No ruby_llm-contract adapter, Ruby gem integration, JSON schema validator, retry engine, model fallback runner, model comparison runner, cost tracker, CI gate mirror, baseline importer, eval history importer, score trend analyzer, drift detector, prompt A/B runner, observe DSL parser, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Ruby code, gem metadata, contract schemas, prompts, provider configs, test fixtures, eval outputs, cost estimates, histories, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0877RubyLlmContractQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0877RubyLlmContractQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0876CostBenchPublicMethodologyBoundary.test.ts tests/gap0877RubyLlmContractQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
