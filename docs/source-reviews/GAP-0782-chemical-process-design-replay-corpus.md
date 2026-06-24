# GAP-0782 - Chemical process design replay-corpus boundary

- Gap: `GAP-0782`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2601.06776`, `https://doi.org/10.48550/arXiv.2601.06776`, `https://openalex.org/W7123693393`
- Retrieval: `2026-06-21` via browser. The arXiv page was reachable; OpenAlex/DOI identifiers were used only as source references.
- Status: closed through existing eval replay corpus receipts; no chemical-process simulator, process-design dataset, or source-specific benchmark added.

## Live source metadata

The reachable arXiv page identifies arXiv `2601.06776`, submitted `2026-01-11`, with the title `From Text to Simulation: A Multi-Agent LLM Workflow for Automated Chemical Process Design`, authors Xufei Tian, Wenli Du, and Ke Ye, and DOI `10.48550/arXiv.2601.06776`.

The paper metadata describes automated chemical process design using a multi-agent LLM workflow. Relevant source-review signals include four specialized agents, Enhanced Monte Carlo Tree Search, a Simona dataset/benchmark context, a reported `31.1% improvement`, a reported `89.0% compared to expert manual design` design-time reduction, simulation-specific evaluation, and chemical engineering process-design context. These facts are replay-corpus context only. No upstream paper prose beyond short metadata facts, Simona rows, simulation configs, chemical flowsheets, process designs, prompts, datasets, rubrics, figures, tables, statistics, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because automated chemical process design is a multi-step agent-evaluation setting where auditors would need a versioned replay manifest, fixed seed, fixture hash, baseline/candidate score deltas, source refs, signed evidence refs, and CI receipts before trusting Score/Shield/Watch claims.

It does not justify importing the paper, mirroring Simona, reproducing chemical-process simulations, adding a process-design simulator, adding an Enhanced Monte Carlo Tree Search implementation, or changing public methodology. GAP-0782 is closed by documenting the source boundary and adding regression coverage that chemical-process-design context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. arXiv, DOI, OpenAlex, title, reported improvement, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external claims about process-design agent evaluation are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Enforce | No runtime process-design policy, simulation policy, or circuit breaker changed. |
| Vault | No Simona data, flowsheets, prompts, simulation configs, or secure storage changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology or simulator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Chemical engineering context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, process-design simulator, simulation runner, Simona importer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0782.

The focused regression exercises the existing eval replay corpus engine with chemical-process-design-style fixture data owned by AMC. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, and CI-ready receipts. The negative path fails closed when arXiv/DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv id, arXiv DOI, OpenAlex id, author list, submission date, subject category, four-agent labels, Enhanced Monte Carlo Tree Search labels, Simona labels, reported improvement labels, design-time reduction labels, simulation labels, process-design labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No chemical-process benchmark, process-design simulator, chemical engineering workflow, Enhanced Monte Carlo Tree Search implementation, Simona importer, flowsheet importer, process-simulation adapter, prompt importer, paper importer, OpenAlex importer, DOI resolver, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, Simona rows, simulation configs, chemical flowsheets, process designs, prompts, datasets, rubrics, figures, tables, statistics, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0782ChemicalProcessDesignReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
