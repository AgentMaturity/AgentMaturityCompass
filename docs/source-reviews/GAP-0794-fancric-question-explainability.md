# GAP-0794 - FanCric question-explainability boundary

- Gap: `GAP-0794`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2410.01307`, arXiv DOI `https://doi.org/10.48550/arXiv.2410.01307`, related DOI `https://doi.org/10.1007/978-981-95-5441-6_23`, OpenAlex `https://openalex.org/W7128785636`
- Retrieval: `2026-06-21` via live arXiv page review; the Springer DOI is retained as source metadata from the arXiv/backlog record.
- Status: closed through existing question-level score explainability receipts; no FanCric/Fantasy 11 subsystem, sports-betting workflow, or fantasy-cricket evaluator added.

## Live source metadata

The live arXiv page identifies the source as FanCric / `Multi-agentic Framework for Crafting Fantasy 11 Cricket Teams`, arXiv `2410.01307`, submitted `2 Oct 2024`, with arXiv DOI `10.48550/arXiv.2410.01307` and related DOI `10.1007/978-981-95-5441-6_23`. Listed author metadata includes Mohit Bhatnagar.

Relevant source-review signals include IPL, Dream11, fantasy cricket, Large Language Models, orchestration framework, `12.7 million unique entries`, wisdom of crowds, Prompt Engineering, ablation studies, multi-agent team construction, and sports/fantasy benchmark context. These facts are question-level score explainability context only. No upstream paper prose beyond short metadata facts, fantasy-team examples, player data, prompts, generated lineups, scoring tables, strategy details, screenshots, figures, datasets, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0794 is relevant to AMC because multi-agent benchmark claims need question-level explanations: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes. The accepted AMC primitive is already `buildQuestionExplainabilityReport`.

The source is not an AMC fantasy-cricket benchmark, sports-betting feature, portfolio/risk product, or customer-facing sports workflow. FanCric can be retained only as fantasy-sports benchmark context when AMC-owned question evidence explains why a score moved and what repair path remains. arXiv/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows with accepted evidence IDs, rejected evidence reasons, repair hints, and row hashes. |
| Shield | Relevant through fail-closed handling for unsupported fantasy-cricket, sports, lineup, crowd, LLM, or benchmark claims. |
| Watch | Relevant when question explanations bind to replayable evidence and regression receipts; no live monitor changed. |
| Enforce | No runtime sports, betting, finance, lineup, or prompt policy changed. |
| Vault | No player data, team lineups, prompts, outputs, strategy data, or secure-storage behavior changed. |
| Fleet | Multi-agent team-construction context only; no orchestration adapter or fantasy-agent topology changed. |
| Passport | No portable proof-bundle field or sports/fantasy credential changed. |
| Comply | Sports/fantasy context only; no gambling, financial, or compliance claim changed. |

## Product closure

GAP-0794 is closed by documenting the live-source boundary and adding regression coverage over the existing question-score explainability primitive. The positive path proves that FanCric-style fantasy-cricket context is accepted only when AMC-owned question rows include accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, signed evidence, and row hashes. The negative path proves arXiv/DOI/OpenAlex/title metadata alone fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, FanCric benchmark, fantasy-cricket lineup generator, Dream11 adapter, player-data importer, prompt-engineering workflow, sports-betting workflow, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0794.

## Fail-closed rule

arXiv URL, arXiv DOI, related DOI, OpenAlex work ID, title, author list, FanCric labels, IPL labels, Dream11 labels, fantasy-cricket labels, Large Language Models labels, orchestration-framework labels, 12.7-million-entries labels, wisdom-of-crowds labels, Prompt Engineering labels, ablation-study labels, local backlog metadata, or source identity alone must fail closed for question-level explainability claims. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, missing-gate reasons, row hashes, Score/Shield/Watch surface coverage, and no-copy proof.

## No-bloat boundary

No FanCric benchmark, fantasy-cricket lineup generator, Dream11 adapter, player-data importer, prompt-engineering workflow, sports-betting workflow, crowd-prediction workflow, team-construction simulator, paper importer, OpenAlex importer, DOI resolver, arXiv importer, Springer importer, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, fantasy-team examples, player data, prompts, generated lineups, scoring tables, strategy details, screenshots, figures, datasets, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0794FanCricQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
