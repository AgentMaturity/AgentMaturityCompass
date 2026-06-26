# GAP-0811 - More-agents DOI replay-corpus boundary

- Gap: `GAP-0811`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.05670`, DOI `10.48550/arxiv.2606.05670`, `https://openalex.org/W7163668543`
- Retrieval: `2026-06-21` via live DOI/arXiv/OpenAlex header checks. DOI returned HTTP 302 to `https://arxiv.org/abs/2606.05670`; arXiv returned HTTP 200 headers; OpenAlex API HEAD returned HTTP 200.
- Status: closed through existing eval replay corpus receipts; no duplicate BenchAgent importer, multi-agent workflow runner, benchmark loader, or source-specific replay path added.

## Live source metadata

This is the same live source reviewed for GAP-0810, but GAP-0811 maps the DOI alias and a second OpenAlex work id to the same replay-corpus dimension.

The reachable arXiv source identifies `Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows`, first submitted `Thu Jun  4 03:50:47 2026`. The local backlog maps this DOI replay-corpus slice to OpenAlex work `W7163668543`.

Relevant source-review signals remain BenchAgent, shared benchmark loader, tool access, answer contract, usage accounting, trajectory logging, ten reasoning/coding/tool-use benchmark context, GPT-4.1, Protocol-Aligned External reporting, and Wilson 95% binomial confidence interval guidance. These are replay-corpus context only. No upstream benchmark rows, loaders, tools, answer contracts, trajectories, cost rows, GAIA snapshots, prompts, code, tables, figures, model outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context for the same reason documented in GAP-0810: protocol-aligned agent workflow comparison strengthens the need for replayable Score/Shield/Watch evidence. The correct AMC mapping is still the existing replay-corpus evidence primitive: replay manifest, fixture hash, fixed seed, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, source refs, row hashes, and Score/Shield/Watch surface coverage.

The DOI alias and alternate OpenAlex id do not justify a second product implementation, source-specific replay system, benchmark loader, workflow simulator, methodology change, or API/CLI/Studio behavior. GAP-0811 is closed by documenting the duplicate-source boundary and adding regression coverage that DOI/OpenAlex aliases still require AMC-owned replay evidence. DOI, arXiv, OpenAlex, title, BenchAgent label, Protocol-Aligned External label, trajectory logging label, or Wilson confidence-interval label alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, source refs, signed row evidence, and score deltas. |
| Shield | Relevant through fail-closed replay evidence before DOI-linked multi-agent workflow claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for protocol-aligned evaluation canaries. |
| Enforce | No runtime workflow policy, tool-access policy, or circuit breaker changed. |
| Vault | No benchmark rows, loaders, tool definitions, prompts, trajectories, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology, MAS runner, or workflow simulator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Evaluation-protocol context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, BenchAgent integration, benchmark loader, multi-agent workflow runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0811.

The focused regression exercises the existing eval replay corpus engine with AMC-owned DOI-linked protocol fixture data. The positive path requires a replay manifest, fixture hash, fixed seed, source refs, baseline/candidate score delta, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when DOI/OpenAlex/title/BenchAgent/workflow metadata replaces AMC-owned replay evidence.

## Fail-closed rule

DOI, arXiv URL, OpenAlex id, paper title, submission date, BenchAgent label, benchmark loader label, tool access label, answer contract label, usage accounting label, trajectory logging label, Protocol-Aligned External label, Wilson 95% binomial confidence interval label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No BenchAgent importer, benchmark loader, tool-access adapter, answer-contract adapter, trajectory logger, usage-accounting adapter, GAIA snapshot importer, MAS simulator, workflow runner, DOI importer, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific replay path, or source-specific scoring path was added. No upstream benchmark rows, loaders, tools, answer contracts, trajectories, cost rows, GAIA snapshots, prompts, code, tables, figures, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0811MoreAgentsDoiReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
