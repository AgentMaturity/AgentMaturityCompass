# GAP-1048 - SMT-solving provider drift

- Gap: `GAP-1048`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `LLM-Guided Quantified SMT Solving over Uninterpreted Functions`
- Retrieval: OpenAlex work API, Crossref work API, DOI redirect headers, AAAI publisher article metadata, AAAI article headers, PDF headers, and local backlog metadata on 2026-06-25
- Status: Done

## Relevance decision

`GAP-1048` is relevant to AMC only through the existing provider/model drift benchmark primitive. The source is a paper-backed formal-reasoning signal, and the backlog asks for provider version, canary results, drift statistic, and alert or waiver. That maps to AMC's existing Score, Shield, and Watch provider-drift receipts: provider/version comparison rows, replayable eval packs, signed evidence refs, source refs, row hashes, thresholds, Watch alerts, and CI/lifecycle fail-closed gates.

The source does not justify adding an SMT solver, quantified-SMT runner, uninterpreted-functions implementation, theorem prover, symbolic-execution path, quantifier-elimination implementation, solver adapter, AAAI importer, DOI importer, OpenAlex importer, Crossref importer, PDF parser, source-specific provider-drift module, API route, CLI command, Studio surface, package dependency, benchmark dataset, solver output, formula corpus, or copied paper method to AMC. The paper metadata can only be attached as source-review context to AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider-drift canary rows show score, refusal, invalid-action, artifact-accuracy, formula-integrity, latency, and cost stability across provider/model versions. |
| Shield | Relevant only as an assurance boundary for formal-reasoning claims; metadata-only or unsigned claims fail closed. |
| Enforce | No runtime enforcement change; existing provider-drift CI/lifecycle gates already reject incomplete receipts. |
| Vault | No secrets, datasets, formulas, prompts, traces, paper content, or solver artifacts were imported or stored. |
| Watch | Relevant when provider/model changes produce Watch alerts or documented waivers tied to signed drift evidence. |
| Fleet | Contextual only for agent-evaluation maturity; no solver fleet, orchestration path, or source-specific runtime was added. |
| Passport | No proof-token schema change; existing proof bundles can carry provider-drift receipts. |
| Comply | No compliance mapping or public methodology version change. |

## Product closure

No product code change was needed. GAP-1048 is closed by documenting the relevance boundary and adding regression coverage that proves the existing AMC provider-drift primitive can represent formal-reasoning canaries without adding source-specific machinery:

- `runProviderDriftBenchmark` accepts AMC-owned baseline and candidate rows with provider version, canary results, metric suite, evaluator configuration hash, generated test data hash, observability pipeline evidence, signed evidence refs, and threshold policy.
- `buildProviderDriftEvalPack` preserves replayable eval-pack rows, source refs, and row hashes.
- `buildProviderDriftWatchAlerts` and `buildProviderDriftCiGate` keep Watch and CI/lifecycle behavior fail-closed when required evidence is incomplete.
- OpenAlex, DOI, Crossref, AAAI, paper title, author, topic, and PDF metadata cannot replace AMC-owned provider-drift proof.

## Live source facts

- OpenAlex work page: `https://openalex.org/W7137989388`.
- OpenAlex API: `https://api.openalex.org/works/W7137989388`.
- DOI URL: `https://doi.org/10.1609/aaai.v40i17.38445`.
- DOI value: `10.1609/aaai.v40i17.38445`.
- Crossref API: `https://api.crossref.org/works/10.1609/aaai.v40i17.38445`.
- AAAI publisher page: `https://ojs.aaai.org/index.php/AAAI/article/view/38445`.
- AAAI PDF URL from publisher metadata: `https://ojs.aaai.org/index.php/AAAI/article/download/38445/42407`.
- Title: `LLM-Guided Quantified SMT Solving over Uninterpreted Functions`.
- Proceedings venue: `Proceedings of the AAAI Conference on Artificial Intelligence`.
- Publisher: `Association for the Advancement of Artificial Intelligence`.
- OpenAlex metadata reported publication_date `2026-03-14`, OpenAlex type `article`, is_oa `true`, open access status `diamond`, cited_by_count `1`, volume `40`, issue `17`, and pages `14304-14312`.
- Crossref metadata reported Crossref type `journal-article`, the same DOI, the same proceedings title, volume `40`, issue `17`, and pages `14304-14312`.
- OpenAlex authors reviewed: Kunhang Lv, Yuhang Dong, Rui Han, Fuqi Jia, Feifei Ma, and Jian Dong Zhang.
- Publisher citation metadata reviewed: Kunhang Lv, Yuhang Dong, Rui Han, Fuqi Jia, Feifei Ma, and Jian Zhang.
- OpenAlex topics and concepts reviewed as source-review context: Constraint Satisfaction and Optimization, Formal Methods in Verification, Polynomial and algebraic computation, Satisfiability modulo theories, Soundness, Automated reasoning, Quantifier elimination, Symbolic execution, and Lazy evaluation.
- DOI header retrieval returned `HTTP/2 302` to the AAAI publisher article page and then `HTTP/2 200`.
- AAAI article headers returned `HTTP/2 200` and `content-type: text/html; charset=utf-8`.
- AAAI PDF headers returned `HTTP/2 200`, `content-type: application/pdf`, and attachment filename `18066-AAAI26.LvK-CS.pdf`.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, AAAI page metadata, PDF availability, paper title, author list, proceedings venue, publisher, publication date, open-access status, cited-by count, volume, issue, pages, topic tags, concept tags, local backlog text, or source identity cannot prove provider drift.

A passing AMC provider-drift claim must include AMC-owned provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, source refs, evaluator config hash, generated test data hash, metric suite, sample and trajectory counts, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome. If any of those are missing, incomplete, unsigned, non-replayable, or replaced by paper metadata, the result fails closed.

## No-bloat boundary

AMC did not add an SMT solver subsystem, quantified-SMT benchmark runner, uninterpreted-functions implementation, theorem prover, symbolic-execution implementation, quantifier-elimination implementation, solver adapter, AAAI importer, DOI importer, OpenAlex importer, Crossref importer, PDF parser, source-specific provider-drift module, source-specific Watch monitor, source-specific Shield verifier, API route, CLI command, Studio panel, methodology version bump, package dependency, copied paper prose, copied abstract, copied formulas, copied prompts, copied solver instances, copied reasoning traces, copied benchmark rows, copied datasets, copied tables, copied figures, copied configs, copied solver outputs, copied evaluation scripts, or copied implementation details.

The paper remains source-review signal only. AMC's product primitive remains the generic Score/Shield/Watch provider-drift evidence path.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1048SmtSolvingProviderDriftBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 provider-drift primitive tests passed.
- Live source retrieval:
  - `curl -sS https://api.openalex.org/works/W7137989388`
  - `curl -sS https://api.crossref.org/works/10.1609/aaai.v40i17.38445`
  - `curl -I -L https://doi.org/10.1609/aaai.v40i17.38445`
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/view/38445`
  - AAAI article metadata extraction for citation title, authors, DOI, proceedings title, volume, issue, pages, and PDF URL
  - `curl -I -L https://ojs.aaai.org/index.php/AAAI/article/download/38445/42407`
- `npx vitest run tests/gap1048SmtSolvingProviderDriftBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1028ClawProBenchProviderDriftBoundary.test.ts tests/gap1048SmtSolvingProviderDriftBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts`: PASS, no GAP-1048 SMT identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 895 files / 7,564 tests.
