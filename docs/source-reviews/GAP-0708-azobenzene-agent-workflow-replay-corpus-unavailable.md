# GAP-0708 - Azobenzene agent-workflow replay-corpus unavailable-source boundary

- Gap: `GAP-0708`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7140292092`, DOI `10.1039/d5sc08794e`, and title `Unlocking azobenzene isomerization mechanisms via an LLM agent-driven workflow integrating simulation, experiment, and machine learning`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, Royal Society of Chemistry publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no chemistry, simulation, experiment, or machine-learning workflow added.

## Live source metadata

The local backlog identifies a paper titled `Unlocking azobenzene isomerization mechanisms via an LLM agent-driven workflow integrating simulation, experiment, and machine learning`, DOI `10.1039/d5sc08794e`, OpenAlex work `W7140292092`, improvement dimension replayable benchmark corpus, category `Agent evaluation and benchmarks`, and concepts including azobenzene, isomerization, workflow, molecular machine, artificial intelligence, and nanotechnology. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, Royal Society of Chemistry publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, chemistry, simulation, or benchmark claim. Chemistry agent-workflow context is relevant only when AMC can bind its own replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, molecule data, simulation setup, experimental data, machine-learning model details, attention maps, metrics, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0708 is not accepted as standalone AMC replay-corpus evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The chemistry agent-workflow theme maps to existing eval replay corpus receipts only as context; it does not justify a chemistry simulation workflow, molecular dataset, source-specific evaluator, or methodology change.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. A source citation to this paper can be retained only as context when the replay packet carries AMC-owned fixture hashes, fixed seeds, signed evidence, score deltas, source refs, and CI/lifecycle receipts. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing replay manifests with fixture hash, seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers risky or unsupported scientific workflow behavior with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime chemistry workflow policy, simulation guardrail, or enforcement behavior changed. |
| Vault | No molecular data, experiment logs, model outputs, prompts, datasets, or secure-storage behavior changed. |
| Fleet | Agent-driven scientific workflow context only; no chemistry-agent orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No chemical, laboratory, environmental, safety, or audit-control mapping changed. |

## Product closure

GAP-0708 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path proves that azobenzene agent-workflow context can be cited only with AMC-owned replay evidence. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, chemistry workflow, molecular simulation adapter, experiment importer, machine-learning model, paper parser, or scoring behavior changed for GAP-0708.

## Fail-closed rule

OpenAlex work ID, DOI, title, azobenzene labels, isomerization labels, simulation labels, experiment labels, machine-learning labels, molecular-machine labels, nanotechnology labels, publisher identity, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No azobenzene workflow, chemistry simulation adapter, experimental data importer, molecular dataset, reaction-mechanism model, attention-map importer, Royal Society of Chemistry importer, OpenAlex importer, paper parser, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, molecule data, simulation setup, experimental data, machine-learning model details, attention maps, metrics, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0708AzobenzeneReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
