# GAP-1023 - AI agent behavioral science provider drift

- Gap: `GAP-1023`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `AI agent behavioral science`
- Retrieval: OpenAlex API, DOI headers, Crossref API, Nature article metadata, Nature PDF headers, and local backlog metadata on 2026-06-24
- Status: Done

## Relevance decision

`GAP-1023` is relevant to AMC only through existing provider/model drift receipts. The paper is behavioral-science context for observing agent behavior across planning, adaptation, social dynamics, individual agent, multi-agent, and human-agent settings. That can inform what a provider-drift canary packet measures, but it does not create a new AMC behavioral-science product area.

The source does not justify adding a psychology model, behavioral simulation engine, multi-agent research program, human-subject workflow, paper importer, or provider-specific adapter. AMC should accept it only as a source ref attached to AMC-owned canary evidence with provider version, canary results, drift statistic, signed evidence, replayable row hashes, Watch projection, and CI/lifecycle gates.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through benchmark-backed provider/model drift receipts for agent behavior canaries. |
| Shield | Relevant when behavioral safety, refusal, invalid-action, or guardrail metrics are signed and replayable. |
| Enforce | Not changed; no runtime policy or behavioral intervention engine was added. |
| Vault | Not changed; no article body, PDF content, human-subject data, or behavioral dataset was imported. |
| Watch | Relevant through existing drift alert projection and waiver/fail-closed lifecycle behavior. |
| Fleet | Not changed; no multi-agent behavioral simulation or fleet topology feature was added. |
| Passport | Not changed; paper metadata is not portable trust proof. |
| Comply | Not changed; no research-ethics, privacy, or behavioral-science compliance mapping was added. |

## Product closure

The existing AMC provider drift primitive already satisfies the requested path:

- `runProviderDriftBenchmark` compares baseline/candidate provider canary rows and requires provider/model version, canary results, signed evidence, evaluator configuration, observability evidence, and threshold policy.
- `buildProviderDriftEvalPack` emits replayable row-hashed eval-pack rows with source refs.
- `buildProviderDriftWatchAlerts` projects failing comparisons or missing evidence into Watch.
- `buildProviderDriftCiGate` fails closed when evidence is incomplete.

The regression uses an AMC-owned synthetic behavioral-agent canary packet and a metadata-only negative packet. No product code changed because the current generic provider drift path already produces provider version, canary results, drift statistic, and alert or waiver proof.

## Live source facts

- OpenAlex work: `https://openalex.org/W4417116172`.
- OpenAlex API: `https://api.openalex.org/works/W4417116172`.
- DOI: `10.1057/s41599-026-07316-7` at `https://doi.org/10.1057/s41599-026-07316-7`.
- Crossref API: `https://api.crossref.org/works/10.1057/s41599-026-07316-7`.
- Nature article page: `https://www.nature.com/articles/s41599-026-07316-7`.
- OpenAlex PDF URL: `https://www.nature.com/articles/s41599-026-07316-7_reference.pdf`.
- Nature citation PDF metadata also advertised `https://www.nature.com/articles/s41599-026-07316-7.pdf`.
- Venue: `Humanities and Social Sciences Communications`.
- Publication metadata: publication_date `2026-04-28`, OpenAlex type `article`, Crossref type `journal-article`, oa_status `gold`, cited_by_count `1`.
- License metadata: Crossref and Nature metadata indicate Creative Commons Attribution 4.0.
- DOI headers resolved through Nature identity-cookie redirects and returned HTTP 200 for the article page.
- PDF headers returned `content-type: application/pdf`, content-length: 1945590, and last-modified: Tue, 28 Apr 2026 06:26:25 GMT.
- Authors include Lin Chen, Yunke Zhang, Jie Feng, Haoye Chai, Honglin Zhang, Bingbing Fan, Yibo Ma, Shiyuan Zhang, Nian Li, Tianhui Liu, Nicholas Sukiennik, Keyu Zhao, Yu Li, Ziyi Liu, Fengli Xu, and Yong Li. OpenAlex listed the seventh author as Youguang Ma, while Nature/Crossref listed Yibo Ma; the source-review note preserves the discrepancy as metadata only.
- Institutions include Hong Kong University of Science and Technology and Tsinghua University.
- OpenAlex concepts include Perspective (graphical), Cognitive science, Behavioural sciences, Psychology, Computer science, Autonomous agent, Behavioral analysis, Artificial intelligence, Behavioral pattern, Social relation, Intelligent agent, Data science, Cognitive psychology, Scientific modelling, Behavioral economics, and Behavioral modeling.
- Article metadata/abstract keywords reviewed only as metadata include LLMs, AI agents, human-like behavior, agentic systems, interventions, individual agent, multi-agent, human-agent, behavioral analysis, model-centric approaches, and responsible AI.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Crossref metadata, Nature article metadata, PDF availability, CC-BY license metadata, title, authors, institutions, venue, concept labels, abstract keywords, behavioral-science labels, individual-agent labels, multi-agent labels, human-agent labels, responsible-AI labels, local backlog text, or source identity cannot prove AMC provider drift.

Passing evidence requires AMC-owned provider/model version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows with row hashes, evaluator configuration, observability trace and metric report evidence, threshold policy, Watch alert or waiver, CI/lifecycle gate result, and no-copy proof.

## No-bloat boundary

No behavioral-science subsystem, psychology model, behavioral simulation engine, multi-agent simulator, human-agent experiment harness, intervention engine, responsible-AI framework, paper importer, Nature scraper, PDF parser, Crossref adapter, DOI adapter, behavioral dataset, model-centric evaluation framework, API route, CLI command, Studio panel, Watch monitor, Shield detector, Score method, package dependency, copied article prose, copied abstract text, copied figures, copied tables, copied models, copied intervention designs, copied behavioral taxonomies, copied research agenda, copied screenshots, or source-specific provider-drift module was added.

The paper remains source-review signal only.

## Verification

- TDD expected failure before doc creation: `npx vitest run tests/gap1023AiAgentBehavioralScienceProviderDriftBoundary.test.ts --reporter=dot` failed only because this document did not exist; 3 provider-drift primitive tests passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W4417116172`
  - `curl -I -L https://doi.org/10.1057/s41599-026-07316-7`
  - `curl -fsSL https://api.crossref.org/works/10.1057/s41599-026-07316-7`
  - `curl -I -L https://www.nature.com/articles/s41599-026-07316-7_reference.pdf`
  - `curl -fsSL -A 'Mozilla/5.0' https://www.nature.com/articles/s41599-026-07316-7`
- `npx vitest run tests/gap1023AiAgentBehavioralScienceProviderDriftBoundary.test.ts --reporter=dot`: PASS, 1 file / 4 tests.
- `npx vitest run tests/gap1021WikipediaNeutralityProviderDriftBoundary.test.ts tests/gap1023AiAgentBehavioralScienceProviderDriftBoundary.test.ts --reporter=dot`: PASS, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: PASS.
- Narrow no-bloat token scan over `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, and `src/api/benchmarkRouter.ts`: PASS, no AI-agent-behavioral-science source identifiers.
- `npm run typecheck`: PASS.
- `npm test -- --reporter=dot`: PASS, 870 files / 7,467 tests.
