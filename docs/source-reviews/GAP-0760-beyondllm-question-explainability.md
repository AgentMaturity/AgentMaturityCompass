# GAP-0760 - BeyondLLM question-explainability boundary

- Gap: `GAP-0760`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/aiplanethub/beyondllm`, README `https://github.com/aiplanethub/beyondllm/blob/main/README.md`, docs `https://beyondllm.aiplanet.com/`
- Retrieval: `2026-06-21` via GitHub connector default-branch README, license, `pyproject.toml`, and requirements fetches; shell network remains DNS-restricted in this environment.
- Status: closed through existing question-level score explainability receipts; no BeyondLLM dependency, RAG toolkit adapter, Observer integration, notebook importer, or RAG-triad evaluator added.

## Live source metadata

The GitHub connector fetched `aiplanethub/beyondllm` from default branch `main`. The README identifies BeyondLLM as `Build - Rapid Experiment - Evaluate - Observability` and describes an all-in-one toolkit for experimentation, evaluation, and deployment of RAG systems. Relevant source-review signals include custom data sources, document retrieval, LLM response generation, embedding evaluation, LLM response evaluation, Google Colab examples, YouTube RAG examples, default and custom LLMs/embeddings, OpenAI, Google Gemini, LlamaIndex, Python `3.8` through `3.11`, package version `0.2.3`, hallucination-risk reduction, reliability, Hit_rate, MRR, Context relevancy Score, Answer relevancy Score, Groundness score, RAG triad evaluations, Observer, OpenAI latency and cost monitoring, Apache License 2.0, and dependencies such as `llama-index`, `openai`, `google-generativeai`, `pydantic`, `pandas`, and `mistralai`.

These facts are relevant to AMC only as question-level score explainability context. RAG evaluation toolkits can make a maturity score look useful while hiding why a specific L0-L5 question moved, which evidence was accepted, which evidence was rejected, which gates were missing, and which repair would unblock the score. They do not justify adding BeyondLLM, copying notebook examples, integrating its Observer, importing RAG-triad metrics, or changing AMC scoring semantics. No upstream README prose beyond minimal metadata facts, code snippets, command examples, outputs, notebooks, docs, dependency manifests, API keys, prompts, generated answers, screenshots, badges, license text, or implementation details were copied into AMC.

## Relevance decision

GAP-0760 is relevant to AMC through existing question-level score explainability receipts. The accepted AMC primitive is already `buildQuestionExplainabilityReport`: each scored question must expose the question ID, final L0-L5 movement, accepted evidence IDs, rejected evidence reasons, missing gate reasons, repair hints, signed evidence refs, row hashes, source refs, and fail-closed status.

BeyondLLM context sharpens the boundary for RAG evaluation explainability. A source citation can be retained only as context when the AMC question report proves the score movement from AMC-owned evidence. Repository, README, docs, RAG, metric, Observer, Colab, dependency, model-provider, output, or package metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing question-level explainability rows with accepted evidence, rejected reasons, repair hints, and row hashes. |
| Shield | Relevant through fail-closed handling for unsupported RAG metric, hallucination, and reliability claims. |
| Watch | Relevant when question explanations link to observability or drift evidence; no live monitor changed. |
| Enforce | No runtime RAG policy, metric policy, evaluator policy, or circuit-breaker behavior changed. |
| Vault | No API keys, prompts, generated answers, notebooks, datasets, or secure-storage behavior changed. |
| Fleet | RAG toolkit context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or badge credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0760 is closed by documenting the live-source boundary and adding regression coverage over the existing question explainability primitive. The positive path accepts BeyondLLM-style RAG evaluation context only with AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, source refs, and row hashes. The negative path fails closed when GitHub/README/docs/RAG metric metadata replaces AMC-owned question evidence.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, BeyondLLM dependency, RAG toolkit adapter, Observer integration, OpenAI/Gemini/LlamaIndex adapter, Colab/notebook importer, YouTube source importer, RAG-triad evaluator, hallucination scorer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0760.

## Fail-closed rule

Repository identity, repository URL, README URL, docs URL, BeyondLLM labels, Build/Rapid Experiment/Evaluate/Observability labels, RAG labels, custom-data-source labels, retrieval labels, generation labels, embedding-evaluation labels, LLM-response-evaluation labels, Colab labels, YouTube labels, OpenAI labels, Google Gemini labels, LlamaIndex labels, hallucination-risk labels, reliability labels, Hit_rate labels, MRR labels, Context relevancy labels, Answer relevancy labels, Groundness labels, RAG-triad labels, Observer labels, latency/cost labels, package-version labels, dependency labels, Apache License labels, local backlog metadata, or source identity alone must fail closed for question-level explainability claims. Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, missing gate reasons, repair hint, signed rows, thresholds, row hash, source refs, Score/Shield/Watch context, and no-copy proof.

## No-bloat boundary

No BeyondLLM dependency, RAG toolkit adapter, Observer integration, OpenAI/Gemini/LlamaIndex adapter, Colab importer, notebook importer, YouTube source importer, RAG-triad evaluator, embedding evaluator, LLM response evaluator, hallucination scorer, cost/latency monitor, package importer, docs importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code snippets, command examples, outputs, notebooks, docs, dependency manifests, API keys, prompts, generated answers, screenshots, badges, license text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0760BeyondLlmQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
