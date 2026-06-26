# GAP-0854 - STATE-Bench question-explainability boundary

- Gap: `GAP-0854`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `microsoft/STATE-Bench`, `https://github.com/microsoft/STATE-Bench`, `https://raw.githubusercontent.com/microsoft/STATE-Bench/main/README.md`, `https://microsoft.github.io/STATE-Bench/leaderboard/`
- Retrieval: `2026-06-21` via live GitHub repository page, raw README, and linked leaderboard review. The GitHub URL and raw README returned HTTP/2 200 in live review. The live GitHub repository page showed Star 57, Fork 9, Issues 3, Pull requests 6, 87 Commits, README.md, MIT license, v0.7.0 Latest May 28, 2026, topics `ai`, `ai-agents`, `benchmark`, `benchmark-framework`, and `microsoft`, and a language mix led by Python 96.3% and JavaScript 1.8%.
- Status: completed as a question-level score explainability boundary over existing AMC primitives.

## Live source metadata

The live README identifies STATE-Bench as a benchmark for AI agents on realistic, multi-step enterprise workflows. Relevant source-review signals include travel, customer support, shopping assistant, task-local sandbox database, domain-specific tools, simulated user, 450 challenging enterprise tasks, Main Track, Agent Learning Track, train trajectories, retrieval hook, Task Completion pass@1, Task Completion pass^5, UX Score, Cost Per Task, and the statement that tasks were synthetically generated using large language models.

These facts are useful enterprise workflow benchmark context, but they are not question-level score explainability proof by themselves. No upstream benchmark code, datasets, task rows, train trajectories, leaderboard rows, sandbox schemas, tool implementations, prompts, generated tasks, README prose beyond minimal metadata facts, results, screenshots, figures, model outputs, package config, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability because enterprise workflow benchmarks can influence how users interpret Score, Shield, and Watch findings for L0-L5 diagnostic questions. The closure is not a STATE-Bench runner or importer; it is a fail-closed boundary showing that STATE-Bench metadata is accepted only as source-review context unless AMC-owned question proof exists.

For question-level score explainability to pass, AMC needs a question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof. GitHub/README/license/enterprise workflow benchmark metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations that show why each L0-L5 question moved and which evidence was accepted or rejected. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question evidence or safety proof. |
| Watch | Relevant only through source refs and replayable evidence chain visibility; no live monitor or drift metric changed. |
| Enforce | No runtime workflow policy, tool policy, or circuit breaker changed. |
| Vault | No datasets, trajectories, sandbox data, generated tasks, or secure-storage behavior changed. |
| Fleet | Enterprise workflow benchmark context only; no STATE-Bench runner, agent simulator, or orchestration topology added. |
| Passport | Existing explainability outputs can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0854.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive STATE-Bench-style source-reference packet and a negative source-metadata-only packet. The positive path requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/license/enterprise workflow benchmark metadata replaces signed question evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, raw README reachability, README.md presence, MIT license metadata, Star 57, Fork 9, Issues 3, Pull requests 6, 87 Commits, v0.7.0 Latest May 28, 2026, Python 96.3%, JavaScript 1.8%, topics such as `benchmark-framework` or `ai-agents`, leaderboard metadata, enterprise workflow labels, Main Track, Agent Learning Track, train trajectories, retrieval hook, task-completion labels, UX Score, Cost Per Task, synthetic-task labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No STATE-Bench adapter, benchmark runner, dataset importer, task importer, train-trajectory importer, leaderboard importer, sandbox database mirror, domain-tool wrapper, simulated-user runner, retrieval hook integration, enterprise-workflow simulator, source-specific question lens, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream benchmark code, datasets, task rows, train trajectories, leaderboard rows, sandbox schemas, tool implementations, prompts, generated tasks, README prose beyond minimal metadata facts, results, screenshots, figures, model outputs, package config, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0854StateBenchQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0854StateBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0853AuctionArenaPublicMethodologyBoundary.test.ts tests/gap0854StateBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
