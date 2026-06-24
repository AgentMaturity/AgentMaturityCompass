# GAP-0704 - RAG review replay-corpus unavailable-source boundary

- Gap: `GAP-0704`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7118002871`, DOI `10.62411/faith.3048-3719-297`, and title `A Review on Retrieval-Augmented Generation: Architectures, Research Challenges, and Emerging Frontiers`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no RAG review corpus, dataset, or architecture importer added.

## Live source metadata

The local backlog identifies a paper titled `A Review on Retrieval-Augmented Generation: Architectures, Research Challenges, and Emerging Frontiers`, DOI `10.62411/faith.3048-3719-297`, OpenAlex work `W7118002871`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including interpretability, modular design, robustness, data science, context, artificial intelligence, and language model. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, dataset, or benchmark claim. RAG review context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, RAG architecture taxonomy, challenge list, frontier list, datasets, examples, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0704 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The RAG review theme maps to existing eval replay corpus receipts only as context; it does not justify a RAG architecture importer, benchmark dataset, source-specific evaluator, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this paper can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers rejected or risky RAG behavior with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime RAG policy, retrieval guardrail, or enforcement behavior changed. |
| Vault | No retrieval corpora, document chunks, embeddings, prompts, outputs, datasets, or secure-storage behavior changed. |
| Fleet | RAG architecture context only; no retrieval agent workflow or orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No RAG, data-governance, privacy, or audit-control mapping changed. |

## Product closure

GAP-0704 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that RAG review context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, RAG architecture importer, retrieval dataset importer, benchmark dataset, paper parser, or scoring behavior changed for GAP-0704.

## Fail-closed rule

OpenAlex work ID, DOI, title, RAG labels, architecture labels, research-challenge labels, frontier labels, interpretability labels, modular-design labels, robustness labels, data-science labels, context labels, language-model labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No RAG review corpus, retrieval dataset, architecture importer, challenge taxonomy importer, frontier catalog, embedding store, document chunker, retriever adapter, generation evaluator, paper parser, OpenAlex importer, benchmark dataset, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, RAG architecture taxonomy, challenge list, frontier list, datasets, examples, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0704RagReviewReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
