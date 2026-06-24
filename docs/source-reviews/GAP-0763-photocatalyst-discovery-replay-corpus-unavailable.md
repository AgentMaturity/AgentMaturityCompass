# GAP-0763 - Photocatalyst discovery replay-corpus unavailable-source boundary

- Gap: `GAP-0763`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.1002/advs.202524215`, OpenAlex `https://openalex.org/W7129042869`, and title `Prompt Engineering Accelerates the Data-Driven Discovery of Photocatalysts via an LLM-Based Model Ensemble Strategy`
- Retrieval: `2026-06-21`; exact-title, DOI, Wiley/publisher, and OpenAlex work searches returned no reachable primary source in this sandbox; shell network remains DNS-restricted in this environment.
- Status: closed as an unavailable-source replay-corpus boundary; no photocatalyst-discovery workflow, scientific literature miner, LLM ensemble runner, dataset importer, or chemistry/materials subsystem added.

## Source availability note

The local backlog identifies a paper titled `Prompt Engineering Accelerates the Data-Driven Discovery of Photocatalysts via an LLM-Based Model Ensemble Strategy`, DOI `10.1002/advs.202524215`, and OpenAlex work `W7129042869`. Live search attempts for the exact title, DOI, Wiley/Advanced Science publisher path, and OpenAlex work ID did not produce a reachable primary page on `2026-06-21`.

Because the primary source could not be verified, AMC must not make exact claims about the paper’s methods, datasets, prompts, outputs, model ensemble details, photocatalyst findings, or benchmark rows. The backlog concepts can be retained only as unverified source-review context for replay-corpus boundaries: prompt engineering, data-driven discovery, photocatalysts, LLM-based model ensembles, unstructured scientific literature, scalability, ensemble learning, machine learning, artificial intelligence, and big-data extraction.

## Relevance decision

GAP-0763 is relevant to AMC through existing eval replay corpus receipts, but the source is unavailable for exact-source claims. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`: replay manifests, fixed seeds, fixture hashes, source refs, signed evidence refs, score deltas, CI receipts, and fail-closed replay readiness for Score, Shield, and Watch.

A source citation can be retained only as unverified context when the AMC replay packet is fully AMC-owned and contains no copied upstream artifacts. DOI/OpenAlex/title metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable eval manifests, fixture hashes, fixed seeds, score deltas, and signed rows. |
| Shield | Relevant through fail-closed handling for unsupported paper, chemistry, literature-mining, and model-ensemble claims. |
| Watch | Relevant when replay results bind to CI/lifecycle receipts and regression thresholds; no live monitor changed. |
| Enforce | No runtime scientific-literature policy, chemistry policy, prompt policy, or circuit-breaker behavior changed. |
| Vault | No papers, chemistry datasets, prompts, outputs, model traces, or secure-storage behavior changed. |
| Fleet | Model-ensemble context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external scientific-discovery credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0763 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing eval replay corpus primitive. The positive path accepts photocatalyst-discovery context only with AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, and CI receipt. The negative path fails closed when DOI/OpenAlex/title/photocatalyst/model-ensemble metadata replaces AMC-owned replay evidence.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, photocatalyst-discovery workflow, scientific literature miner, LLM ensemble runner, chemistry/materials dataset importer, prompt importer, output importer, paper importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0763.

## Fail-closed rule

DOI, OpenAlex work ID, title, photocatalyst labels, prompt-engineering labels, data-driven discovery labels, LLM model-ensemble labels, scientific-literature labels, extraction labels, scalability labels, machine-learning labels, artificial-intelligence labels, big-data labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, row hashes, score delta, CI/lifecycle receipt, Score/Shield/Watch surface coverage, primary-source availability status, and no-copy proof.

## No-bloat boundary

No photocatalyst-discovery workflow, scientific literature miner, LLM ensemble runner, chemistry/materials subsystem, catalyst dataset importer, paper importer, OpenAlex importer, DOI resolver, prompt importer, output importer, benchmark mirror, model-ensemble adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose, abstracts beyond local metadata snippets, datasets, prompts, outputs, model traces, figures, tables, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0763PhotocatalystDiscoveryReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
