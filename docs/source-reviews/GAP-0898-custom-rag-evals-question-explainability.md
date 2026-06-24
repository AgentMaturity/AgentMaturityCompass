# GAP-0898 - custom-rag-evals question-explainability boundary

- Gap: `GAP-0898`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `ALucek/custom-rag-evals`, `https://github.com/ALucek/custom-rag-evals`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 18, Fork 3, Issues 0, Pull requests 0, 2 Commits, README.md, No releases published, Jupyter Notebook 100.0%, repository folders `domain_specific` and `media_2`, and notebook file `chunking_evals.ipynb`. No license metadata was visible on the GitHub repository page.
- Status: completed as `Done`.

## Live source metadata

The live README identifies the project as Evaluating Domain Specific RAG Chunking & Embedding Strategies and Applying domain specific evaluations to RAG chunking and embedding functions. Relevant source-review signals include ChromaDB, Evaluating Chunking Strategies for Retrieval, `text-embedding-3-large`, Cluster Semantic Chunker, 200 token chunk size, precision, recall, intersection over union, LLM Chunker, Recursive Character Text Splitter, custom chunking strategies, embedding strategies, synthetic dataset creation, domain-specific documents, and RAG retrieval evaluation.

Those facts are relevant to AMC only as question-level score explainability context. They do not allow AMC to claim RAG chunking evaluation support, import the notebook, or copy ChromaDB evaluation logic. For Score, Shield, and Watch, the relevant AMC requirement remains question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, thresholds, row hashes, and no-copy proof.

No upstream notebook cells, README prose beyond minimal metadata facts, diagrams, media assets, chunking implementations, embedding configs, ChromaDB examples, synthetic dataset rows, domain-specific documents, evaluation results, prompts, OpenAI model configs, or implementation details were copied into AMC.

## Relevance decision

`GAP-0898` is relevant to AMC through the existing question-level score explainability primitive. The source signal is that RAG-chunking and embedding evaluation should be explainable at the individual question or evaluation-row level, not that AMC should add a custom-rag-evals adapter or notebook runner.

The closure uses existing AMC question-score explainability reports only. It does not add a RAG chunking evaluator, embedding evaluator, ChromaDB integration, notebook importer, synthetic dataset generator, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question ID, accepted evidence IDs, rejected evidence reasons, and repair hint reporting. |
| Shield | Relevant only when rejected evidence and missing gates are explicit. |
| Watch | Relevant through existing replayable question explainability rows and row hashes. |
| Enforce | No runtime RAG, chunking, or embedding policy changed. |
| Vault | No documents, notebooks, media, embeddings, or datasets stored. |
| Fleet | RAG evaluation context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildQuestionExplainabilityReport` behavior with a synthetic AMC-owned RAG chunking context row. The positive path requires question ID, accepted evidence IDs, rejected evidence reasons, repair hint, source refs, row hash, and replayable proof. The negative path proves that custom-rag-evals, ChromaDB, RAG chunking, embedding strategies, synthetic dataset, and notebook metadata fails closed without AMC-owned question evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 18, Fork 3, Issues 0, Pull requests 0, 2 Commits, No releases published, Jupyter Notebook 100.0%, folder names, notebook file names, Applying domain specific evaluations labels, RAG chunking labels, embedding functions labels, ChromaDB labels, Evaluating Chunking Strategies for Retrieval labels, `text-embedding-3-large` labels, Cluster Semantic Chunker labels, 200 token chunk size labels, precision labels, recall labels, intersection over union labels, LLM Chunker labels, Recursive Character Text Splitter labels, custom chunking strategies labels, embedding strategies labels, synthetic dataset labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability. Passing proof requires question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, source refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No custom-rag-evals adapter, notebook importer, RAG chunking evaluator, embedding evaluator, ChromaDB integration, chunking strategy implementation, embedding strategy implementation, synthetic dataset generator, domain-specific document importer, OpenAI model config, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream notebook cells, README prose beyond minimal metadata facts, diagrams, media assets, chunking implementations, embedding configs, ChromaDB examples, synthetic dataset rows, domain-specific documents, evaluation results, prompts, OpenAI model configs, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0898CustomRagEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the question-explainability behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0898CustomRagEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0897IndoxJudgeCalibrationBoundary.test.ts tests/gap0898CustomRagEvalsQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
