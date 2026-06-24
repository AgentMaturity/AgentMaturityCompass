# GAP-0861 - Hypothetical-Minds question-explainability boundary

- Gap: `GAP-0861`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `locross93/Hypothetical-Minds`, `https://github.com/locross93/Hypothetical-Minds`, `https://arxiv.org/abs/2407.07086`, `https://locross93.github.io/hypotheticalminds/`
- Retrieval: `2026-06-21` via live GitHub repository page, linked arXiv page, and Hypothetical Minds Project Website. The GitHub URL and linked public pages returned HTTP/2 200 in live review. The live GitHub repository page showed Star 41, Fork 6, Issues 0, Pull requests 0, 27 Commits, README.md, MIT license, No releases published, Python 99.9%, Shell 0.1%, folders `environments` and `llm_plan`, plus files `main.py`, `run_scenarios.py`, `setup.py`, and `requirements.txt`.
- Status: completed as a question-level score explainability boundary over existing AMC primitives.

## Live source metadata

The live repository identifies Hypothetical-Minds: Scaffolding Theory of Mind for Multi-Agent Tasks with Large Language Models. Relevant source-review signals include Theory of Mind module, generating, evaluating, and refining hypotheses, multi-agent settings, Research Paper, Hypothetical Minds Project Website, MeltingPot, OPENAI_API_KEY, Running With Scissors Repeated, Collaborative Cooking Asymmetric, Reflexion baseline, Substrates, `collaborative_cooking__asymmetric`, `running_with_scissors_in_the_matrix__repeated`, `prisoners_dilemma_in_the_matrix__repeated`, `vllm`, and LLaMA 3.

These facts are useful multi-agent Theory-of-Mind benchmark context, but they are not question-level score explainability proof by themselves. No upstream source code, environments, prompts, scenario configs, agent policies, generated hypotheses, evaluation results, README prose beyond minimal metadata facts, project page prose, screenshots, figures, model outputs, package config, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability because multi-agent Theory-of-Mind benchmarks can influence how users interpret Score, Shield, and Watch findings for L0-L5 diagnostic questions. The closure is not a Hypothetical-Minds runner, MeltingPot adapter, or Theory-of-Mind module; it is a fail-closed boundary showing that Hypothetical-Minds metadata is accepted only as source-review context unless AMC-owned question proof exists.

For question-level score explainability to pass, AMC needs a question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof. GitHub/README/license/Theory-of-Mind agent metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations that show why each L0-L5 question moved and which evidence was accepted or rejected. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question evidence or safety proof. |
| Watch | Relevant only through source refs and replayable evidence chain visibility; no live monitor or drift metric changed. |
| Enforce | No runtime multi-agent policy, prompt policy, or circuit breaker changed. |
| Vault | No environments, prompts, scenario configs, generated hypotheses, or secure-storage behavior changed. |
| Fleet | Multi-agent benchmark context only; no Hypothetical-Minds runner, MeltingPot adapter, or orchestration topology added. |
| Passport | Existing explainability outputs can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0861.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive Hypothetical-Minds-style source-reference packet and a negative source-metadata-only packet. The positive path requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/license/Theory-of-Mind agent metadata replaces signed question evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, arXiv reachability, project page reachability, README.md presence, MIT license metadata, Star 41, Fork 6, Issues 0, Pull requests 0, 27 Commits, No releases published, Python 99.9%, Shell 0.1%, folder names, file names, Theory of Mind module labels, MeltingPot labels, OPENAI_API_KEY labels, scenario names, Reflexion baseline labels, Substrates labels, vllm labels, LLaMA 3 labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No Hypothetical-Minds adapter, Theory-of-Mind module, MeltingPot adapter, scenario runner, environment importer, prompt importer, generated-hypothesis importer, Reflexion baseline runner, vLLM wrapper, LLaMA wrapper, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, environments, prompts, scenario configs, agent policies, generated hypotheses, evaluation results, README prose beyond minimal metadata facts, project page prose, screenshots, figures, model outputs, package config, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0861HypotheticalMindsQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0861HypotheticalMindsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0860GoOpenllmetryStudioDrilldownBoundary.test.ts tests/gap0861HypotheticalMindsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
