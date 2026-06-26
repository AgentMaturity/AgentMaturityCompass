# GAP-0851 - AutoMedBench question-explainability boundary

- Gap: `GAP-0851`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `AutoMedBench/AutoMedBench`, `https://github.com/AutoMedBench/AutoMedBench`, website `https://automedbench.github.io/`, arXiv `https://arxiv.org/abs/2606.01961`
- Retrieval: `2026-06-21` via live GitHub page, GitHub REST API, README API, license API, and shell header checks. Repository URL returned HTTP/2 200. api.github.com repository metadata returned `stargazers_count` 52, no detected language, MIT License metadata, no repository topics, and description metadata for MedAutoBench - Medical AutoResearch Benchmark for Autonomous AI Agents. README.md and LICENSE API lookups succeeded.
- Status: Done; closed by documenting and testing the existing question-level score explainability boundary without adding a clinical or benchmark-specific subsystem.

## Live source metadata

The live README and API metadata identify AutoMedBench / MedAutoBench as a benchmark for AI agents on medical AI tasks. Relevant source-review signals include Towards Medical AutoResearch, Medical AutoResearch Benchmark for Autonomous AI Agents, five stages, S1 Plan, S2 Setup, S3 Validate, S4 Inference, S5 Submit, strict rubric, Sandbox, HuggingFace, kidney-seg-task, segmentation, image enhancement, VQA, report generation, lesion detection, classification, six frontier agents, Validate is the weakest stage, live dashboard, six domains, and 5,500+ recorded runs.

These facts are useful medical-agent benchmark context, but they are not AMC question-level score explainability evidence by themselves. No upstream tasks, datasets, sandbox images, rubrics, leaderboard rows, post images, medical data, task configs, scoring rules, prompts, outputs, README prose beyond minimal metadata facts, screenshots, figures, citations, or implementation details were copied into AMC.

## Relevance decision

Relevant to AMC only through existing question-score explainability primitives. Medical autonomous-agent benchmark context can help operators understand why a control matters, but it cannot explain a specific L0-L5 movement unless AMC has question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, and source refs.

The source does not justify a clinical subsystem, medical benchmark runner, sandbox runner, task importer, leaderboard importer, or medical scoring path. GAP-0851 is closed by regression coverage showing that AutoMedBench context can be represented by AMC-owned question-score evidence, and that GitHub/API/README/license/medical benchmark metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when question movement is explained with AMC-owned accepted evidence, rejected evidence reasons, and row proof. |
| Shield | Medical-agent context is high-risk, but no safety or clinical claim changes without signed AMC evidence. |
| Watch | Context only; no runtime monitoring receipt changed. |
| Enforce | No runtime policy, clinical action enforcement, sandbox policy, or circuit breaker changed. |
| Vault | No medical data, datasets, task configs, images, prompts, or secure-storage behavior changed. |
| Fleet | Benchmark context only; no orchestration topology or medical-agent runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No healthcare, HIPAA, FDA, or clinical compliance mapping changed. |

## Product closure

The product path remains the existing question-score explainability primitive: `buildQuestionExplainabilityReport`. The focused regression exercises an AutoMedBench-style medical benchmark context using AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, source refs, and row hashes.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0851.

## Fail-closed rule

GitHub HTTP/2 200 reachability, api.github.com repository metadata, README.md presence, LICENSE presence, MIT License metadata, `stargazers_count` 52, no detected language, no repository topics, MedAutoBench label, Medical AutoResearch Benchmark for Autonomous AI Agents label, Towards Medical AutoResearch label, benchmark for AI agents on medical AI tasks label, five stages label, S1 Plan label, S2 Setup label, S3 Validate label, S4 Inference label, S5 Submit label, strict rubric label, Sandbox label, HuggingFace label, kidney-seg-task label, segmentation label, image enhancement label, VQA label, report generation label, lesion detection label, classification label, six frontier agents label, Validate is the weakest stage label, local backlog metadata, or source identity alone must fail closed. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No AutoMedBench runner, clinical subsystem, medical benchmark runner, sandbox runner, Docker orchestrator, task importer, dataset importer, HuggingFace mirror, task-gallery importer, leaderboard importer, five-stage rubric importer, scoring-rubric importer, live-dashboard integration, clinical-claim verifier, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific question lens, or source-specific scoring path was added. No upstream tasks, datasets, sandbox images, rubrics, leaderboard rows, post images, medical data, task configs, scoring rules, prompts, outputs, README prose beyond minimal metadata facts, screenshots, figures, citations, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0851AutoMedBenchQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability positive, metadata-only fail-closed, and no-leakage checks passed.
- Focused regression after doc addition: `npx vitest run tests/gap0851AutoMedBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0850AwesomeRagPapersQuestionExplainabilityBoundary.test.ts tests/gap0851AutoMedBenchQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
