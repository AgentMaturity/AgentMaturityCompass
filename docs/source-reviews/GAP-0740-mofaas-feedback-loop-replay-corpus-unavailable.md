# GAP-0740 - MoFaaS feedback loop replay-corpus unavailable-source boundary

- Gap: `GAP-0740`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7134928679`, DOI `10.5281/zenodo.18957245`, and title `MoFaaS LLM Feedback Loop`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, Zenodo publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no MoFaaS service, FaaS code transformer, container workflow, or feedback-loop subsystem added.

## Live source metadata

The local backlog identifies `MoFaaS LLM Feedback Loop`, DOI `10.5281/zenodo.18957245`, OpenAlex work `W7134928679`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including computer science, container, operating system, service, code, database, and chart. The backlog abstract snippet says the repository/service transforms code from one version to another version of the same FaaS function. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Zenodo publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, service, dataset, or benchmark claim. MoFaaS/FaaS transformation context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof. No upstream repository prose, abstract text beyond local backlog metadata, service code, function versions, containers, workflows, charts, database schemas, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0740 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The MoFaaS feedback-loop theme maps to existing eval replay corpus receipts only as context; it does not justify a FaaS transformation service, code migration runner, container benchmark pack, feedback-loop engine, source-specific evaluator, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this artifact can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only artifact identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers code-transformation safety with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime code transformation, container, FaaS, or policy-enforcement behavior changed. |
| Vault | No function code, container records, database state, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Feedback-loop service context only; no orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Software artifact context only; no compliance mapping changed. |

## Product closure

GAP-0740 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that MoFaaS-style feedback-loop context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, MoFaaS service, FaaS function transformer, code migration runner, container workflow, feedback-loop engine, Zenodo importer, OpenAlex importer, artifact parser, or scoring behavior changed for GAP-0740.

## Fail-closed rule

OpenAlex work ID, DOI, title, MoFaaS labels, LLM feedback-loop labels, FaaS labels, code-transformation labels, container labels, service labels, operating-system labels, database labels, chart labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No MoFaaS service, FaaS function transformer, code migration runner, container workflow, feedback-loop engine, service benchmark pack, database workflow, chart parser, Zenodo importer, OpenAlex importer, artifact parser, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream repository prose, abstract text beyond local backlog metadata, service code, function versions, containers, workflows, charts, database schemas, benchmark rows, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0740MofaasFeedbackLoopReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
