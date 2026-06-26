# GAP-0784 - TiMem replay-corpus boundary

- Gap: `GAP-0784`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2601.02845`, `https://doi.org/10.48550/arXiv.2601.02845`, `https://openalex.org/W7118272298`
- Retrieval: `2026-06-21` via browser. The arXiv page was reachable; OpenAlex/DOI identifiers were used only as source references.
- Status: closed through existing eval replay corpus receipts; no TiMem memory system, benchmark dataset, or source-specific replay runner added.

## Live source metadata

The reachable arXiv page identifies arXiv `2601.02845`, submitted `2026-01-06` and last revised `2026-04-30`, with the title `TiMem: Temporal-Hierarchical Memory Consolidation for Long-Horizon Conversational Agents`, authors including Kai Li and Xuanqing Yu, and DOI `10.48550/arXiv.2601.02845`. The paper metadata identifies an ACL 2026 Findings context.

The source describes long-horizon conversational-agent memory evaluation. Relevant source-review signals include Temporal Memory Tree, semantic-guided consolidation, complexity-aware memory recall, LoCoMo and LongMemEval-S benchmark context, and reported scores including `75.30%`, `76.88%`, and `52.20%`. These facts are replay-corpus context only. No upstream paper prose beyond short metadata facts, TiMem model details, memory trees, benchmark rows, conversation logs, datasets, prompts, rubrics, figures, tables, statistics, model outputs, code, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because long-horizon conversational memory is an agent-evaluation setting where auditors would need a versioned replay manifest, fixed seed, fixture hash, baseline/candidate score deltas, source refs, signed evidence refs, and CI receipts before trusting Score/Shield/Watch claims.

It does not justify importing the paper, mirroring LoCoMo or LongMemEval-S, reproducing TiMem, adding a temporal memory tree, adding a memory-consolidation subsystem, or changing public methodology. GAP-0784 is closed by documenting the source boundary and adding regression coverage that TiMem-style memory context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. arXiv, DOI, OpenAlex, title, benchmark names, reported percentages, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external claims about memory-agent evaluation are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Enforce | No runtime memory policy, consolidation policy, or circuit breaker changed. |
| Vault | No conversation logs, memory stores, benchmark datasets, prompts, or secure storage changed. |
| Fleet | Long-horizon conversational-agent context only; no orchestration topology or memory subsystem added. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, TiMem implementation, temporal-memory-tree builder, memory-consolidation runner, LoCoMo importer, LongMemEval-S importer, benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0784.

The focused regression exercises the existing eval replay corpus engine with long-horizon memory fixture data owned by AMC. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, and CI-ready receipts. The negative path fails closed when arXiv/DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv id, arXiv DOI, OpenAlex id, author list, submission date, revision date, ACL 2026 Findings label, Temporal Memory Tree labels, semantic-guided consolidation labels, complexity-aware memory recall labels, LoCoMo labels, LongMemEval-S labels, reported percentage labels, long-horizon conversation labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No TiMem implementation, temporal-memory-tree builder, memory-consolidation subsystem, complexity-aware recall module, LoCoMo importer, LongMemEval-S importer, conversation-log loader, prompt importer, paper importer, OpenAlex importer, DOI resolver, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, TiMem model details, memory trees, benchmark rows, conversation logs, datasets, prompts, rubrics, figures, tables, statistics, model outputs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0784TimemReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
