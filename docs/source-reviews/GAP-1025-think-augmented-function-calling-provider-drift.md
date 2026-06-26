# GAP-1025 - Think-augmented function-calling provider-drift boundary

- Gap: `GAP-1025`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Think-Augmented Function Calling: Improving LLM Parameter Accuracy through Embedded Reasoning`
- Retrieval: live OpenAlex API, DOI headers, Crossref API, IEEE Xplore headers, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

The paper is relevant to AMC only as source-review context for provider/model drift canaries that test function calling, argument selection, schema adherence, parameter accuracy, and embedded reasoning behavior. It maps to the existing AMC Score/Shield/Watch provider-drift primitive because AMC already requires provider version, canary results, signed evidence, drift statistic, and Watch alert or waiver before a provider-drift claim can pass.

Live source metadata verified:

- OpenAlex work: `https://openalex.org/W7155089383`
- OpenAlex API: `https://api.openalex.org/works/W7155089383`
- DOI: `https://doi.org/10.1109/icassp55912.2026.11462757`
- DOI value: `10.1109/icassp55912.2026.11462757`
- Crossref API: `https://api.crossref.org/works/10.1109/icassp55912.2026.11462757`
- IEEE Xplore landing URL: `https://ieeexplore.ieee.org/document/11462757/`
- Title: `Think-Augmented Function Calling: Improving LLM Parameter Accuracy through Embedded Reasoning`
- OpenAlex publication_date `2026-04-21`
- OpenAlex type `article`
- OpenAlex language `null`
- OpenAlex open-access state: is_oa `false`, oa_status `closed`, any_repository_has_fulltext `false`
- OpenAlex primary location raw source: `ICASSP 2026 - 2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)`
- OpenAlex raw_type `proceedings-article`
- OpenAlex locations_count `1`
- OpenAlex cited_by_count `1`
- Crossref type `proceedings-article`
- Crossref publisher `IEEE`
- Crossref issued `2026-05-03`
- Crossref event: `ICASSP 2026 - 2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)`, Barcelona, Spain
- Crossref event dates `2026-05-03` to `2026-05-08`
- Crossref page `5676-5680`
- Crossref reference-count `17`
- Crossref is-referenced-by-count `1`
- Crossref prefix `10.1109`
- DOI headers returned HTTP/2 302 to IEEE Xplore.
- IEEE Xplore direct headers returned HTTP/2 202 with `x-amzn-waf-action: challenge`, so publisher body content was not retrieved or copied.
- Authors: Lei Wei, Jinpeng Ou, Xiao Peng, Bin Wang
- Institution observed in OpenAlex metadata: Peking University
- OpenAlex concepts include Computer science, Artificial intelligence, Algorithm, Software, and Control engineering.

The paper metadata can help frame AMC-owned function-calling provider-drift canaries, but it is not provider-drift evidence. Because OpenAlex marks the work closed access and IEEE Xplore returned a WAF challenge, AMC must not claim method-level or benchmark-parity proof from inaccessible article contents.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when AMC computes score deltas from replayable function-calling canary rows with signed evidence. |
| Shield | Relevant only when function-call misuse, invalid arguments, unsafe tool use, refusal, or guardrail outcomes are measured in AMC-owned evidence. |
| Enforce | No runtime enforcement change; existing CI/lifecycle gates fail closed when evidence is missing. |
| Vault | No secrets, DLP, privacy, or storage change. |
| Watch | Relevant when provider/version changes produce Watch drift alerts or documented waivers. |
| Fleet | Contextual only for tool-using agents; no orchestration or tool benchmark subsystem was added. |
| Passport | No external proof-token change. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1025 is closed by documenting the relevance boundary and adding regression coverage that proves:

- existing `runProviderDriftBenchmark` can represent function-calling provider-drift canaries with source refs attached to AMC-owned evidence;
- `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` preserve replayable receipts, Watch alert behavior, and fail-closed CI behavior;
- OpenAlex, DOI, Crossref, IEEE Xplore, title, authors, venue, page range, event metadata, citations, concepts, closed-access metadata, WAF headers, function calling, parameter accuracy, or embedded reasoning framing cannot replace AMC-owned signed drift evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if used without AMC-owned provider-drift proof:

- OpenAlex metadata, DOI redirect, Crossref metadata, IEEE Xplore landing headers, closed-access status, WAF challenge headers, title, authors, institution, venue, event location/dates, page range, reference count, citation count, concepts, backlog row, or function-calling terminology.

A passing AMC provider-drift claim must include provider version, canary results, drift statistic, alert or waiver, replayable eval-pack rows, row hashes, signed evidence refs, evaluator config hash, generated test data hash, observability trace export, metric report, thresholds, and CI/lifecycle gate outcome.

## No-bloat boundary

AMC did not add a function-calling benchmark clone, embedded-reasoning subsystem, parameter-accuracy runner, IEEE scraper, DOI adapter, Crossref adapter, paper importer, abstract parser, tool-call simulator, schema benchmark, prompt template, model wrapper, API route, CLI command, Studio panel, Watch panel, dependency, copied abstract text, copied method text, copied figures, copied tables, copied formulas, copied examples, copied prompts, copied benchmark rows, copied screenshots, copied configs, or source-specific provider-drift module.

External sources remain source-review signals only. AMC’s product primitive remains generic provider-drift evidence over Score/Shield/Watch.

## Verification

- `curl -sS https://api.openalex.org/works/W7155089383 | jq ...` passed.
- `curl -sSIL https://doi.org/10.1109/icassp55912.2026.11462757 | sed -n '1,80p'` passed.
- `curl -sS https://api.crossref.org/works/10.1109/icassp55912.2026.11462757 | jq ...` passed.
- `curl -sSI https://ieeexplore.ieee.org/document/11462757/ | sed -n '1,80p'` passed and returned an IEEE Xplore WAF challenge.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 provider-drift primitive tests passed.
- `npx vitest run tests/gap1025ThinkAugmentedFunctionCallingProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1024TheAgentCompanyProviderDriftBoundary.test.ts tests/gap1025ThinkAugmentedFunctionCallingProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts` found no GAP-1025 think-augmented function-calling identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 872 files / 7,475 tests.
