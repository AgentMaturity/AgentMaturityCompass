# GAP-0927 - RAG-Framework-Evaluation public-methodology boundary

- Gap: `GAP-0927`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `oztrkoguz/RAG-Framework-Evaluation`, `https://github.com/oztrkoguz/RAG-Framework-Evaluation`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 14, Fork 1, Issues 0, Pull requests 0, 20 Commits, README.md, Apache-2.0 license, the `framework rag result` folder, `document.pdf`, `rag_autogen.py`, `rag_crewai.py`, `rag_langchain.py`, `rag_llamaindex.py`, and `rag_swarm.py`. The page also showed No releases published, Packages 0, No packages published, and Python 100.0%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README title is `RAG-Framework-Evaluation`. It says the project aims to compare different Retrieval-Augmented Generation frameworks using the same document and model, including LlamaIndex, Autogen, Langchain, Swarms, and Crewai, with comparison context around speed, accuracy and performance. The reviewed metadata also included Prompt Template, `gpt-3.5-turbo`, `BAAI/bge-small-en-v1.5`, Chroma, Chunk Size, Chunk Overlap, the `Framework Time Easy Integration` table, Autogen 12.68s, Crewai 17.76s, Langchain 12.18s, Llamaindex 12.44s, Swarms 17.30s, and dependency pins `autogen==1.0.16`, `crewai==0.41.1`, `langchain==0.1.20`, `llama-index==0.10.56`, and `swarms==5.4.0`.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. RAG-Framework-Evaluation is a small RAG framework comparison artifact, not an AMC scoring-methodology specification. RAG framework comparison metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python code, framework result artifacts, PDF content, timing rows beyond minimal metadata facts, prompts, package configs, README prose beyond minimal metadata facts, examples, generated outputs, model responses, dependency files, or implementation details were copied into AMC.

## Relevance decision

`GAP-0927` is relevant only as a public-methodology no-op and source-review boundary. The source is adjacent to Score, Shield, and Watch because it compares RAG frameworks, but its evidence is not an AMC-owned methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; RAG framework timing and dependency metadata is not methodology-versioning proof. |
| Shield | Useful benchmark-adjacent context only; no new Shield methodology claim was added. |
| Watch | No Watch methodology, monitoring, drift, or observability behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No prompts, PDFs, configs, framework outputs, or upstream artifacts stored. |
| Fleet | Framework comparison context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that RAG-Framework-Evaluation metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: RAG-Framework-Evaluation, same document and model comparison, LlamaIndex, Autogen, Langchain, Swarms, Crewai, speed, accuracy and performance, Prompt Template, `gpt-3.5-turbo`, `BAAI/bge-small-en-v1.5`, Chroma, Chunk Size, Chunk Overlap, framework timing rows, and dependency pins are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Apache-2.0 license metadata, Star 14, Fork 1, Issues 0, Pull requests 0, 20 Commits, No releases published, Packages 0, No packages published, Python 100.0%, folder names, file names, PDF presence, RAG framework labels, same-document comparison labels, model labels, embedding labels, vector-store labels, chunking labels, timing table labels, integration labels, package dependency pins, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

RAG framework comparison metadata alone cannot justify a public methodology version bump.

## No-bloat boundary

No RAG-Framework-Evaluation adapter, Autogen runner, Crewai runner, LangChain runner, LlamaIndex runner, Swarms runner, Chroma connector, embedding runner, prompt-template importer, PDF importer, timing benchmark parser, framework-result importer, dependency pin mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, framework result artifacts, PDF content, prompts, package configs, README prose beyond minimal metadata facts, examples, generated outputs, model responses, dependency files, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0927RagFrameworkEvaluationPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0927RagFrameworkEvaluationPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0926OllamaRagChainlitMetricValidityBoundary.test.ts tests/gap0927RagFrameworkEvaluationPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
