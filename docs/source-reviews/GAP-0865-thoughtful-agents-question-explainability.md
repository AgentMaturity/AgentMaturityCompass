# GAP-0865 - thoughtful-agents question-explainability boundary

- Gap: `GAP-0865`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `xybruceliu/thoughtful-agents`, `https://github.com/xybruceliu/thoughtful-agents`, `https://pypi.org/project/thoughtful-agents/`, `https://arxiv.org/abs/2506.06975`
- Retrieval: `2026-06-21` via live GitHub repository page, linked package page, and arXiv page. The GitHub URL and linked public pages returned HTTP/2 200 in live review. The live GitHub repository page showed Star 39, Fork 11, Issues 0, Pull requests 0, 20 Commits, README.md, Apache-2.0 license, folders `assets/images`, `examples`, `scripts`, `tests`, and `thoughtful_agents`, plus files `PyPI_README.md`, `requirements.txt`, and `setup.py`.
- Status: completed as a question-level score explainability boundary over existing AMC primitives.

## Live source metadata

The live repository identifies Proactive Agents with Inner Thoughts and describes a structured approach to modeling the internal thought processes of proactive AI driven by its own internal thoughts. Relevant source-review signals include Proactive Conversational Agents with Inner Thoughts, CHI 2025, Trigger, Retrieval, Thought Formation, Evaluation, Participation, Thinking engine, System 1, System 2, Mental object management, ThoughtReservoir, MemoryStore, Conversation, Event, Overt Proactivity, Covert Proactivity, Tonal Proactivity, `predict_turn_taking_type`, and `decide_next_speaker_and_utterance`.

These facts are useful proactive-agent explainability context, but they are not question-level score explainability proof by themselves. No upstream source code, agent implementations, examples, scripts, prompts, thought models, memory objects, event schemas, package files, generated outputs, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC through existing question-level score explainability because proactive inner-thought agent frameworks can influence how users interpret Score, Shield, and Watch findings for L0-L5 diagnostic questions. The closure is not a thoughtful-agents runner, inner-thought module, memory subsystem, or proactivity engine; it is a fail-closed boundary showing that thoughtful-agents metadata is accepted only as source-review context unless AMC-owned question proof exists.

For question-level score explainability to pass, AMC needs a question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof. GitHub/README/license/proactive inner-thought agent metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanations that show why each L0-L5 question moved and which evidence was accepted or rejected. |
| Shield | Relevant only as a fail-closed trust boundary; source metadata cannot stand in for signed question evidence or safety proof. |
| Watch | Relevant only through source refs and replayable evidence chain visibility; no live monitor or drift metric changed. |
| Enforce | No runtime agent policy, turn-taking policy, memory policy, or circuit breaker changed. |
| Vault | No memory objects, event schemas, prompts, package files, or secure-storage behavior changed. |
| Fleet | Proactive-agent framework context only; no thoughtful-agents runner or orchestration topology added. |
| Passport | Existing explainability outputs can feed proof bundles, but no Passport schema changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0865.

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a positive thoughtful-agents-style source-reference packet and a negative source-metadata-only packet. The positive path requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/license/proactive inner-thought agent metadata replaces signed question evidence.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, PyPI reachability, arXiv reachability, README.md presence, Apache-2.0 license metadata, Star 39, Fork 11, Issues 0, Pull requests 0, 20 Commits, folder names, package file names, proactive-agent labels, inner-thought labels, CHI 2025 labels, Trigger/Retrieval/Thought Formation/Evaluation/Participation labels, Thinking engine labels, System 1/System 2 labels, mental-object labels, proactivity labels, turn-taking labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No thoughtful-agents adapter, inner-thought module, proactivity engine, turn-taking predictor, memory subsystem, ThoughtReservoir implementation, MemoryStore implementation, Conversation implementation, Event implementation, package wrapper, PyPI integration, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport schema field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream source code, agent implementations, examples, scripts, prompts, thought models, memory objects, event schemas, package files, generated outputs, README prose beyond minimal metadata facts, screenshots, figures, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0865ThoughtfulAgentsQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the existing positive and negative question-explainability paths passed.
- Focused regression after doc addition: `npx vitest run tests/gap0865ThoughtfulAgentsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0864ChiBenchQuestionExplainabilityBoundary.test.ts tests/gap0865ThoughtfulAgentsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
