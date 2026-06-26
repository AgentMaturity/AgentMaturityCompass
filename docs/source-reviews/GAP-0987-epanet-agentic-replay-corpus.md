# GAP-0987 - EPANET-Agentic replay-corpus boundary

- Gap: `GAP-0987`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7125229955`, OpenAlex API record at `https://api.openalex.org/works/W7125229955`, DOI at `https://doi.org/10.1016/j.watres.2026.125433`, DOI redirect target at `https://linkinghub.elsevier.com/retrieve/pii/S0043135426001156`, PubMed page at `https://pubmed.ncbi.nlm.nih.gov/41579609/`, PubMed ESummary API at `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=41579609&retmode=json`, PubMed EFetch API at `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=41579609&retmode=xml`, and Crossref API at `https://api.crossref.org/works/10.1016/j.watres.2026.125433`
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, Crossref API inspection, NCBI/PubMed E-utilities inspection, and local backlog metadata.
- Status: closed through existing eval replay corpus receipts only when AMC-owned replay evidence exists; no EPANET-Agentic runner, EPANET simulator integration, hydraulic model adapter, Water Research article importer, PubMed importer, DOI resolver, benchmark-network importer, simulation-output loader, agent-task taxonomy, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, or source-specific replay path added.
- Linear: `AMC-1266`

## Live source metadata

The OpenAlex record identifies `EPANET-Agentic: A multi-agent system for natural language-controlled simulations of water distribution networks` as a `2026` journal article in `Water Research`, with publication_date `2026-01-21`, DOI `https://doi.org/10.1016/j.watres.2026.125433`, open_access status `hybrid`, `referenced_works_count` `23`, and `cited_by_count` `3`. The DOI redirected to `https://linkinghub.elsevier.com/retrieve/pii/S0043135426001156`.

Crossref identified the DOI as a journal article in Water Research, with a published/issued date of `2026-04`, title metadata matching OpenAlex, authors Jian Wang, Guangtao Fu, and Dragan Savic, and text-mining links for the Elsevier article PII.

PubMed ESummary returned PMID `41579609`, journal source `Water Res`, full journal name `Water research`, epubdate `2026 Jan 20`, pubdate `2026 Apr 1`, DOI `10.1016/j.watres.2026.125433`, and PII `S0043-1354(26)00115-6`. PubMed EFetch returned Volume `293`, StartPage `125433`, ArticleDate `2026-01-20`, and keywords including Agentic AI, EPANET, Large language models, Water distribution networks, and Workflow automation.

OpenAlex concept metadata included Workflow, Modular design, Scalability, Computer science, Robustness, Benchmark, Distributed computing, Systems engineering, Architecture, and Complex system.

Source-review signals include natural-language control of water-distribution-network simulations, an orchestrator-centered tool-driven multi-agent architecture, TaskExecutor, CodeRunner, DataAnalyzer, human-in-the-loop oversight, benchmark networks L-Town, C-Town, and Net3, task categories System Characteristics, System Dynamics, System Operation, and Scenario Simulation, reported 100% success rate, tool invocation accuracy, robustness, scalability, modularity, and safety-critical human oversight.

No article text, abstract prose beyond short metadata facts, PubMed XML prose, Elsevier prose, benchmark-network data, EPANET files, simulator code, prompts, task rows, generated simulation outputs, figures, tables, model responses, workflows, or implementation details were copied into AMC.

## Relevance decision

GAP-0987 is relevant to AMC through the existing replayable benchmark corpus primitive. EPANET-Agentic is a domain-specific agentic simulation system, but the AMC-relevant lesson is generic: replay-corpus claims need an AMC-owned replay manifest, fixed seed, fixture hash, baseline/candidate score delta, source refs, signed evidence refs, row hashes, Score/Shield/Watch coverage, and CI or lifecycle receipt proof.

The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`. EPANET-Agentic title/DOI/PubMed/OpenAlex metadata, Water Research metadata, article keywords, benchmark network labels, task category labels, tool-invocation labels, human-in-the-loop labels, success-rate labels, local backlog metadata, or source identity alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay manifests with fixture hash, fixed seed, score delta, source refs, signed evidence, and row hashes. |
| Shield | Relevant when replay rows cover unsafe, safety-critical, intervention, tool-use, or regression behavior with signed evidence and CI/lifecycle receipts. |
| Enforce | No runtime tool policy, hydraulic simulator control, human-intervention workflow, circuit breaker, or enforcement path changed. |
| Vault | No simulator file, prompt, water-network model, generated output, private artifact, API key, or secure-storage behavior changed. |
| Watch | Relevant when replay deltas become monitoring or lifecycle-regression evidence; no live monitor changed for this gap. |
| Fleet | Multi-agent architecture context only; no Fleet topology, orchestration, routing, or coordination behavior changed. |
| Passport | No portable proof-bundle schema, external token, or identity claim changed. |
| Comply | No water-sector, safety-critical, environmental, clinical, regulatory, NIST, ISO, SOC 2, or EU AI Act mapping changed. |

## Product closure

No product code changed. The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with AMC-owned synthetic fixture data.

The positive path proves EPANET-Agentic source context can be cited only when AMC-owned replay rows include replay manifest, fixture hash, fixed seed, source refs, baseline/candidate evidence, signed evidence refs, Score/Shield/Watch coverage, row hashes, score delta, and CI receipt proof. The negative path fails closed when EPANET-Agentic metadata, DOI/PubMed/OpenAlex metadata, Water Research metadata, benchmark-network labels, task-category labels, tool-invocation labels, human-in-the-loop labels, and local backlog metadata replace an AMC-owned replay fixture.

## Fail-closed rule

EPANET-Agentic source identity, title, DOI reachability, DOI redirect, PubMed reachability, OpenAlex reachability, Crossref reachability, Water Research metadata, author metadata, publication dates, PMID, PII, open-access status, concept labels, benchmark-network labels, task-category labels, tool names, human-in-the-loop labels, success-rate labels, tool invocation accuracy labels, robustness labels, scalability labels, modularity labels, local backlog metadata, or source identity alone are not replay-corpus evidence.

Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, score delta, source refs, signed evidence refs, row hashes, CI or lifecycle receipt, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No EPANET-Agentic runner, EPANET simulator integration, hydraulic model adapter, water-distribution-network model loader, Water Research article importer, PubMed importer, Crossref importer, OpenAlex importer, DOI resolver, Elsevier API integration, benchmark-network importer, task-category importer, simulation-output loader, TaskExecutor adapter, CodeRunner adapter, DataAnalyzer adapter, human-intervention workflow, agent-task taxonomy, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific replay path was added.

No article text, abstract prose beyond short metadata facts, PubMed XML prose, Elsevier prose, benchmark-network data, EPANET files, simulator code, prompts, task rows, generated simulation outputs, figures, tables, model responses, workflows, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0987EpanetAgenticReplayCorpusBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0987-epanet-agentic-replay-corpus.md'`; 3 replay primitive tests passed.
- Focused regression: `npx vitest run tests/gap0987EpanetAgenticReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0986AffectiveComputingPublicMethodologyBoundary.test.ts tests/gap0987EpanetAgenticReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 834 files / 7,331 tests.
