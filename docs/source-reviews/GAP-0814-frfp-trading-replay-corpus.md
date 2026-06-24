# GAP-0814 - FRFP trading replay-corpus boundary

- Gap: `GAP-0814`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20481444`, Zenodo record `20481444`, `https://openalex.org/W7162953700`
- Retrieval: `2026-06-21` via live header checks and search. The DOI, Zenodo record, item link, API description link, license link, and OpenAlex API endpoint were source header verified.
- Status: closed through existing eval replay corpus receipts; no FRFP importer, trading simulator, Lean formalization subsystem, shared-window evaluator, or source-specific replay path added.

## Live source metadata

The local backlog names the source as `FRFP Governance Improves LLM Trading Agents: A Lean-Formalized, Shared-Window Evaluation` and maps it to OpenAlex work `W7162953700`. The backlog summary describes an FRFP-based Human-AI protocol affecting a multi-agent trading workflow under matched infrastructure and scoring.

Live retrieval did not rely only on local metadata. `curl -I --max-time 12 https://doi.org/10.5281/zenodo.20481444` returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20481444`. `curl -I --max-time 12 https://zenodo.org/records/20481444` returned `HTTP/1.1 200 OK`, described-by links for `https://zenodo.org/api/records/20481444`, a license link to `creativecommons.org/licenses/by/4.0`, and an item link for `frfp_trading_paper.pdf`. `curl -I --max-time 12 https://api.openalex.org/works/W7162953700` showed that the OpenAlex API HEAD returned HTTP 200 with JSON content headers.

Relevant source-review signals include FRFP-based Human-AI protocol, multi-agent trading workflow, matched infrastructure and scoring, shared-window evaluation, Lean-Formalized governance context, protocol, baseline, bounded function, workflow, and inference concepts. These are replay-corpus context only. No upstream PDF body, trading traces, Lean proof artifacts, shared-window data, prompts, tools, benchmark rows, scoring tables, code, model outputs, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because a governed multi-agent trading workflow is a high-stakes agent-evaluation setting where auditors would need replayable evidence before trusting Score/Shield/Watch claims. The correct AMC mapping is the existing replay-corpus evidence primitive: replay manifest, fixture hash, fixed seed, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, source refs, row hashes, and Score/Shield/Watch surface coverage.

It does not justify importing FRFP artifacts, adding a trading simulator, copying a Lean formalization, mirroring shared-window data, adding a financial benchmark runner, changing public methodology, or adding API/CLI/Studio behavior. GAP-0814 is closed by documenting the source boundary and adding regression coverage that trading-governance context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. DOI, Zenodo, OpenAlex, title, FRFP label, Lean-Formalized label, shared-window label, or trading-agent metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, source refs, signed row evidence, and score deltas. |
| Shield | Relevant through fail-closed replay evidence before trading-agent governance claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for high-stakes agent evaluation canaries. |
| Enforce | No runtime trading policy, financial policy, tool-access policy, or circuit breaker changed. |
| Vault | No trading traces, Lean proof artifacts, prompts, tools, datasets, or secure-storage behavior changed. |
| Fleet | Multi-agent trading context only; no orchestration topology, trading simulator, or shared-window evaluator added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Governance context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, FRFP integration, trading simulator, Lean formalization subsystem, shared-window evaluator, financial benchmark runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0814.

The focused regression exercises the existing eval replay corpus engine with AMC-owned trading-governance fixture data. The positive path requires a replay manifest, fixture hash, fixed seed, source refs, baseline/candidate score delta, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when DOI/Zenodo/OpenAlex/title/FRFP/trading metadata replaces AMC-owned replay evidence.

## Fail-closed rule

DOI, Zenodo record, Zenodo API link, PDF item link, license link, OpenAlex id, paper title, FRFP-based Human-AI protocol label, multi-agent trading workflow label, matched infrastructure and scoring label, shared-window evaluation label, Lean-Formalized label, protocol label, baseline label, bounded function label, workflow label, inference label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No FRFP importer, trading simulator, Lean formalization subsystem, shared-window evaluator, PDF importer, Zenodo importer, OpenAlex importer, paper importer, dataset mirror, benchmark mirror, financial benchmark runner, trading trace importer, prompt importer, tool adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific replay path, or source-specific scoring path was added. No upstream PDF body, trading traces, Lean proof artifacts, shared-window data, prompts, tools, benchmark rows, scoring tables, code, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0814FrfpTradingReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
