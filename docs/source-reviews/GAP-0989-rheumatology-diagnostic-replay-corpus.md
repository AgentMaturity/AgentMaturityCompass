# GAP-0989 - Rheumatology diagnostic replay-corpus boundary

- Gap: `GAP-0989`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7119716229`, OpenAlex API record at `https://api.openalex.org/works/W7119716229`, DOI at `https://doi.org/10.1007/s00296-025-06068-y`, Springer article endpoint at `https://link.springer.com/article/10.1007/s00296-025-06068-y`, Springer PDF endpoint at `https://link.springer.com/content/pdf/10.1007/s00296-025-06068-y.pdf`, Crossref API at `https://api.crossref.org/works/10.1007/s00296-025-06068-y`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, Crossref API inspection, Springer endpoint header checks, and local backlog metadata.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no rheumatology benchmark runner, diagnostic-performance dataset mirror, medical decision-support workflow, article importer, DOI resolver, Crossref importer, OpenAlex importer, Springer PDF parser, model adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific replay path added.
- Linear: `AMC-1268`

## Live source metadata

OpenAlex identifies `Diagnostic performance of Prof. Valmed, ChatGPT-5 Thinking, and OpenEvidence in rheumatology: A comparative evaluation` as a `2026` journal article with publication_date `2026-01-10`, DOI `https://doi.org/10.1007/s00296-025-06068-y`, journal `Rheumatology International`, open_access status `hybrid`, CC BY license metadata, referenced_works_count `28`, and cited_by_count `4`.

Crossref identifies DOI `10.1007/s00296-025-06068-y` as a journal article in `Rheumatology International`, publisher `Springer Science and Business Media LLC`, published-online `2026-01-10`, reference-count `33`, and CC BY license metadata. Crossref author metadata includes Phillip Kremer, Emily Langballe, Isabell Haase, Jonathan Bamberger, Sebastian Kuhn, Martin Krusche, and Johannes Knitza.

DOI resolution redirected through `link.springer.com` to the Springer article route. From this environment, the Springer article and PDF endpoints redirected through Springer identity handling, so source-review closure uses the live OpenAlex, DOI, and Crossref metadata plus endpoint reachability rather than copying or parsing article content.

OpenAlex concept metadata included Medical diagnosis, McNemar's test, Medicine, Diagnostic test, Diagnostic accuracy, Medical physics, Medical imaging, Rheumatology, Continuous variable, and Benchmarking.

No article text, abstract prose beyond short metadata facts, Springer page prose, PDF content, patient cases, clinical vignettes, diagnostic labels, answer keys, model outputs, benchmark rows, tables, figures, prompts, equations, statistical outputs, screenshots, examples, or implementation details were copied into AMC.

## Relevance decision

GAP-0989 is relevant to AMC only through the existing replayable benchmark corpus primitive. The source is a diagnostic-performance comparison in a medical domain, but the AMC-relevant requirement is generic: Score, Shield, and Watch claims need replayable evidence that an auditor can rerun from an AMC-owned fixture with a fixed seed, fixture hash, baseline/candidate score delta, signed evidence refs, source refs, row hashes, and CI or lifecycle receipt proof.

The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`. Rheumatology paper identity, DOI reachability, OpenAlex/Crossref metadata, Springer endpoint metadata, journal metadata, author metadata, concept labels, diagnostic-performance labels, model-name labels, statistical-test labels, medical-domain labels, open-access labels, or local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, source refs, signed evidence, and row hashes. |
| Shield | Relevant when replay rows cover unsafe, misleading, hallucinated, clinical-domain, or regression behavior with signed evidence and CI/lifecycle receipts. |
| Enforce | No runtime medical policy, diagnostic workflow, guardrail, circuit breaker, or enforcement path changed. |
| Vault | No patient data, clinical vignette, dataset, PDF, prompt, model output, private artifact, or secure-storage behavior changed. |
| Watch | Relevant when replay deltas become lifecycle-regression evidence; no live monitor changed for this gap. |
| Fleet | Model comparison context only; no Fleet topology, orchestration, routing, or coordination behavior changed. |
| Passport | No portable proof-bundle schema, external token, or identity claim changed. |
| Comply | No medical-device, clinical, HIPAA, EU AI Act, NIST, ISO, SOC 2, or regulatory mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with AMC-owned synthetic fixture data.

The positive path proves rheumatology diagnostic-performance source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, Score/Shield/Watch coverage, row hashes, score delta, and CI receipt proof. The negative path fails closed when rheumatology paper metadata, DOI/OpenAlex/Crossref/Springer metadata, diagnostic-performance labels, model-name labels, medical-domain labels, statistical-test labels, and local backlog metadata replace an AMC-owned replay fixture.

## Fail-closed rule

Rheumatology source identity, title, DOI reachability, OpenAlex reachability, Crossref reachability, Springer endpoint reachability, journal metadata, author metadata, publication dates, open-access status, concept labels, diagnostic-performance labels, model-name labels, medical-domain labels, McNemar's test labels, diagnostic-accuracy labels, benchmarking labels, cited-by counts, reference counts, CC BY labels, or local backlog metadata alone are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No rheumatology benchmark runner, diagnostic-performance dataset mirror, medical decision-support workflow, clinical evaluator, Prof. Valmed adapter, OpenEvidence adapter, ChatGPT-5 Thinking adapter, model-comparison adapter, McNemar test implementation, statistical-analysis subsystem, Springer article importer, Springer PDF parser, Crossref importer, OpenAlex importer, DOI resolver, patient-case importer, answer-key loader, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific replay path was added.

No article text, abstract prose beyond short metadata facts, Springer page prose, PDF content, patient cases, clinical vignettes, diagnostic labels, answer keys, model outputs, benchmark rows, tables, figures, prompts, equations, statistical outputs, screenshots, examples, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0989RheumatologyDiagnosticReplayCorpusBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0989-rheumatology-diagnostic-replay-corpus.md'`; 3 replay primitive tests passed.
- Focused regression: `npx vitest run tests/gap0989RheumatologyDiagnosticReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0988VirtualExpertJudgeCalibrationBoundary.test.ts tests/gap0989RheumatologyDiagnosticReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over the new GAP-0989 doc/test found no matches.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 836 files / 7,339 tests.
