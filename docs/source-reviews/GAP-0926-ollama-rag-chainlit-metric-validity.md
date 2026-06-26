# GAP-0926 - Ollama RAG Chainlit metric-validity boundary

- Gap: `GAP-0926`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `ohdoking/ollama-with-rag`, `https://github.com/ohdoking/ollama-with-rag`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 5, Issues 0, Pull requests 0, 33 Commits, README.md, MIT license, files `.env`, `.gitignore`, `LICENSE`, `README.md`, `bot.py`, `chainlit.md`, `load_data_vdb.py`, `requirements-extended.txt`, and `requirements.txt`, No releases published, Packages 0, and Python 100.0%.
- Status: Done

## Live source metadata

The live README title is `Ollama with RAG and Chainlit`. It describes a chatbot project that uses Ollama locally, RAG (Retrieval-Augmented Generation), and Chainlit for a UI chatbot. Relevant source-review signals include Chromadb as a Vectorstore, gpt4all for text embeddings, langchain for LLM application development, Chainlit as a ChatGPT-like interface, Install Ollama prerequisite, `pip install -r requirements.txt`, `mkdir data`, `mkdir vectorstores/db`, `python3 load_data_vdb.py`, `chainlit run bot.py -w`, local data loading into a VectorStore, and the repository About text stating that it includes a fine-tuning and evaluation module for language models.

Those facts are relevant to AMC only as metric-validity context for local RAG chatbot evaluations. They do not allow AMC to claim Ollama compatibility, run Chainlit, import ChromaDB, compute upstream retrieval metrics, copy embeddings, or add an evaluator. For Score, Shield, and Watch, the relevant AMC requirement remains a validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

No upstream Python source, `.env` content, Chainlit UI content, vectorstore data, embedding data, chatbot prompts, README prose beyond minimal metadata facts, package files, dependency lists, data directories, vectorstore directories, command snippets beyond minimal metadata facts, evaluation module code, fine-tuning code, result rows, outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0926` is relevant to AMC as a metric-validity and reliability boundary. RAG chatbots can expose answer-quality and retrieval-quality claims, but AMC should only score those claims when existing metric-validation receipts prove the metric is valid, reliable, and tied to signed evidence.

The closure uses existing AMC metric-validity primitives only. It does not add an Ollama adapter, Chainlit integration, ChromaDB connector, gpt4all embedding runner, LangChain pipeline, data loader, vectorstore loader, fine-tuning module, evaluation runner, Python dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, or source-specific scoring path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing validation table, construct-validity, confidence interval, sample size, reliability, and outcome-alignment evidence. |
| Shield | Relevant only when signed evidence proves chatbot metric reliability and regression thresholds. |
| Watch | Relevant through existing CI/Watch fail-closed gates for metric validity. |
| Enforce | No runtime RAG or chatbot policy changed. |
| Vault | No `.env`, documents, embeddings, vectorstores, prompts, model files, or upstream artifacts stored. |
| Fleet | No agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `buildMetricValidationReport` behavior with a synthetic AMC-owned Ollama-RAG-style validation packet. The positive path requires question scores, validation facets, process evidence, outcome alignment, signed evidence refs, source refs, row hashes, confidence interval, inter-rater agreement, replayable eval pack, and CI pass. The negative path proves that GitHub, README, Ollama locally, RAG (Retrieval-Augmented Generation), Chainlit, Chromadb, Vectorstore, gpt4all, text embeddings, langchain, ChatGPT-like interface, Install Ollama, `pip install -r requirements.txt`, `mkdir data`, `mkdir vectorstores/db`, `python3 load_data_vdb.py`, `chainlit run bot.py -w`, fine-tuning and evaluation module labels, package metadata, and source identity alone fail closed without AMC-owned metric-validity proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 14, Fork 5, Issues 0, Pull requests 0, 33 Commits, Python 100.0%, file names, Ollama locally labels, RAG (Retrieval-Augmented Generation) labels, Chainlit labels, Chromadb labels, Vectorstore labels, gpt4all labels, text embeddings labels, langchain labels, ChatGPT-like interface labels, Install Ollama labels, `pip install -r requirements.txt` labels, `mkdir data` labels, `mkdir vectorstores/db` labels, `python3 load_data_vdb.py` labels, `chainlit run bot.py -w` labels, fine-tuning and evaluation module labels, local backlog metadata, or source identity alone must fail closed for metric validity. Passing metric-validity proof requires validation table, confidence interval, sample size, metric owner, construct-validity coverage, reliability checks, outcome alignment, regression thresholds, signed evidence refs, source refs, row hashes, and CI gate proof.

## No-bloat boundary

No Ollama adapter, Chainlit integration, ChromaDB connector, gpt4all embedding runner, LangChain pipeline, data loader, vectorstore loader, chatbot UI, fine-tuning module, evaluation runner, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, `.env` content, Chainlit UI content, vectorstore data, embedding data, chatbot prompts, README prose beyond minimal metadata facts, package files, dependency lists, data directories, vectorstore directories, command snippets beyond minimal metadata facts, evaluation module code, fine-tuning code, result rows, outputs, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0926OllamaRagChainlitMetricValidityBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the metric-validity behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0926OllamaRagChainlitMetricValidityBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0925BiliCorePublicMethodologyBoundary.test.ts tests/gap0926OllamaRagChainlitMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
