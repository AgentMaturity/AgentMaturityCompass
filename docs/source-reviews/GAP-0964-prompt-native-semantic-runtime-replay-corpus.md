# GAP-0964 - Prompt-native semantic runtime replay-corpus boundary

- Gap: `GAP-0964`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.5281/zenodo.19059674`, `https://zenodo.org/records/19059674`, `https://openalex.org/W7138396142`, `https://api.openalex.org/works/W7138396142`
- Retrieval: `2026-06-22` via DOI HEAD, Zenodo record HEAD, and OpenAlex API HEAD. DOI returned HTTP/2 302 to the Zenodo DOI route, then Zenodo redirected to the record URL. Zenodo record returned HTTP/1.1 410 GONE. OpenAlex API HEAD returned HTTP/2 200.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no prompt-native runtime importer, Zenodo importer, OpenAlex importer, paper parser, semantic runtime, process-teaching subsystem, compression harness, provenance store, or source-specific replay path added.
- Linear: `AMC-1242`

## Live source metadata

The local OpenAlex 2026 metadata row identifies `Prompt-Native Semantic Runtimes for Language Models: Inference-Time Semantic Governance, Provenance, Compression, and Document-Level Process Teaching`, DOI `https://doi.org/10.5281/zenodo.19059674`, Zenodo record `https://zenodo.org/records/19059674`, OpenAlex work `https://openalex.org/W7138396142`, and OpenAlex API `https://api.openalex.org/works/W7138396142`.

The DOI live probe confirmed a redirect path into Zenodo, but the Zenodo record is currently gone. The OpenAlex API HEAD endpoint exists, but the primary Zenodo record is unavailable, so the title and concept context remain metadata-only for product purposes.

The local OpenAlex metadata mentions Prompt-Native Semantic Runtimes, Inference-Time Semantic Governance, Provenance, Compression, Document-Level Process Teaching, Computer science, Software portability, Programming language, Semantic computing, Natural language processing, Semantics, and Process. Those terms are source-review context only.

No Zenodo paper prose, OpenAlex abstract body, process-teaching examples, prompt-runtime examples, semantic governance rules, provenance tables, compression examples, datasets, figures, benchmark rows, prompts, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0964 is relevant to AMC only through the existing replayable benchmark corpus primitive. Semantic governance, provenance, compression, and process-teaching claims could matter for Score/Shield/Watch, but they cannot stand as proof while the primary Zenodo source is unavailable.

The accepted AMC primitive is already `runReplayBenchmarkCorpus` plus `buildEvalReplayCorpusEvidenceReceipt`: replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, CI receipt, row hashes, Score/Shield/Watch coverage, and no-copy proof. DOI, Zenodo, OpenAlex, title, and concept metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, and signed evidence. |
| Shield | Relevant only when replay evidence covers semantic-governance or provenance failures with signed receipts and fails closed otherwise. |
| Watch | Relevant only when replay deltas are tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime semantic governance, policy enforcement, or circuit breaker changed. |
| Vault | No provenance store, compression corpus, prompts, documents, or secure-storage behavior changed. |
| Fleet | Runtime/process-teaching context only; no Fleet orchestration or topology changed. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | Provenance/governance context only; no compliance mapping changed. |

## Product closure

No product code changed for GAP-0964. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior.

The positive path proves prompt-native semantic-runtime context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, score delta, Score/Shield/Watch coverage, and CI-style receipt proof. The negative path fails closed when DOI, Zenodo 410 status, OpenAlex metadata, semantic governance, provenance, compression, and process-teaching metadata replaces an AMC-owned replay fixture.

## Fail-closed rule

DOI, Zenodo record URL, Zenodo 410 GONE status, OpenAlex work ID, OpenAlex API URL, title, OpenAlex 2026 metadata, Prompt-Native Semantic Runtimes label, Inference-Time Semantic Governance label, Provenance label, Compression label, Document-Level Process Teaching label, Computer science label, Software portability label, Programming language label, Semantic computing label, Natural language processing label, Semantics label, Process label, local backlog metadata, or source identity alone must fail closed for replay-corpus claims.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No prompt-native runtime importer, Zenodo importer, OpenAlex importer, paper parser, semantic runtime, semantic-governance rule engine, process-teaching subsystem, provenance store, compression harness, document-process runner, benchmark dataset, source-specific replay lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added.

No Zenodo paper prose, OpenAlex abstract body, process-teaching examples, prompt-runtime examples, semantic governance rules, provenance tables, compression examples, datasets, figures, benchmark rows, prompts, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0964PromptNativeSemanticRuntimeReplayCorpusBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0963OpenObserveQuestionExplainabilityBoundary.test.ts tests/gap0964PromptNativeSemanticRuntimeReplayCorpusBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
