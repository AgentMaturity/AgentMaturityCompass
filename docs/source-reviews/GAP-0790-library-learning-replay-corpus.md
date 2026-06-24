# GAP-0790 - Library learning replay-corpus boundary

- Gap: `GAP-0790`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: ACL Anthology `https://aclanthology.org/2026.eacl-long.163/`, DOI `https://doi.org/10.18653/v1/2026.eacl-long.163`, OpenAlex `https://openalex.org/W7140121850`
- Retrieval: `2026-06-21` via live ACL Anthology page review.
- Status: closed through existing eval replay corpus receipts; no library-learning evaluator, compute-budget benchmark, or source-specific replay runner added.

## Live source metadata

The live ACL Anthology page identifies the source as `Is This LLM Library Learning? Evaluation Must Account For Compute and Behaviour`, Anthology ID `2026.eacl-long.163`, DOI `10.18653/v1/2026.eacl-long.163`, in EACL 2026, March 2026, Rabat, Morocco, published by the Association for Computational Linguistics, pages 3534-3568. Listed authors are Ian Berlot-Attwell, Tobias Sesterhenn, Frank Rudzicz, and Xujie Si.

Relevant source-review signals include in-context learning, library learning, reusable functions/tools/lemmas, computational cost, equal computational budget, behavioural analysis, comparisons against task accuracy, and a LEGO-Prover case. These facts are replay-corpus context only. No upstream paper prose beyond short metadata facts, code libraries, proof tasks, benchmark rows, compute traces, behaviour traces, datasets, prompts, figures, tables, statistics, model outputs, code, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because agent evaluation can look better when compute and behavior are ignored. Auditors need a versioned replay manifest, fixed seed, fixture hash, baseline/candidate score deltas, source refs, signed evidence refs, CI receipts, and compute-budget comparability before trusting Score/Shield/Watch claims.

It does not justify importing the paper, mirroring LEGO-Prover, reproducing library-learning systems, adding a compute-budget evaluator, adding a behavior-analysis subsystem, or changing public methodology. GAP-0790 is closed by documenting the source boundary and adding regression coverage that library-learning context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. ACL/DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external claims about library-learning evaluation are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Enforce | No runtime compute-budget policy, library-learning policy, or circuit breaker changed. |
| Vault | No proof tasks, code libraries, prompts, traces, datasets, or secure storage changed. |
| Fleet | Agent-evaluation context only; no orchestration topology or library-learning runtime added. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, library-learning evaluator, compute-budget benchmark, behavior-analysis subsystem, LEGO-Prover importer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0790.

The focused regression exercises the existing eval replay corpus engine with library-learning-style fixture data owned by AMC. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, and CI-ready receipts. The negative path fails closed when ACL/DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

ACL URL, DOI, OpenAlex work ID, title, author list, venue metadata, page metadata, in-context-learning labels, library-learning labels, computational-cost labels, equal-computational-budget labels, behavioural-analysis labels, LEGO-Prover labels, reusable-function/tool/lemma labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, compute-budget comparability, and no-copy proof.

## No-bloat boundary

No library-learning evaluator, compute-budget benchmark, behavior-analysis subsystem, LEGO-Prover importer, proof-task loader, code-library importer, prompt importer, paper importer, OpenAlex importer, DOI resolver, ACL importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, code libraries, proof tasks, benchmark rows, compute traces, behaviour traces, datasets, prompts, figures, tables, statistics, model outputs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0790LibraryLearningReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
