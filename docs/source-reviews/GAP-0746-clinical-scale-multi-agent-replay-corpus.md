# GAP-0746 - Clinical-scale multi-agent replay-corpus boundary

- Gap: `GAP-0746`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: Nature/npj article `https://www.nature.com/articles/s44401-026-00077-0`, DOI `10.1038/s44401-026-00077-0`, OpenAlex `https://openalex.org/W7134248010`
- Retrieval: `2026-06-21` via live Nature article page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no clinical workload simulator, medical benchmark runner, dataset importer, or multi-agent clinical orchestrator added.

## Live source metadata

The live Nature/npj Health Systems page identifies the source as `Orchestrated multi agents sustain accuracy under clinical-scale workloads compared to a single agent`, a `Brief Communication`, open access, published `09 March 2026`, volume `3`, article `23`. Listed authors include Eyal Klang, Mahmud Omar, Ganesh Raut, Reem Agbareia, Prem Timsina, Robert Freeman, Nicholas Gavin, Lisa Stump, Alexander W. Charney, Benjamin S. Glicksberg, and Girish N. Nadkarni.

Relevant source-review signals include single-agent versus orchestrated multi-agent execution, clinical-scale workloads, retrieval tasks, extraction tasks, dosing tasks, batch sizes from `5` to `80`, high-load accuracy degradation, token and latency scaling, deterministic ground truth, exact-match scoring after normalization, JSON output requirements for automated evaluation, random seed `42`, ten non-overlapping batches per model-topology pair, k-NN retrieval, sandboxed calculator, note fetcher, FAISS index context, `234,650` PubMed records, `331,793` EHR summaries, `20` dosing templates, hosted and open-weight model runs, and supplementary code/log availability. Reported review signals include multi-agent accuracy `90.6%` at five tasks and `65.3%` at eighty tasks, single-agent accuracy dropping from `73.1%` to `16.6%`, and up to a `65-fold` token-use gap at the highest load.

These facts are relevant to AMC as replayable benchmark corpus context only. Clinical-scale multi-agent workload claims need rerunnable evidence with replay manifests, fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence rows, source refs, and no-copy proof. They do not justify importing clinical datasets, copying task prompts, mirroring supplementary material, implementing a clinical workload runner, or claiming medical performance parity. No upstream paper prose beyond minimal metadata facts, clinical data, EHR summaries, PubMed records, dosing templates, prompts, model outputs, benchmark rows, supplementary code/logs, figures, tables, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0746 is relevant to AMC through the existing eval replay corpus receipt path because replayability is the right way to prove that multi-agent workload score deltas can be reproduced. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The source can be retained only as context when AMC-owned replay rows include a manifest hash, fixture hash, fixed seed, input/expected hashes, baseline/candidate run IDs, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof. Nature/DOI/OpenAlex/title metadata, clinical labels, workload labels, task-category labels, model names, batch-size labels, or reported accuracy/token numbers alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay corpus score deltas and fixture-bound manifests for multi-agent workload comparisons. |
| Shield | Relevant through fail-closed handling for missing signed rows, copied clinical artifacts, or metadata-only benchmark evidence. |
| Watch | Relevant through CI/lifecycle receipts that show replay evidence remains reproducible over time. |
| Enforce | No runtime clinical workflow policy, tool-routing policy, or enforcement behavior changed. |
| Vault | No EHR summaries, PubMed index, dosing templates, clinical traces, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent orchestration context only; no clinical orchestrator, worker topology, or simulator added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Clinical research context only; no medical, HIPAA, IRB, or compliance mapping changed. |

## Product closure

GAP-0746 is closed by documenting the live-source boundary and adding regression coverage over the existing replay corpus primitives. The positive path proves that clinical-scale multi-agent workload context can be cited only with AMC-owned replay fixtures and signed evidence. The negative path proves Nature/DOI/OpenAlex/title/clinical workload metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, clinical workload simulator, medical benchmark runner, multi-agent clinical orchestrator, EHR importer, PubMed index importer, dosing-template importer, supplement importer, exact-match scorer, JSON-output harness, OpenAlex importer, Nature importer, or scoring behavior changed for GAP-0746.

## Fail-closed rule

Nature article URL, OpenAlex work ID, DOI, title, author list, clinical-scale labels, multi-agent orchestration labels, single-agent labels, retrieval/extraction/dosing labels, batch-size labels, accuracy labels, token-use labels, latency labels, random-seed labels, PubMed/EHR/dosing-template labels, exact-match labels, JSON-output labels, supplementary-code labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline/candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No clinical workload simulator, medical benchmark runner, multi-agent clinical orchestrator, worker-agent topology, retrieval tool, sandboxed calculator, note fetcher, PubMed index importer, EHR importer, dosing-template importer, supplement importer, exact-match scorer, JSON-output harness, dataset mirror, prompt importer, model-output importer, benchmark-row importer, Nature importer, OpenAlex importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose beyond minimal metadata facts, clinical data, EHR summaries, PubMed records, dosing templates, prompts, model outputs, benchmark rows, supplementary code/logs, figures, tables, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0746ClinicalScaleMultiAgentReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
