# GAP-0804 - Cloud-edge-IoT replay-corpus unavailable-source boundary

- Gap: `GAP-0804`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog DOI `10.5281/zenodo.20591968`, OpenAlex work `W7163927672`, and title `Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation`
- Retrieval: `2026-06-21` via live browser/search checks; shell network remains restricted in this environment.
- Status: source unavailable; closed through existing eval replay corpus receipts; no cloud-edge-IoT framework, mapping-study mirror, or source-specific replay runner added.

## Live retrieval result

The local backlog identifies the source as `Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation`, DOI `10.5281/zenodo.20591968`, and OpenAlex work `W7163927672`. During this pass, live retrieval did not produce a usable primary source page or independent source page for the paper:

- exact-title search returned no usable primary/source result.
- DOI search for `10.5281/zenodo.20591968` returned no usable primary/source result.
- DOI URL search for `https://doi.org/10.5281/zenodo.20591968` returned no usable primary/source result.
- Zenodo search for `20591968` returned no usable primary/source result.
- OpenAlex search for `W7163927672` returned no usable primary/source result.

The OpenAlex snippet in the backlog has `No abstract in OpenAlex metadata`, so AMC cannot use this source to substantiate exact architecture, deployment, or evaluation claims. Local metadata identifies cloud-edge-IoT continuum and systematic mapping study context only. No upstream article prose, mapping tables, architecture diagrams, deployment recipes, edge-device data, IoT telemetry, prompts, model outputs, figures, benchmark rows, configs, docs text, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context only when an AMC-owned replay packet carries a replay manifest, fixture hash, fixed seed, source refs, signed evidence refs, score delta, CI receipt, and Score/Shield/Watch coverage. GAP-0804 does not justify importing the unavailable source, mirroring a systematic mapping study, adding a cloud-edge-IoT deployment framework, or adding a source-specific replay runner.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`. DOI/OpenAlex/title metadata, cloud-edge-IoT labels, systematic mapping labels, architecture labels, deployment labels, or evaluation labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, and signed row evidence. |
| Shield | Relevant through fail-closed evidence and CI receipts before external cloud-edge-IoT claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence. |
| Fleet | Multi-agent LLM deployment context only; no orchestration topology or continuum framework changed. |
| Enforce | No runtime cloud, edge, IoT, deployment, or network policy changed. |
| Vault | No IoT telemetry, edge data, prompts, or secure-storage behavior changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | No IoT, infrastructure, privacy, or data-residency compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, cloud-edge-IoT framework, architecture catalog, deployment runner, mapping-study mirror, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0804.

The focused regression exercises the existing eval replay corpus engine with cloud-edge-IoT-style fixture data owned by AMC. The positive path requires AMC-owned replay fixtures, fixed seeds, fixture hashes, source refs, baseline/candidate score deltas, signed evidence, source availability metadata, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when DOI/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

Unavailable source metadata alone must fail closed for replay-corpus claims. DOI, OpenAlex id, title, No abstract in OpenAlex metadata, cloud-edge-IoT continuum labels, systematic mapping study labels, architectures labels, deployment labels, evaluation labels, local backlog metadata, or source identity are not enough to pass. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No cloud-edge-IoT framework, mapping-study mirror, architecture catalog, deployment runner, edge-device simulator, IoT telemetry importer, continuum benchmark, paper importer, Zenodo importer, OpenAlex importer, DOI resolver, dataset mirror, benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream article prose, mapping tables, architecture diagrams, deployment recipes, edge-device data, IoT telemetry, prompts, model outputs, figures, benchmark rows, configs, docs text, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0804CloudEdgeIotReplayCorpusUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
