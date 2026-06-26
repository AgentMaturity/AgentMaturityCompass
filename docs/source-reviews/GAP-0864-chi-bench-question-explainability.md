# GAP-0864 - CHI-Bench question-explainability boundary

- Gap: `GAP-0864`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `actava-ai/chi-bench`, `https://github.com/actava-ai/chi-bench`, `https://actava.ai/benchmarks/docs/quickstart`, `https://arxiv.org/abs/2605.16679`
- Retrieval: `2026-06-21` via live GitHub repository page, docs page, and arXiv page. The GitHub URL and linked public pages returned HTTP/2 200 in live review. The live GitHub repository page showed Star 41, Fork 6, Issues 0, Pull requests 10, 124 Commits, README.md, Apache-2.0 license, No releases published, Python 98.3%, Other 1.7%, and topics `benchmark`, `care-management`, `healthcare-ai`, and `prior-authorization`.
- Status: completed as a question-level score explainability boundary over existing AMC primitives.

## Live source metadata

The live repository identifies CHI-Bench: Can AI Agents Automate End-to-End, Long-Horizon, Policy-Rich Healthcare Workflows? Relevant source-review signals include long-horizon, policy-rich healthcare workflow agents, provider prior authorization, payer utilization management, population care management, 20 healthcare apps exposed over MCP, 1,279-document Managed-Care Operations Handbook, 75 tasks, 78 single-agent tasks, 23 provider-payer E2E tasks, pass@1, pass^3, Marathon, scorecard.json, reward.json, binary_reward, fractional_reward, submission.json, results.csv, and provenance.json.

These facts are useful healthcare workflow benchmark context, but they are not question-level score explainability proof by themselves. No upstream source code, tasks, healthcare app definitions, MCP server configs, policy handbook text, patient/provider/payer records, prompts, generated outputs, scorecards, results rows, provenance rows, README prose beyond minimal metadata facts, docs prose, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability because healthcare workflow benchmarks can influence how users interpret Score, Shield, and Watch findings for L0-L5 diagnostic questions. The closure is not a CHI-Bench runner, healthcare subsystem, MCP integration, or clinical claim; it is a fail-closed boundary showing that CHI-Bench metadata is accepted only as source-review context unless AMC-owned question proof exists.

For question-level score explainability to pass, AMC needs a question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof. GitHub/README/license/healthcare workflow benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations that show why each L0-L5 question moved and which evidence was accepted or rejected. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question evidence, safety proof, or clinical proof. |
| Watch | Relevant only through source refs and replayable evidence chain visibility; no live monitor or drift metric changed. |
| Enforce | No runtime healthcare workflow policy, MCP policy, clinical policy, or circuit breaker changed. |
| Vault | No healthcare records, benchmark tasks, policy handbook text, scorecards, results rows, or secure-storage behavior changed. |
| Fleet | Healthcare workflow benchmark context only; no CHI-Bench runner, MCP environment, or orchestration topology added. |
| Passport | Existing explainability outputs can feed proof bundles, but no Passport schema changed. |
| Comply | No healthcare compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0864.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive CHI-Bench-style source-reference packet and a negative source-metadata-only packet. The positive path requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/license/healthcare workflow benchmark metadata replaces signed question evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, docs reachability, arXiv reachability, README.md presence, Apache-2.0 license metadata, Star 41, Fork 6, Issues 0, Pull requests 10, 124 Commits, No releases published, Python 98.3%, Other 1.7%, benchmark labels, care-management labels, healthcare-ai labels, prior-authorization labels, healthcare workflow labels, MCP labels, task-count labels, pass@1 labels, pass^3 labels, Marathon labels, scorecard labels, reward labels, result/provenance labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No CHI-Bench adapter, healthcare workflow subsystem, MCP environment, MCP server wrapper, healthcare app importer, task importer, policy handbook importer, prior-authorization workflow, utilization-management workflow, population-care workflow, clinical verifier, scorecard parser, result-row importer, provenance importer, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, tasks, healthcare app definitions, MCP server configs, policy handbook text, patient/provider/payer records, prompts, generated outputs, scorecards, results rows, provenance rows, README prose beyond minimal metadata facts, docs prose, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0864ChiBenchQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0864ChiBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0863LangchainSynDataRagEvalProviderDriftBoundary.test.ts tests/gap0864ChiBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
