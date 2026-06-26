# GAP-0718 - RAG-Driven Generative AI question-explainability boundary

- Gap: `GAP-0718`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Denis2054/RAG-Driven-Generative-AI`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing question-level score explainability receipts; no RAG notebook importer, Packt book adapter, LlamaIndex/Deep Lake/Pinecone wrapper, or source-specific scoring path added.

## Live source metadata

The GitHub connector identifies `Denis2054/RAG-Driven-Generative-AI` as a public repository with repository id `789098173`, default branch `main`, size `331971`, owner `Denis2054`, clone URL `https://github.com/Denis2054/RAG-Driven-Generative-AI.git`, and read-only permissions in this environment. The repository is not archived.

The live `README.md` at `https://github.com/Denis2054/RAG-Driven-Generative-AI/blob/main/README.md`, modified `2025-09-23T15:31:24Z`, identifies the repository as the code repository for `RAG-driven Generative AI, First Edition`, published by Packt and authored by Denis Rothman. Relevant source-review signals include custom RAG pipelines, LlamaIndex, Deep Lake, Pinecone, Chroma, OpenAI, Hugging Face, Jupyter notebooks, Colab/Kaggle execution, adaptive RAG, human feedback, knowledge-graph RAG, multimodal RAG, fine-tuning, video-stock RAG workflows, and continually updated notebooks/changelog references. These facts are RAG evaluation context only. No upstream code, README prose beyond short metadata facts, notebooks, book text, datasets, prompts, images, chapter examples, notebook outputs, tables, dependency pins, API keys, configs, or implementation details were copied into AMC.

## Relevance decision

This repository is relevant to AMC question-level score explainability because RAG evaluation and notebook-driven examples are common sources of maturity claims that need concrete explanation rows: which AMC question moved, which evidence was accepted, what evidence was rejected, what gates remain missing, and what repair hint should be followed.

This does not require a RAG notebook importer, Packt book adapter, LlamaIndex wrapper, Deep Lake wrapper, Pinecone wrapper, Chroma wrapper, Colab/Kaggle runner, or methodology version bump. GAP-0718 is closed by documenting the source boundary and adding regression coverage that RAG-Driven-Generative-AI-style context uses existing AMC question-score explainability receipts. Repository, README, notebook, book, framework, model, or platform metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explanation rows, accepted evidence ids, rejected evidence reasons, and repair hints. |
| Shield | Relevant through fail-closed missing-gate explanations when signed question evidence is absent. |
| Watch | Relevant through question evidence chains that can be monitored as regression evidence. |
| Enforce | No runtime RAG policy, framework policy, notebook policy, or circuit breaker changed. |
| Vault | No notebook data, prompts, book assets, API keys, datasets, or secure-storage behavior changed. |
| Fleet | RAG workflow context only; no multi-agent topology or orchestration changed. |
| Passport | No portable proof bundle, credential, or badge field changed. |
| Comply | Book/repository metadata only; no compliance mapping changed. |

## Product closure

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, notebook importer, RAG pipeline adapter, LlamaIndex/Deep Lake/Pinecone wrapper, Chroma wrapper, Colab/Kaggle runner, book adapter, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0718.

The focused regression exercises the existing question-score explainability engine. The positive path accepts RAG context only when AMC-owned question evidence contains accepted evidence IDs, rejected evidence reasons, repair hints, criteria diagnostics, signed rows, and row hashes. The negative path fails closed when repository/README metadata replaces AMC-owned question evidence.

## Fail-closed rule

Repository identity, repository id, default branch, README title, Packt/book labels, author labels, LlamaIndex labels, Deep Lake labels, Pinecone labels, Chroma labels, OpenAI/Hugging Face labels, Colab/Kaggle labels, notebook filenames, chapter labels, adaptive RAG labels, human-feedback labels, knowledge-graph RAG labels, multimodal RAG labels, fine-tuning labels, video-stock RAG labels, changelog labels, local backlog metadata, or source identity alone must fail closed for question-level score explainability claims. Passing evidence requires AMC-owned question id, accepted evidence ids, rejected evidence reasons, missing gate reasons, repair hints, signed evidence rows, thresholds, replayable row hashes, source refs, and no-copy proof.

## No-bloat boundary

No RAG notebook importer, Packt book adapter, LlamaIndex wrapper, Deep Lake wrapper, Pinecone wrapper, Chroma wrapper, OpenAI notebook runner, Hugging Face notebook runner, Colab runner, Kaggle runner, knowledge-graph RAG adapter, multimodal RAG adapter, fine-tuning notebook adapter, video-stock RAG adapter, chapter parser, book-text importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, notebooks, book text, datasets, prompts, images, chapter examples, notebook outputs, tables, dependency pins, API keys, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0718RagDrivenGenerativeAiQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
