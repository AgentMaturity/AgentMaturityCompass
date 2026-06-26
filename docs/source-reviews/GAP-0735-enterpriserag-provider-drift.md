# GAP-0735 - EnterpriseRAG-Bench provider-drift boundary

- Gap: `GAP-0735`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/onyx-dot-app/EnterpriseRAG-Bench`
- Retrieval: `2026-06-21` via live GitHub repository page review; shell network remains DNS-restricted in this environment.
- Status: closed through existing provider/model drift benchmark receipts; no EnterpriseRAG-Bench integration, dataset mirror, leaderboard adapter, or RAG benchmark runner added.

## Live source metadata

The live GitHub source identifies `onyx-dot-app/EnterpriseRAG-Bench` as a dataset and benchmark for RAG on company internal documents. Relevant source-review signals include an enterprise-search/RAG benchmark, synthetic enterprise data from Redwood Inference, roughly `500,000` files, `500` questions, `100` metadata-dependent questions, `10` categories, source-like channels such as Slack, Gmail, Linear, Google Drive, HubSpot, Fireflies, GitHub, Jira, and Confluence, leaderboard/reproducibility guidance, benchmark setup instructions, and MIT licensing.

These facts are relevant to AMC only as provider/model drift benchmark context. Enterprise RAG benchmarks highlight why model/provider updates need recurring canary rows with provider version, generated test data, evaluator config, metric ids, trajectory counts, trace exports, metric reports, pipeline config, alert or waiver proof, and signed evidence. They do not justify importing EnterpriseRAG-Bench, mirroring its files/questions, running its leaderboard, copying source connectors, or claiming benchmark parity. No upstream README prose beyond minimal metadata facts, dataset rows, synthetic files, questions, source-channel data, setup commands, leaderboard rows, model results, configs, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0735 is relevant to AMC through existing provider and model drift benchmark receipts because RAG answer quality can change across providers, model versions, retrievers, metadata filters, and enterprise-source distributions. The accepted AMC primitive is already `runProviderDriftBenchmark` with provider version, canary result, drift statistic, alert/waiver, eval-pack, Watch alert, and CI gate evidence.

The source can be retained only as context when the provider-drift packet carries AMC-owned evaluator config, generated test data, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and no-copy proof. Repository, README, star/fork/license, file-count, question-count, source-channel, metadata-question, leaderboard, or benchmark labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider/model canary comparisons, score deltas, and replayable eval-pack rows. |
| Shield | Relevant through fail-closed checks for missing signed evidence, evaluator proof, generated test data, trace exports, and metric reports. |
| Watch | Relevant through provider-drift Watch alerts and CI/lifecycle gates. |
| Enforce | No runtime retriever, connector, metadata-filter, or policy-enforcement behavior changed. |
| Vault | No enterprise documents, questions, metadata, connector payloads, credentials, or secure-storage behavior changed. |
| Fleet | RAG benchmark context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or benchmark credential changed. |
| Comply | Enterprise-data benchmark context only; no compliance mapping changed. |

## Product closure

GAP-0735 is closed by documenting the live-source boundary and adding regression coverage over the existing provider-drift primitive. The positive path proves that EnterpriseRAG-Bench-style enterprise RAG context can be cited only with AMC-owned canary rows, provider/model versions, evaluator proof, observability proof, source refs, signed evidence, eval-pack rows, and CI gate proof. The negative path proves GitHub/README/benchmark metadata fails closed.

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, EnterpriseRAG-Bench adapter, dataset mirror, synthetic-data importer, question importer, metadata-question evaluator, connector importer, leaderboard adapter, RAG benchmark runner, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0735.

## Fail-closed rule

Repository identity, repository URL, README labels, EnterpriseRAG-Bench labels, enterprise-search labels, RAG labels, synthetic-data labels, file-count labels, question-count labels, metadata-dependent-question labels, source-channel labels, Slack/Gmail/Linear/Google Drive/HubSpot/Fireflies/GitHub/Jira/Confluence labels, leaderboard labels, setup labels, MIT license labels, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider/model versions, canary rows, evaluator config hash, generated test data hash, metric ids, trajectory counts, trace exports, metric reports, pipeline config, source refs, signed evidence refs, row hashes, Watch alerts or waivers, and CI/lifecycle gate proof.

## No-bloat boundary

No EnterpriseRAG-Bench integration, dataset mirror, synthetic-data importer, question importer, metadata-question evaluator, connector importer, Slack/Gmail/Linear/Google Drive/HubSpot/Fireflies/GitHub/Jira/Confluence adapter, leaderboard adapter, RAG benchmark runner, retriever runner, metadata parser, provider adapter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, dataset rows, synthetic files, questions, source-channel data, setup commands, leaderboard rows, model results, configs, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0735EnterpriseRagProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
