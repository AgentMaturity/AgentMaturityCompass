# GAP-0786 - Rageval public-methodology boundary

- Gap: `GAP-0786`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/gomate-community/rageval`
- Retrieval: `2026-06-21` via GitHub connector fetches for `README.md`, `LICENSE`, `setup.py`, and `pyproject.toml`.
- Status: skipped as AMC public-methodology evidence; no methodology version bump or product code change.

## Live source metadata

The live README identifies Rageval as `Evaluation tools for Retrieval-augmented Generation (RAG) methods`. The repository includes an Apache License 2.0 license file. The package metadata identifies the project as `RagEval`, version `0.1.0`, Python-oriented, with dependencies around OpenAI, datasets, LangChain, transformers, torch, pandas, NLTK, spaCy, rouge_score, sacrebleu, and related evaluation tooling.

The README describes six sub-tasks: query rewriting, document ranking, information compression, evidence verify, answer generating, and result validating. Relevant source-review signals include answer correctness, answer groundedness, Answer F1, NLI/claim recall, Exact Match, Bleu, TER, chrF, citation precision, citation recall, context recall, OpenAI or vLLM evaluator setup, and ASQA and ALCE benchmark examples. These facts identify RAG-evaluation and benchmark context only. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, benchmark tables, metric values, dataset rows, raw results, prompts, screenshots, package files, or implementation details were copied into AMC.

## Relevance decision

Rageval is relevant to AMC as external RAG-evaluation context: it emphasizes metric families, evaluator setup, benchmark scripts, and reproducible RAG evaluation claims. That context reinforces AMC's evidence-first posture for Score, Shield, and Watch.

Rageval is not an AMC public methodology versioning source. The live repository does not define AMC scoring methodology ids, L0-L5 threshold semantics, badge comparability rules, public methodology hashes, changelog rows, deprecation notice, migration guidance, report binding, or AMC diagnostic question-bank changes. Rageval repository metadata and README evaluation claims alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | RAG-evaluation context only; no accepted public scoring-methodology proof. |
| Shield | Evaluation-caveat context only; no Shield assurance threshold changed. |
| Watch | Benchmark/replay context only; no Watch methodology or alert semantics changed. |
| Enforce | No runtime RAG policy, evaluator policy, or enforcement behavior changed. |
| Vault | No API keys, retrieval corpora, benchmark rows, prompts, or secure-storage behavior changed. |
| Fleet | RAG pipeline context only; no retrieval agent or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No RAG, dataset, privacy, or audit-control mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0786. No public methodology version bump was made.

The closure is a documented no-op: RAG-evaluation context only, no public methodology version change. Public methodology versioning, changelog, deprecation notice, and migration guidance remain AMC-owned artifacts and must not be sourced from a third-party RAG evaluation repo.

## Fail-closed rule

Rageval repository identity, repository URL, README labels, RAG labels, six-sub-task labels, query-rewriting labels, document-ranking labels, information-compression labels, evidence-verify labels, answer-generating labels, result-validating labels, answer-correctness labels, answer-groundedness labels, citation-precision labels, citation-recall labels, context-recall labels, evaluator-LLM setup labels, OpenAI/vLLM labels, ASQA/ALCE benchmark labels, Apache License 2.0 label, package metadata, dependency lists, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No Rageval adapter, RAG evaluator runner, query-rewriting evaluator, document-ranking evaluator, information-compression evaluator, evidence-verify evaluator, answer-generation evaluator, result-validation evaluator, OpenAI/vLLM evaluator integration, ASQA/ALCE importer, benchmark mirror, Hugging Face dataset mirror, GitHub importer, source-specific methodology lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, install commands, API-key examples, benchmark tables, metric values, dataset rows, raw results, prompts, screenshots, package files, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0786RagevalPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
