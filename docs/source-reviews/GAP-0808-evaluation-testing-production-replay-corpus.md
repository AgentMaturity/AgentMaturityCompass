# GAP-0808 - Evaluation/testing production replay-corpus boundary

- Gap: `GAP-0808`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20583927`, Zenodo record `20583928`, `https://openalex.org/W7163803520`
- Retrieval: `2026-06-21` via live header checks and search. The DOI and Zenodo record were source header verified; OpenAlex was checked by API header.
- Status: closed through existing eval replay corpus receipts; no replication-package importer, dataset mirror, systematic-review parser, or source-specific benchmark added.

## Live source metadata

The local backlog names the source as `Replication package for "Evaluation and Testing of LLM-Based Agents in Production: A Systematic Literature Review"` and maps it to OpenAlex work `W7163803520`. The same backlog classifies the source as a replication package / systematic literature review context with concepts including Computer science, Information retrieval, Data extraction, and Audit.

Live retrieval did not rely only on local metadata. `curl -I --max-time 12 https://doi.org/10.5281/zenodo.20583927` returned HTTP 302 to `https://zenodo.org/doi/10.5281/zenodo.20583927`. `curl -I --max-time 12 https://zenodo.org/records/20583927` returned HTTP 302 to `/records/20583928`. `curl -I --max-time 12 https://api.openalex.org/works/W7163803520` showed that the OpenAlex API HEAD returned HTTP 200 with JSON content headers. Later body fetches were not stable in this restricted environment, so AMC does not claim or copy package files, datasets, review rows, examples, tables, extracted data, code, or benchmark contents.

## Relevance decision

This source is relevant to AMC as replayable benchmark-corpus context because a production LLM-agent evaluation replication package is exactly the sort of source that could tempt a product to claim benchmark support from title/DOI metadata alone. AMC should instead require an AMC-owned replay manifest, fixture hash, fixed seed, baseline/candidate score delta, CI receipt, signed evidence refs, source refs, row hashes, and Score/Shield/Watch surface coverage before a replay-corpus claim can pass.

The source does not justify importing Zenodo files, parsing a systematic literature review, mirroring package contents, copying review extraction rows, adding a production-agent benchmark runner, changing public methodology, or adding API/CLI/Studio behavior. GAP-0808 is closed by documenting the source boundary and adding regression coverage that the existing generic `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` path accepts only AMC-owned replay evidence. DOI, Zenodo redirect, OpenAlex id, title, replication-package label, systematic literature review label, or local backlog concepts alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replayable benchmark corpus manifests, fixture hashes, score deltas, row hashes, and signed evidence. |
| Shield | Relevant through fail-closed replay evidence and CI receipts before source-linked benchmark claims are trusted. |
| Watch | Relevant through replay receipts that can be monitored as regression evidence for production-agent evaluation canaries. |
| Enforce | No runtime policy, route enforcement, or circuit breaker changed. |
| Vault | No Zenodo files, review extraction rows, datasets, prompts, examples, or secure-storage behavior changed. |
| Fleet | Production-agent evaluation context only; no orchestration topology, multi-agent simulator, or benchmark runner added. |
| Passport | No portable proof-bundle field changed. |
| Comply | Audit concept is context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Zenodo importer, OpenAlex importer, systematic-review parser, replication-package mirror, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0808.

The focused regression exercises the existing eval replay corpus engine with AMC-owned production-agent evaluation fixture data. The positive path requires a replay manifest, fixture hash, fixed seed, source refs, baseline/candidate score delta, signed evidence, Score/Shield/Watch surface coverage, and CI-ready receipts. The negative path fails closed when DOI/Zenodo/OpenAlex/title metadata replaces AMC-owned replay evidence.

## Fail-closed rule

DOI, Zenodo redirect, Zenodo record id, OpenAlex id, title, replication-package label, systematic literature review label, Computer science, Information retrieval, Data extraction, Audit, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline and candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No replication-package importer, Zenodo importer, OpenAlex importer, systematic-review parser, review-row importer, dataset mirror, benchmark mirror, benchmark runner, production-agent simulator, production-agent evaluation workflow, review-extraction schema, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific replay path was added. No upstream files, review rows, datasets, examples, tables, extracted data, code, package metadata body, benchmark contents, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0808EvaluationTestingProductionReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
