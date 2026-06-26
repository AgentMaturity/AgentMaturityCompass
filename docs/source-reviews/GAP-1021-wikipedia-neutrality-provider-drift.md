# GAP-1021 - Wikipedia neutrality provider drift

- Gap: `GAP-1021`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Seeing Like an AI: How LLMs Apply (and Misapply) Wikipedia Neutrality Norms`
- Retrieval: OpenAlex API, DOI headers, Crossref API, AAAI OJS article/PDF endpoints, and arXiv API on 2026-06-24
- Status: Done

## Relevance decision

`GAP-1021` is relevant to AMC through provider/model drift only. The source studies whether LLMs apply Wikipedia-style neutrality rules consistently, which is useful context for model-update canaries where behavior could drift across bias detection, neutrality rewriting, over-editing, refusal, safety, latency, or cost metrics.

The source does not justify a Wikipedia policy engine, NPOV classifier, paper importer, dataset mirror, benchmark runner, content moderation subsystem, or source-specific provider adapter. It is source-review context only. AMC can attach the paper/DOI/arXiv refs to an AMC-owned provider-drift canary pack, but only if the pack includes signed canary evidence, drift statistics, replayable row hashes, observability proof, and CI/lifecycle gates.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through benchmark-backed provider/model drift receipts for norm-application canaries. |
| Shield | Relevant when bias, refusal, invalid-action, or guardrail metrics are supported by signed evidence. |
| Enforce | Not changed; no policy enforcement hook or NPOV moderation rule was added. |
| Vault | Not changed; no Wikipedia edits, paper data, or participant/crowd-worker data were imported. |
| Watch | Relevant through existing drift alert projection and waiver/fail-closed lifecycle behavior. |
| Fleet | Not changed; no fleet orchestration or human-editor workflow was added. |
| Passport | Not changed; paper metadata is not portable trust proof. |
| Comply | Not changed; no legal, content-governance, or platform-policy compliance mapping was added. |

## Product closure

The existing provider drift primitive already satisfies the acceptance criteria for this gap:

- `runProviderDriftBenchmark` compares baseline and candidate provider/model canary rows and requires provider/model version, canary results, signed evidence, evaluator configuration, observability proof, and threshold policy.
- `buildProviderDriftEvalPack` creates replayable row-hashed eval-pack rows with source refs.
- `buildProviderDriftWatchAlerts` projects failing comparisons or missing evidence into Watch alerts.
- `buildProviderDriftCiGate` fails closed when evidence is incomplete.

The regression uses an AMC-owned synthetic Wikipedia-neutrality canary packet and a metadata-only negative packet. No product code changed because the current generic provider drift path already produces the requested provider version, canary results, drift statistic, and alert or waiver proof.

## Live source facts

- OpenAlex work: `https://openalex.org/W4400434455`.
- OpenAlex API: `https://api.openalex.org/works/W4400434455`.
- DOI: `10.1609/icwsm.v20i1.42630` at `https://doi.org/10.1609/icwsm.v20i1.42630`.
- DOI resolves with HTTP 302 to `https://ojs.aaai.org/index.php/ICWSM/article/view/42630`, which returned HTTP 200 during retrieval.
- Publisher article page: `https://ojs.aaai.org/index.php/ICWSM/article/view/42630`.
- Crossref API: `https://api.crossref.org/works/10.1609/icwsm.v20i1.42630`.
- Crossref PDF link: `https://ojs.aaai.org/index.php/ICWSM/article/download/42630/50190`; PDF headers returned HTTP 200 and `content-type: application/pdf`.
- Venue: `Proceedings of the International AAAI Conference on Web and Social Media`.
- Publication metadata: publication_date `2026-05-25`, OpenAlex type `preprint`, Crossref type `journal-article`, volume `20`, issue `1`, pages `146-173`, cited_by_count `1`.
- Authors from OpenAlex/Crossref include Joshua Ashkinaze, Ruijia Guan, Laura Kurek, Eytan Adar, Ceren Budak, and Eric S Gilbert; OpenAlex listed University of Michigan affiliations.
- Concepts from OpenAlex include Neutrality, Political science, Net neutrality, Psychology, Internet privacy, Computer science, World Wide Web, and Law.
- Abstract-level facts reviewed only as metadata: the paper is about LLMs applying Wikipedia Neutral Point of View / NPOV norms, with reported values including 64%, 79%, 70%, and 61%. These values were not copied into any scoring logic or benchmark rows.
- OpenAlex locations also include arXiv `2407.04183v5`, `http://arxiv.org/abs/2407.04183v5`, `https://arxiv.org/pdf/2407.04183`, and `https://doi.org/10.48550/arxiv.2407.04183`.
- arXiv API categories include `cs.CL`, `cs.AI`, `cs.CY`, and `cs.HC`; the arXiv record was first published `2024-07-04T23:05:58Z` and updated `2026-05-07T22:23:58Z`.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, publisher page availability, PDF availability, arXiv metadata, abstract-derived percentages, author/venue/page metadata, concept labels, NPOV labels, Wikipedia labels, bias-detection labels, rewrite labels, crowd-worker labels, editor-workflow labels, moderation-workload labels, local backlog text, or source identity cannot prove AMC provider drift.

Passing evidence requires AMC-owned provider/model version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows with row hashes, evaluator configuration, observability trace and metric report evidence, threshold policy, Watch alert or waiver, CI/lifecycle gate result, and no-copy proof.

## No-bloat boundary

No paper importer, Wikipedia policy engine, NPOV classifier, bias detector, neutrality rewriter, content moderation subsystem, crowd-worker workflow, editor workflow, dataset mirror, benchmark runner, publisher scraper, PDF parser, arXiv importer, DOI adapter, Crossref adapter, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, package dependency, copied paper prose, copied abstract text, copied tables, copied figures, copied prompts, copied examples, copied edits, copied editor rewrites, copied datasets, copied survey material, copied model outputs, copied annotations, copied screenshots, or source-specific provider-drift module was added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1021WikipediaNeutralityProviderDriftBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 provider-drift primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W4400434455`
  - `curl -I -L https://doi.org/10.1609/icwsm.v20i1.42630`
  - `curl -fsSL https://api.crossref.org/works/10.1609/icwsm.v20i1.42630`
  - `curl -I -L https://ojs.aaai.org/index.php/ICWSM/article/download/42630/50190`
  - `curl -fsSL 'https://export.arxiv.org/api/query?id_list=2407.04183'`
  - `curl -I -L https://arxiv.org/pdf/2407.04183`
  - `curl -I -L https://doi.org/10.48550/arxiv.2407.04183`
- `npx vitest run tests/gap1021WikipediaNeutralityProviderDriftBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1020AgentCpmProviderDriftBoundary.test.ts tests/gap1021WikipediaNeutralityProviderDriftBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts`: PASS, no Wikipedia-neutrality source identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 868 files / 7,459 tests.
