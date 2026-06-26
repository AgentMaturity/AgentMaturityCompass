# GAP-0810 - More-agents replay-corpus boundary

- Gap: `GAP-0810`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.05670`, `https://openalex.org/W7163778003`
- Retrieval: `2026-06-21` via live arXiv/search and header checks. arXiv and OpenAlex headers returned HTTP 200; live search surfaced arXiv metadata and abstract summary.
- Status: closed through existing eval replay corpus receipts; no BenchAgent importer, multi-agent workflow runner, benchmark loader, or source-specific replay path added.

## Live source metadata

The reachable arXiv source identifies `Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows`, first submitted `Thu Jun  4 03:50:47 2026`, with authors Yuhang Fu, Ruishan Fang, Jiaqi Shao, Huiyu Zheng, Zhengtao Zhu, Bing Luo, and Tao Lin. The local backlog maps this replay-corpus slice to OpenAlex work `W7163778003`.

Relevant source-review signals include BenchAgent, shared benchmark loader, tool access, answer contract, usage accounting, trajectory logging, ten reasoning, coding, and tool-use benchmarks, GPT-4.1, Protocol-Aligned External reporting, at most one of six tested MAS exceeding the matched single-agent anchor, the remaining five trailing by 2.56-11.29 points, 66.72% overall, 69.23% on Level 3, and Wilson 95% binomial confidence interval guidance. These are replay-corpus context only. No upstream benchmark rows, loaders, tools, answer contracts, trajectories, cost rows, GAIA snapshots, prompts, code, tables, figures, model outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because protocol-aligned agent workflow comparison is directly tied to whether Score/Shield/Watch claims can be rerun under controlled conditions. The right AMC mapping is the existing replay-corpus evidence primitive: replay manifest, fixture hash, fixed seed, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, source refs, row hashes, and Score/Shield/Watch surface coverage.

It does not justify importing BenchAgent, normalizing to the paper's exact protocol, copying benchmark data, recreating workflow variants, adding a multi-agent workflow simulator, changing public methodology, or adding API/CLI/Studio behavior. GAP-0810 is closed by documenting the source boundary and adding regression coverage that protocol-aligned multi-agent context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. arXiv, OpenAlex, title, author list, BenchAgent label, benchmark count, score headline, or workflow-lift metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, source refs, signed row evidence, and score deltas. |
| Shield | Relevant through fail-closed replay evidence before multi-agent workflow claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for protocol-aligned evaluation canaries. |
| Enforce | No runtime workflow policy, tool-access policy, or circuit breaker changed. |
| Vault | No benchmark rows, loaders, tool definitions, prompts, trajectories, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology, MAS runner, or workflow simulator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Evaluation-protocol context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, BenchAgent integration, benchmark loader, multi-agent workflow runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0810.

The focused regression exercises the existing eval replay corpus engine with AMC-owned protocol-aligned fixture data. The positive path requires a replay manifest, fixture hash, fixed seed, source refs, baseline/candidate score delta, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when arXiv/OpenAlex/title/BenchAgent/workflow metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv URL, OpenAlex id, author list, submission date, BenchAgent label, benchmark loader label, tool access label, answer contract label, usage accounting label, trajectory logging label, benchmark-count label, GPT-4.1 label, Protocol-Aligned External label, MAS comparison label, 2.56-11.29 points label, 66.72% overall label, 69.23% on Level 3 label, Wilson 95% binomial confidence interval label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No BenchAgent importer, benchmark loader, tool-access adapter, answer-contract adapter, trajectory logger, usage-accounting adapter, GAIA snapshot importer, MAS simulator, workflow runner, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific replay path, or source-specific scoring path was added. No upstream benchmark rows, loaders, tools, answer contracts, trajectories, cost rows, GAIA snapshots, prompts, code, tables, figures, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0810MoreAgentsReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
