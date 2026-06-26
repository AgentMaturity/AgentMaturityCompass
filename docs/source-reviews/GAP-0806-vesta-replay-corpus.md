# GAP-0806 - VESTA replay-corpus boundary

- Gap: `GAP-0806`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2606.08531`, `https://openalex.org/W7164234055`
- Retrieval: `2026-06-21` via browser/search checks. The arXiv page was reachable; OpenAlex was retained as a source reference.
- Status: closed through existing eval replay corpus receipts; no VESTA scenario generator, safety evaluation framework, scenario dataset, or source-specific benchmark added.

## Live source metadata

The reachable arXiv page identifies `VESTA: A Fully Automated Scenario Generation and Safety Evaluation Framework for LLM Agents`, first submitted `Sun Jun 7 09:23:38 2026`, with authors Lu Jia, Haibo Tong, Feifei Zhao, Jindong Li, Dongqi Liang, Ping Wu, Qian Zhang, and Yi Zeng. The local backlog maps the source to OpenAlex work `W7164234055`.

Relevant source-review signals include five risk dimensions, 1,072 measurable evaluation scenarios, 12 LLM agents, two authority contexts, an average ASR of 47.1%, and process-level evaluation for LLM agents. These facts are replay-corpus context only. No upstream paper prose beyond short metadata facts, generated scenarios, prompts, authority-context data, risk labels, agent outputs, evaluation scripts, figures, tables, statistics, model outputs, code, or benchmark rows were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because automated safety scenario generation is an agent-evaluation setting where auditors would need a replay manifest, fixture hash, fixed seed, baseline/candidate score delta, source refs, signed evidence refs, and CI receipt before trusting Score/Shield/Watch claims.

It does not justify importing VESTA, mirroring generated scenarios, copying risk dimensions, recreating authority-context tests, adding a safety benchmark runner, or changing public methodology. GAP-0806 is closed by documenting the source boundary and adding regression coverage that VESTA-style safety context uses the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path. arXiv, OpenAlex, title, scenario counts, ASR labels, or abstract metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external safety-evaluation claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for safety canaries. |
| Enforce | No runtime safety policy, authority policy, or circuit breaker changed. |
| Vault | No prompts, generated scenarios, risk labels, authority-context traces, or secure-storage behavior changed. |
| Fleet | Multi-agent safety context only; no orchestration topology or scenario-generation framework added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Safety evaluation context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, VESTA scenario generator, safety evaluation framework, risk-dimension catalog, authority-context runner, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0806.

The focused regression exercises the existing eval replay corpus engine with safety-evaluation-style fixture data owned by AMC. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when arXiv/OpenAlex/title/VESTA metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Paper title, arXiv URL, OpenAlex id, author list, submission date, five-risk-dimensions label, 1,072-scenario label, 12-agent label, two-authority-context label, ASR label, process-level evaluation label, LLM-agent safety labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No VESTA benchmark, scenario generator, safety evaluation framework, risk-dimension catalog, authority-context runner, scenario importer, prompt importer, output importer, process-level evaluator, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond short metadata facts, generated scenarios, prompts, authority-context data, risk labels, agent outputs, evaluation scripts, figures, tables, statistics, model outputs, code, or benchmark rows were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0806VestaReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
