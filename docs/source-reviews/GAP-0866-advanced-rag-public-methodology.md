# GAP-0866 - Advanced-RAG public-methodology boundary

- Gap: `GAP-0866`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `aishwaryaprabhat/Advanced-RAG`, `https://github.com/aishwaryaprabhat/Advanced-RAG`
- Retrieval: `2026-06-21` via live GitHub repository page and README review. The GitHub URL returned HTTP/2 200 in live review. The live GitHub repository page showed Star 36, Fork 7, Issues 0, Pull requests 0, 22 Commits, README.md, MIT license, No releases published, Jupyter Notebook 99.1%, Shell 0.9%, and repository items including `assets`, `Advanced_RAG.ipynb`, `download_dataset.sh`, and `requirements.txt`.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live repository identifies Advanced-RAG as `Performing, Evaluating & Tracking Advanced RAG`, with Advanced RAG methods ft. AzureML and LlamaIndex. Relevant source-review signals include Ragas, Chunks with Overlap, Sentence Window Retrieval, Hierarchical Automerge Retrieval, Context Precision, Context Recall, Faithfulness, Answer Relevancy, Answer Similarity, Answer Correctness, Azure ML Studio, and MLflow.

These facts are useful RAG evaluation and experiment-tracking context, but they are not AMC public-methodology lifecycle evidence. No upstream notebook code, shell scripts, requirements, examples, docs prose beyond minimal metadata facts, generated outputs, datasets, prompts, screenshots, figures, AzureML configuration, LlamaIndex implementation detail, Ragas metric implementation, MLflow tracking setup, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because RAG evaluation, tracking, and retrieval-method labels can inform how users reason about Score, Shield, and Watch limits. It does not justify changing AMC public scoring, diagnostic methodology, badge semantics, or public methodology lifecycle by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof. Advanced-RAG metadata alone cannot justify a public methodology version bump. GAP-0866 is therefore closed as a documented no-op: the source remains relevant context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not provide AMC-owned methodology versioning evidence. |
| Shield | Context only; RAG evaluation labels reinforce fail-closed review boundaries but do not add Shield behavior. |
| Watch | Context only; experiment-tracking metadata does not create an AMC monitoring receipt or public methodology lifecycle change. |
| Enforce | No runtime RAG policy, retrieval policy, prompt policy, or circuit breaker changed. |
| Vault | No notebooks, datasets, requirements, shell scripts, examples, or secure-storage behavior changed. |
| Fleet | RAG workflow context only; no agent runner, experiment tracker, or orchestration topology added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0866.

The focused regression verifies that GitHub/README/license/RAG/notebook/AzureML/LlamaIndex/Ragas/metric/tracking metadata stays out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, known-limitations update, evidence-taxonomy change, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

GitHub HTTP/2 200 reachability, live GitHub repository page metadata, README.md presence, MIT license metadata, Star 36, Fork 7, Issues 0, Pull requests 0, 22 Commits, No releases published, Jupyter Notebook 99.1%, Shell 0.9%, repository file names, Advanced-RAG labels, RAG method labels, metric names, AzureML labels, LlamaIndex labels, Ragas labels, Azure ML Studio labels, MLflow labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No Advanced-RAG adapter, notebook runner, RAG method importer, AzureML integration, LlamaIndex wrapper, Ragas wrapper, MLflow tracker, dataset downloader, shell-script runner, metric implementation, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream notebook code, shell scripts, requirements, examples, docs prose beyond minimal metadata facts, generated outputs, datasets, prompts, screenshots, figures, AzureML configuration, LlamaIndex implementation detail, Ragas metric implementation, MLflow tracking setup, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0866AdvancedRagPublicMethodologyBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the implementation no-leakage check passed.
- Focused regression after doc addition: `npx vitest run tests/gap0866AdvancedRagPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0865ThoughtfulAgentsQuestionExplainabilityBoundary.test.ts tests/gap0866AdvancedRagPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
