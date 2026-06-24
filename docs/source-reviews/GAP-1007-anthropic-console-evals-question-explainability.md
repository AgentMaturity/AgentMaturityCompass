# GAP-1007 - Anthropic Console Evals question-explainability boundary

- Gap: `GAP-1007`
- Dimension: Question-level score explainability (`eval-score-explainability`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Anthropic Console Evals / Claude API Docs
- Retrieval: live official-source retrieval on 2026-06-24 from `https://docs.anthropic.com`, `https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool`, `https://platform.claude.com/docs/en/test-and-evaluate/eval-tool`, `https://docs.anthropic.com/en/docs/build-with-claude/develop-tests`, `https://platform.claude.com/docs/en/test-and-evaluate/develop-tests`, `https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator`, and `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools`
- Status: Done

## Relevance decision

GAP-1007 is relevant to AMC only through the existing question-level score explainability primitive. Anthropic's official Console Evaluation docs describe prompt evaluation workflows, generated and imported test cases, result comparison, grading, prompt versioning, and evaluation-design guidance. That is useful context for AMC's requirement that every L0-L5 question score explain why it moved, which evidence was accepted, which evidence was rejected, which repair hint applies, and which reproducible eval pack and fail-closed thresholds support the result.

The source does not justify an Anthropic Console integration. Official docs, redirect headers, Console feature labels, CSV import support, generated test cases, quality grading, or prompt versioning cannot prove AMC maturity by themselves. AMC can pass only when it has its own question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval pack, and fail-closed thresholds tied to the lifecycle run.

Live official-source metadata reviewed:

- Source root: `https://docs.anthropic.com`.
- Evaluation tool entry URL: `https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool`.
- Evaluation tool canonical URL: `https://platform.claude.com/docs/en/test-and-evaluate/eval-tool`.
- Evaluation tool redirect/header evidence: `HTTP/2 301`, `HTTP/2 307`, `HTTP/2 200`, and `x-request-pathname: /docs/en/test-and-evaluate/eval-tool`.
- Evaluation tool title: `Using the Evaluation Tool - Claude API Docs`.
- Evaluation tool metadata references the Claude Console `Evaluation tool`.
- Evaluation tool page context reviewed: prompt editor access, `Evaluate tab`, dynamic variables, prompt generation support, manual rows, `Generate Test Case`, `CSV` import, rerunning an eval suite, `side-by-side comparison`, `Quality grading`, and `Prompt versioning`.
- Evaluation design entry URL: `https://docs.anthropic.com/en/docs/build-with-claude/develop-tests`.
- Evaluation design canonical URL: `https://platform.claude.com/docs/en/test-and-evaluate/develop-tests`.
- Evaluation design redirect/header evidence: `HTTP/2 301`, `HTTP/2 307`, and `HTTP/2 200`.
- Evaluation design title: `Define success criteria and build evaluations - Claude API Docs`.
- Evaluation design context reviewed: `Specific`, `Measurable`, `Build evaluations`, `Eval design principles`, `Example evals`, `Grade your evaluations`, `LLM-based grading`, `Task fidelity`, `Consistency`, `Privacy preservation`, `Context utilization`, `Latency`, and `Price`.
- Console prompting tools entry URL: `https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator`.
- Console prompting tools canonical URL: `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-tools`.
- Console prompting tools title: `Console prompting tools - Claude API Docs`.

These official-doc facts are source-review signals only. They are not copied into AMC as prompts, graders, examples, screenshots, CSV schemas, API behavior, Console behavior, or source-specific product code.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant. Anthropic Console Evals reinforces that score movement needs question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, and fail-closed thresholds. |
| Shield | Relevant only as assurance context. External prompt-evaluation labels cannot substitute for signed AMC evidence or threshold receipts. |
| Enforce | Not changed. No runtime policy, guardrail, or Console enforcement path is added. |
| Vault | Not changed. No Anthropic credentials, Console data, prompt sets, CSV uploads, or storage integration are added. |
| Watch | Relevant through existing lifecycle/eval threshold receipts that can surface failed regression gates. No Anthropic Console watcher is added. |
| Fleet | Not changed. Prompt-version comparison does not create AMC fleet orchestration behavior. |
| Passport | Relevant through existing external proof bundle shape only; no Anthropic proof adapter is added. |
| Comply | Not changed. This source does not change compliance mappings. |

## Product closure

No product module changed for GAP-1007 because AMC already has the relevant primitive in `src/diagnostic/questionScoreExplainability.ts`, with downstream guide and passport support in `src/guide/guideGenerator.ts` and `src/passport/passportArtifact.ts`.

The focused regression test `tests/gap1007AnthropicConsoleEvalsQuestionExplainabilityBoundary.test.ts` proves:

- A positive AMC-owned question explainability row is replayable and not fail-closed when it has signed accepted evidence, rejected evidence reasons, a repair hint, criterion diagnostics, reproducible eval pack metadata, CI/export/trace hashes, and pass-rate/average-score thresholds.
- A metadata-only Anthropic Console Evals source-review row fails closed when it lacks accepted evidence, signed rows, thresholds, and question-level proof.
- The source-review boundary does not add `https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool`, `https://platform.claude.com/docs/en/test-and-evaluate/eval-tool`, `Anthropic Console Evals`, or `anthropic_console_evals_question_explainability` identifiers to diagnostic, guide, or passport implementation modules.

## Fail-closed rule

Metadata-only proof must fail closed. Official Anthropic docs, redirect status, canonical URLs, page titles, Console feature labels, prompt editor access, dynamic variable guidance, generated test cases, CSV import, result comparison, quality grading, prompt versioning, success-criteria guidance, example-eval categories, LLM-based grading, latency guidance, and pricing guidance do not prove an AMC maturity level.

A question score can pass only when AMC has its own question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, row hashes, reproducible eval pack, and fail-closed thresholds tied to the lifecycle run.

## No-bloat boundary

No Anthropic Console integration, Claude eval runner, prompt test importer, CSV importer, Console scraper, generated-test-case wrapper, grader adapter, prompt-version bridge, result-comparison adapter, API route, CLI command, Studio panel, dependency, copied docs prose, copied prompts, copied examples, copied screenshots, copied CSV rows, copied generated outputs, or source-specific subsystem was added.

Anthropic Console Evals remains source-review signal only.

## Verification

- Expected-red TDD check: `npx vitest run tests/gap1007AnthropicConsoleEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot` initially found a bad test assumption about the built-in `AMC-1.2` repair hint target; after correcting that to `Target L5`, the focused test failed only because this doc did not exist yet and the 3 product/boundary assertions passed.
- Live source retrieval:
  - `curl -fsSL -I https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool | sed -n '1,40p'`
  - `curl -fsSL https://docs.anthropic.com/en/docs/test-and-evaluate/eval-tool | rg -n "<title>|meta name=\"description\"|og:title|og:description|Evaluation tool|Evaluate|prompt editor|dynamic variables|Generate Prompt|Generate Test Case|CSV|test cases|grader|grade|success criteria|results|compare|pass|fail|Console|Last updated|lastUpdated"`
  - `curl -fsSL -I https://docs.anthropic.com/en/docs/build-with-claude/develop-tests | sed -n '1,40p'`
  - `curl -fsSL https://docs.anthropic.com/en/docs/build-with-claude/develop-tests | rg -n "<title>|meta name=\"description\"|og:title|og:description|success criteria|Specific|Measurable|Build evaluations|Eval design principles|Example evals|Grade your evaluations|LLM-based grading|Task fidelity|Consistency|Relevance|Privacy preservation|Context utilization|Latency|Price|Last updated|lastUpdated"`
  - `curl -fsSL https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-generator | rg -n "<title>|Console prompting tools|Prompt templates|variables|prompt generator|prompt improver|Evaluation tool|track versions|test different inputs|edge cases|Last updated|lastUpdated"`
- Final verification will be recorded after focused tests, typecheck, full suite, commit, push, and Linear closeout.
