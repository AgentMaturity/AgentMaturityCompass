# GAP-1033 - All Futures provider-drift boundary

- Gap: `GAP-1033`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `All Futures at Once: Supporting Speculative Design for Placemaking with Multi-Agent Social Simulation`
- Retrieval: live OpenAlex work/API metadata, DOI redirect headers, Crossref API metadata, ACM landing-page headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

`All Futures at Once: Supporting Speculative Design for Placemaking with Multi-Agent Social Simulation` is relevant to AMC only as source-review context for multi-agent social-simulation canaries. It is not itself a provider/model drift benchmark, runtime, dataset, or scoring system. The AMC-relevant lesson is bounded: if a provider or model change is assessed on social simulation or participatory design tasks, AMC must still require provider version, canary results, drift statistic, signed evidence rows, replayable eval-pack rows, observability evidence, thresholds, and Watch alert or waiver before a provider-drift claim can pass.

Live source metadata verified:

- OpenAlex work: `https://openalex.org/W7154019849`
- OpenAlex API: `https://api.openalex.org/works/W7154019849`
- DOI: `https://doi.org/10.1145/3772318.3791543`
- DOI value: `10.1145/3772318.3791543`
- Crossref API: `https://api.crossref.org/works/10.1145/3772318.3791543`
- ACM landing page: `https://dl.acm.org/doi/10.1145/3772318.3791543`
- Title: `All Futures at Once: Supporting Speculative Design for Placemaking with Multi-Agent Social Simulation`
- OpenAlex publication year `2026`
- OpenAlex publication date `2026-04-13`
- OpenAlex type `article`
- Crossref type `proceedings-article`
- Crossref container: `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`
- Crossref publisher `ACM`
- Crossref pages `1-20`
- OpenAlex open access `gold`
- OpenAlex primary-location license `cc-by`
- OpenAlex referenced_works_count `72`
- OpenAlex cited_by_count `1`
- Crossref reference_count `91`
- Crossref is_referenced_by_count `0`
- OpenAlex authorship/institution metadata includes Jiayang Li, Jiarui Jiang, Shuqi Tang, Mutao Yu, Xinyuan Song, Caoyang Xue, Yunsheng Su, Xinyang Tan, Yang Shi, Tongji University, and Shanghai Jiao Tong University
- OpenAlex concept labels include Placemaking, Futures contract, Computer science, Human-computer interaction, Diversity, Data science, Stakeholder, Social dynamics, Sociology, and Architecture
- DOI redirect returned HTTP/2 302 to the ACM landing page
- ACM landing page returned HTTP/2 403 with Cloudflare challenge headers in this environment, so ACM page content was not treated as inspected evidence

The source is not a reason to add a paper importer, DOI adapter, Crossref adapter, OpenAlex adapter, ACM scraper, social-simulation subsystem, placemaking simulator, participatory-design benchmark, stakeholder-modeling engine, multi-agent social simulation runtime, dataset clone, paper-derived metric, API route, CLI command, Studio panel, Watch panel, or source-specific provider-drift module. AMC can reference this paper only as context attached to AMC-owned provider-drift receipts.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC-owned provider/model canary rows measure social-simulation task outcomes with signed evidence and regression thresholds. |
| Shield | Relevant only when stakeholder, participatory-risk, unsafe-suggestion, refusal, or invalid-action drift is captured in AMC-owned signed evidence. |
| Enforce | No runtime enforcement change; CI/lifecycle provider-drift gates already fail closed through the existing primitive. |
| Vault | No secrets, dataset storage, privacy, or retention change. |
| Watch | Relevant only when provider-drift results emit Watch alerts or documented waivers from AMC-owned evidence. |
| Fleet | Contextual only for multi-agent simulation; no orchestration/runtime subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1033 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing provider-drift primitives can represent social-simulation canaries only through AMC-owned signed rows;
- provider version, canary results, drift statistic, evaluator config, generated test data hash, verdict aggregation, dashboard artifact, pipeline run, experiment run, observability project, trace export, metric report, replayable eval-pack row hashes, source refs, thresholds, and CI/lifecycle gate outcomes are preserved;
- OpenAlex metadata, DOI redirects, Crossref metadata, ACM landing-page headers, concept labels, author/institution labels, venue labels, local backlog text, or paper identity cannot replace AMC-owned provider-drift proof.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned provider-drift proof:

- OpenAlex work/API metadata, DOI redirect headers, Crossref metadata, ACM landing-page headers, title, abstract/category/concept labels, publication date, venue, publisher, author/institution metadata, citation/reference counts, open-access labels, license labels, local backlog text, or paper identity.

A passing AMC provider-drift claim must include provider version, baseline and candidate canary rows, sample size, trajectory count, drift statistic, signed evidence refs, evaluator/framework evidence, observability/pipeline evidence, replayable eval-pack rows, row hashes, thresholds, and Watch alert or waiver.

## No-bloat boundary

AMC did not add a paper importer, DOI adapter, Crossref adapter, OpenAlex adapter, ACM scraper, social-simulation subsystem, placemaking simulator, speculative-design simulator, participatory-design benchmark, stakeholder-modeling engine, multi-agent social simulation runtime, dataset clone, paper-derived metric, paper-derived prompt, package dependency, API route, CLI command, Studio panel, Watch panel, source-specific provider-drift module, copied abstract prose, copied paper prose, copied method prose, copied examples, copied figures, copied tables, copied study data, copied prompts, copied screenshots, copied configs, copied source code, copied model outputs, or copied generated state.

External sources remain source-review signals only. AMC's product primitive remains generic provider/model drift evidence over Score/Shield/Watch.

## Verification

- `curl -sS https://api.openalex.org/works/W7154019849 | jq ...` passed.
- `curl -sSIL -L https://doi.org/10.1145/3772318.3791543 | sed -n '1,120p'` passed; DOI redirect and ACM 403 challenge headers were recorded.
- `curl -sS https://api.crossref.org/works/10.1145/3772318.3791543 | jq ...` passed.
- `curl -sSIL https://dl.acm.org/doi/10.1145/3772318.3791543 | sed -n '1,100p'` returned HTTP/2 403 with Cloudflare challenge headers.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1033AllFuturesProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1033AllFuturesProviderDriftBoundary.test.ts tests/gap1032MlgymProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over provider-drift implementation files found no GAP-1033 paper identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 880 files / 7,506 tests.
