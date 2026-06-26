# GAP-0992 - Soil science replay-corpus boundary

- Gap: `GAP-0992`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7161986360`, OpenAlex API record at `https://api.openalex.org/works/W7161986360`, DOI at `https://doi.org/10.3389/fsci.2026.1721295`, Frontiers article endpoint at `https://www.frontiersin.org/journals/science/articles/10.3389/fsci.2026.1721295/full`, Frontiers PDF endpoint at `https://www.frontiersin.org/journals/science/articles/10.3389/fsci.2026.1721295/pdf`, Crossref API at `https://api.crossref.org/works/10.3389/fsci.2026.1721295`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, Frontiers article/PDF header checks, Crossref API inspection, and local backlog metadata.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no soil-science benchmark runner, scientific-discovery evaluator, hypothesis-generation workflow, domain dataset mirror, article importer, DOI resolver, Crossref importer, OpenAlex importer, Frontiers PDF parser, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific replay path added.
- Linear: `AMC-1271`

## Live source metadata

OpenAlex identifies `Enhancing soil science research with multi-agent artificial intelligence systems` as a `2026` journal article with publication_date `2026-05-21`, DOI `https://doi.org/10.3389/fsci.2026.1721295`, journal `Frontiers in Science`, open_access status `diamond`, CC BY license metadata, referenced_works_count `72`, cited_by_count `2`, and `is_retracted` set to false.

Crossref identifies DOI `10.3389/fsci.2026.1721295` as a journal article in `Frontiers in Science`, publisher `Frontiers Media SA`, published-online `2026-05-21`, reference-count `74`, and CC BY license metadata. Crossref author metadata includes Budiman Minasny, Alex McBratney, Jose A.M. Dematte, Mercedes Roman Dobarco, and Pete Smith.

DOI resolution redirected to the Frontiers article route, which returned `200` HTML from this environment. The Frontiers PDF endpoint returned `application/pdf` with filename metadata for `fsci-4-1721295.pdf`. The source-review closure uses these live metadata and reachability facts only; it does not import or parse article/PDF content.

OpenAlex topic and concept metadata included Soil Geostatistics and Mapping, Scientific Computing and Data Management, Geochemistry and Geologic Mapping, Computer science, Data science, Artificial intelligence, Conceptual framework, Software, Interdisciplinarity, and Management science.

No article text, abstract prose beyond short metadata facts, Frontiers page prose, PDF content, source hypotheses, expert-review outputs, simulated peer-review outputs, soil datasets, sensor data, digital-twin examples, benchmark rows, prompts, model responses, tables, figures, screenshots, examples, or implementation details were copied into AMC.

## Relevance decision

GAP-0992 is relevant to AMC only through the existing replayable benchmark corpus primitive. The source is a soil-science paper about multi-agent AI systems for scientific research, but the AMC-relevant requirement is generic: Score, Shield, and Watch claims need replayable evidence that an auditor can rerun from an AMC-owned fixture with a fixed seed, fixture hash, baseline/candidate score delta, signed evidence refs, source refs, row hashes, and CI or lifecycle receipt proof.

The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`. Soil-science source identity, DOI reachability, OpenAlex/Crossref metadata, Frontiers endpoint metadata, journal metadata, author metadata, concept labels, hypothesis-generation labels, expert-review labels, scientific-discovery labels, open-access labels, PDF reachability, or local backlog metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, source refs, signed evidence, and row hashes. |
| Shield | Relevant when replay rows cover unsafe, misleading, overtrusted, ungrounded, or regression behavior with signed evidence and CI/lifecycle receipts. |
| Enforce | No runtime scientific workflow policy, guardrail, circuit breaker, or enforcement path changed. |
| Vault | No article/PDF content, scientific dataset, sensor data, prompt, model output, private artifact, or secure-storage behavior changed. |
| Watch | Relevant when replay deltas become lifecycle-regression evidence; no live monitor changed for this gap. |
| Fleet | Multi-agent research context only; no Fleet topology, orchestration, routing, delegation, or coordination behavior changed. |
| Passport | No portable proof-bundle schema, external token, or identity claim changed. |
| Comply | No environmental-science, research-integrity, EU AI Act, NIST, ISO, SOC 2, or regulatory mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with AMC-owned synthetic fixture data.

The positive path proves soil-science multi-agent research source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, Score/Shield/Watch coverage, row hashes, score delta, and CI receipt proof. The negative path fails closed when soil-science paper metadata, DOI/OpenAlex/Crossref/Frontiers metadata, PDF endpoint labels, multi-agent research labels, hypothesis-generation labels, expert-review labels, source concepts, and local backlog metadata replace an AMC-owned replay fixture.

## Fail-closed rule

Soil-science source identity, title, DOI reachability, OpenAlex reachability, Crossref reachability, Frontiers article reachability, PDF endpoint reachability, journal metadata, publisher metadata, author metadata, publication dates, open-access status, concept labels, topic labels, hypothesis-generation labels, expert-review labels, scientific-discovery labels, multi-agent labels, cited-by counts, reference counts, CC BY labels, or local backlog metadata alone are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No soil-science benchmark runner, scientific-discovery evaluator, hypothesis-generation workflow, digital-soil-twin simulator, field-sensor adapter, remote-sensing adapter, mineral-associated-organic-carbon rubric, expert-review emulator, simulated-peer-review implementation, Frontiers article importer, Frontiers PDF parser, Crossref importer, OpenAlex importer, DOI resolver, PDF downloader, dataset mirror, source-specific eval pack, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific replay path was added.

No article text, abstract prose beyond short metadata facts, Frontiers page prose, PDF content, source hypotheses, expert-review outputs, simulated peer-review outputs, soil datasets, sensor data, digital-twin examples, benchmark rows, prompts, model responses, tables, figures, screenshots, examples, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0992SoilScienceReplayCorpusBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0992-soil-science-replay-corpus.md'`; 3 replay primitive tests passed.
- Focused regression: `npx vitest run tests/gap0992SoilScienceReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0991HealthcareAgentTaxonomyLiveDriftBoundary.test.ts tests/gap0992SoilScienceReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over the replay implementation files found no GAP-0992 soil-science identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 839 files / 7,351 tests.
