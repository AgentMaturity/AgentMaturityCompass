# GAP-1050 - EoH-S replay corpus

- Gap: `GAP-1050`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `EoH-S: Evolution of Heuristic Set Using LLMs for Automated Heuristic Design`
- Retrieval: OpenAlex API, Crossref API, DOI resolver headers, AAAI OJS article metadata, AAAI article headers, PDF headers, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1050` is relevant to AMC only through the existing replay-corpus receipt path. The source is an AAAI paper about automated heuristic design with LLMs. It can inform the kind of optimization and heuristic-design workloads an AMC-owned replay corpus might cover, but it does not justify adding a heuristic design subsystem, hyper-heuristic runner, optimization benchmark mirror, TSP dataset, vehicle-routing dataset, heuristic-set importer, generated-heuristic parser, AAAI scraper, source importer, paper mirror, benchmark mirror, or source-specific scoring path.

Score, Shield, and Watch may use this source only as context when an AMC-owned replay manifest, fixture hash, fixed seed, score delta, signed evidence, source refs, and CI receipt exist. Source metadata alone fails closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay fixture produces scored baseline/candidate evidence with a replay manifest and score delta. |
| Shield | Relevant only when replay rows include signed evidence proving safety or assurance checks on AMC-owned tasks. |
| Enforce | Not changed; no runtime guardrail, optimization policy, or heuristic-design execution path was added. |
| Vault | Not changed; no paper PDF, optimization dataset, TSP instance, vehicle-routing dataset, prompt, generated heuristic, or model output was imported. |
| Watch | Relevant only when the replay receipt includes CI evidence and can be monitored as replay-corpus readiness, not as source metadata. |
| Fleet | Contextual only; heuristic-set and population labels do not add AMC fleet orchestration or topology. |
| Passport | Not changed; existing proof bundles can already carry replay-corpus receipts. |
| Comply | Not changed; no public methodology version or compliance mapping changed. |

## Product closure

No new source-specific product module was added. Existing AMC replay-corpus primitives already enforce the product requirement:

- `src/benchmarks/replayBenchmarkCorpus.ts` builds replay manifests, fixture hashes, fixed seeds, score deltas, and CI receipts.
- `src/eval/replayCorpusEvidenceReceipt.ts` converts replay results into fail-closed Score/Shield/Watch evidence receipts.
- `src/diagnostic/evalReplayCorpusBoundary.ts` keeps diagnostic readiness blocked unless complete replay-corpus evidence exists.

The regression test for this gap proves both paths:

- A valid AMC-owned EoH-S-style replay fixture is accepted only with source refs, Score/Shield/Watch coverage, fixture hash, fixed seed, signed evidence, score delta, and CI receipt.
- A metadata-only heuristic-design row fails closed even when it cites the DOI, OpenAlex, Crossref, AAAI article page, and PDF URL.

## Live source facts

- OpenAlex work: `https://openalex.org/W7139112767`.
- OpenAlex API: `https://api.openalex.org/works/W7139112767`.
- DOI: `10.1609/aaai.v40i43.41038` at `https://doi.org/10.1609/aaai.v40i43.41038`.
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i43.41038`.
- AAAI article page: `https://ojs.aaai.org/index.php/AAAI/article/view/41038`.
- AAAI PDF URL: `https://ojs.aaai.org/index.php/AAAI/article/download/41038/44999`.
- DOI redirect returned `HTTP/2 302` to the AAAI article page; the AAAI article returned HTTP/2 200 and `content-type: text/html; charset=utf-8`.
- AAAI article returned HTTP/2 200 in direct article-header retrieval.
- PDF endpoint returned HTTP/2 200 with `content-type: application/pdf` and filename `11984-AAAI26.LiuF-SO.pdf`.
- OpenAlex metadata: publication_date `2026-03-14`, OpenAlex type `article`, is_oa `true`, oa_status `diamond`, cited_by_count `1`, source `Proceedings of the AAAI Conference on Artificial Intelligence`, host organization `Association for the Advancement of Artificial Intelligence`, volume `40`, issue `43`, and pages `37090-37098`.
- Crossref metadata: Crossref type `journal-article`, publisher `Association for the Advancement of Artificial Intelligence (AAAI)`, issued date 2026-03-14, container title `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `43`, and pages `37090-37098`.
- AAAI article metadata identified the title, `Proceedings of the AAAI Conference on Artificial Intelligence`, volume `40`, issue `43`, first page `37090`, last page `37098`, DOI `10.1609/aaai.v40i43.41038`, and the same PDF URL.
- Authors from OpenAlex/Crossref/AAAI metadata include Fei Liu, Yilu Liu, Qingfu Zhang, Tong Xialiang, and Mingxuan Yuan.
- Institution metadata includes City University of Hong Kong, Huawei Technologies (Sweden), and Huawei Noah's Ark Lab.
- OpenAlex topics reviewed as context: Vehicle Routing Optimization Methods, Optimization and Packing Problems, and Constraint Satisfaction and Optimization.
- OpenAlex keyword/concept metadata reviewed as context includes Heuristic, Heuristics, Set (abstract data type), Hyper-heuristic, Generalization, Mathematical optimization, Population, Metaheuristic, Evolutionary algorithm, Travelling salesman problem, Computer science, Artificial intelligence, and Machine learning.
- Abstract-level and method-level content was not copied into AMC product logic, docs, tests, prompts, fixtures, datasets, or benchmarks.

## Fail-closed rule

Reject any claim that depends only on source metadata. The following are insufficient without AMC-owned replay evidence:

- DOI `10.1609/aaai.v40i43.41038` or `https://doi.org/10.1609/aaai.v40i43.41038`
- OpenAlex record `https://openalex.org/W7139112767`
- OpenAlex API record `https://api.openalex.org/works/W7139112767`
- Crossref API record `https://api.crossref.org/works/10.1609/aaai.v40i43.41038`
- AAAI article page `https://ojs.aaai.org/index.php/AAAI/article/view/41038`
- AAAI PDF URL `https://ojs.aaai.org/index.php/AAAI/article/download/41038/44999`
- Title, author, institution, proceedings, heuristic, hyper-heuristic, generalization, population, metaheuristic, evolutionary algorithm, travelling-salesman, vehicle-routing, optimization, abstract, topic, keyword, or concept metadata

A passing AMC replay-corpus claim must include replay manifest, fixture hash, fixed seed, score delta, CI receipt, Score/Shield/Watch surface coverage, source refs, row hashes, and signed evidence refs.

## No-bloat boundary

AMC did not add a heuristic design subsystem, hyper-heuristic runner, optimization benchmark mirror, TSP benchmark, vehicle-routing dataset importer, heuristic-set importer, generated-heuristic parser, population optimizer, metaheuristic evaluator, evolutionary algorithm runner, AAAI scraper, DOI adapter, Crossref adapter, OpenAlex importer, PDF parser, paper mirror, benchmark mirror, dataset mirror, prompt set, model-output importer, API route, CLI command, Studio panel, Watch panel, source-specific replay module, copied paper prose, copied abstract, copied tables, copied figures, copied prompts, copied optimization instances, copied heuristic sets, copied generated heuristics, copied benchmark rows, copied examples, copied generated outputs, or copied source content.

The only accepted product behavior remains the generic AMC-owned replay-corpus receipt path.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1050EohsReplayCorpusBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 replay-corpus primitive tests passed.
- Live source retrieval:
  - `fetch('https://api.openalex.org/works/W7139112767')`
  - `fetch('https://api.crossref.org/works/10.1609/aaai.v40i43.41038')`
  - `curl -sSIL https://doi.org/10.1609/aaai.v40i43.41038`
  - `curl --compressed -sSL https://ojs.aaai.org/index.php/AAAI/article/view/41038`
  - `curl -sSIL https://ojs.aaai.org/index.php/AAAI/article/view/41038`
  - `curl -sSIL https://ojs.aaai.org/index.php/AAAI/article/download/41038/44999`
- `npx vitest run tests/gap1050EohsReplayCorpusBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1042RagDrugDiscoveryReplayCorpusBoundary.test.ts tests/gap1050EohsReplayCorpusBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, and `src/diagnostic/evalReplayCorpusBoundary.ts`: PASS, no GAP-1050 EoH-S identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 897 files / 7,572 tests.
