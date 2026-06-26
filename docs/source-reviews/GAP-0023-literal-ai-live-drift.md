# GAP-0023 - Literal AI live-drift boundary

- Gap: `GAP-0023`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://literalai.com/`, `https://docs.literalai.com/`, `https://docs.literalai.com/get-started/overview`, `https://docs.literalai.com/more/migration-guide`, `https://docs.literalai.com/guides/dashboard`, `https://docs.literalai.com/guides/logs`, `https://docs.literalai.com/guides/scorers`, `https://docs.literalai.com/guides/online-evals`, `https://docs.literalai.com/guides/dataset`, `https://docs.literalai.com/guides/experiment`, `https://docs.literalai.com/guides/evaluation`, `https://docs.literalai.com/guides/continuous-improvement`, `https://docs.literalai.com/more/export-data`, and stale route `https://docs.literalai.com/guides/monitoring`
- Retrieval: live official pages fetched on 2026-06-26; rendered pages and `.md` documentation endpoints were used only as source-review metadata.
- Status: closed through existing AMC Watch live score and behavior drift receipts; no Literal AI integration or source-specific monitor added.

## Live source metadata

The backlog identifies Literal AI as competitor `COMP-019`, source URL `https://literalai.com`, category `Agent evaluation and benchmarks`, dimension `Live score and behavior drift alerts`, and requested Score, Shield, and Watch surfaces.

Live retrieval on 2026-06-26 found that the Literal AI root URL now returns HTTP 404 at `https://literalai.com/` with rendered-body first-200KB hash `a19d8ba6e0113132f05883c09a3646afc494025abba70ed647b0fd8cbaaee0ea`. The official docs root `https://docs.literalai.com/` returned HTTP 200 and redirected to `https://docs.literalai.com/more/migration-guide`, rendered-body first-200KB hash `3ee2372cfb4c0c325ad846edfb8571036042b181d9461a5a1f8cefd2d5017aca`. The docs migration guide says `Literal AI will be discontinued` and names service availability through `October 31st, 2025`.

The current official docs routes also returned HTTP 200:

- `https://docs.literalai.com/get-started/overview` rendered hash `d2e2b7811f701cd05ee7cb26195ca6cc883aefc930926af48c564e4bc961a439`; markdown hash `e2696bb294a58864c7a9945ec7e84cc12b4145906cc33ba2866e817158c8776e`.
- `https://docs.literalai.com/guides/dashboard` rendered hash `8d999b34a13f46ceaf71cc73d430a649945f88b962c346dbb9f372b786dba70c`; markdown hash `0b5d86b47a17a5237229ac833b335a83b157d3a3ab088928f6274db7ad758432`; includes `Monitor your AI application usage`.
- `https://docs.literalai.com/guides/logs` rendered hash `01c4781b6de8e6753bd14445a2d3bb7a828968e6bb234828c1335a074f9b1bb9`; markdown hash `0508f70a0f0125e011a9f65764a8b27828ec0b77279d0bd63548ce2aeff71a02`; includes `Logs are essential to monitor and improve your LLM app in production`.
- `https://docs.literalai.com/guides/scorers` rendered hash `bb51d27a0902cdd149d53fa523a93b580607f4b680a4e59783fb8142bcd6d11c`; markdown hash `e6642f27af6766485b8698cecfc94a40425c508a820fe86ec62136f1eb823bc2`.
- `https://docs.literalai.com/guides/online-evals` rendered hash `8d84f6f6448c87b453b1af06b588441ecdb1af24f6d609a5b4242d840d9548f3`; markdown hash `54b492db87c31b179edff785644ef421f0c934d8cc448469214ef6488c1b364d`; includes `Automatically evaluate your LLM logs in production` and `distribution of scores`.
- `https://docs.literalai.com/guides/dataset` rendered hash `b3380a5f20d9fc9e80a6025d3f5646406506c55f83d197bbb65e8d72e449e30d`; markdown hash `f55541e3d58075f1f50a3413e6b9569de14c70c7398dcd8f8f7fa35437bf1041`; includes `Datasets are collections of input/expected output samples`.
- `https://docs.literalai.com/guides/experiment` rendered hash `3624c82b368689dd072c3592e809d2f1b8df87445ade00ac55f0daab92f81697`; markdown hash `97cb84bc0dc2e1c1baa507ddbf7df469e4c1c4d2940ec8728e1683dcc761d632`; includes `Experiments enable continous improvement`.
- `https://docs.literalai.com/guides/evaluation` rendered hash `faab7b061065873bab6e7581ace580a23a1317895fbf3f1dd36d502e74a79175`; markdown hash `07ebcfd69f76c0359135a777358a0260e794009afce92f6300ce22efa1d34c47`; includes `evaluate your LLM applications and agents`.
- `https://docs.literalai.com/guides/continuous-improvement` rendered hash `7d194b0c48b916bd9200b45713d7b284e300d50065e8d960ec937f668caabbd5`; markdown hash `1ab19d1fa33d4032c1a624cf1f8624ddc9378a28b6f64dd136e1c9bce8b56269`; includes `Production Monitoring and Evaluation`.
- `https://docs.literalai.com/more/export-data` rendered hash `e23a6fa21ebc9c27a5c84518e88e0db4d939948ab414f83e7d87e08067ef007d`; markdown hash `3ddc89d5415653b2f250e358d529d2bab6be2deeb85f04bf9b07d09bf7994dd6`; includes `OpenTelemetry format`.

The prior local progress note listed `https://docs.literalai.com/guides/monitoring`, but live retrieval now returns HTTP 404 for that route. This stale route is a source-review fact only and cannot be treated as live monitoring evidence.

## Relevance decision

Literal AI is relevant to AMC only through existing Score, Shield, and Watch live score and behavior drift receipts. Its current official docs describe observability, production logs, online evaluations, score distributions, datasets, experiments, evaluation, continuous improvement, export, and a discontinuation/migration boundary. Those facts make it a useful source-review signal for live-drift requirements, but they do not prove AMC drift by themselves.

The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline windows, live windows, baseline distribution, live sample rows, score drift, behavior-signature drift, latency/cost/refusal/error shifts, alert receipt, source refs, receipt hash, row hashes, signed evidence refs, Watch alert projection, and fail-closed verification.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing score distributions and signed eval-row evidence. |
| Shield | Relevant when behavior drift indicates safety, refusal, invalid-action, or error drift; metadata-only source facts fail closed. |
| Enforce | No runtime guardrail, policy enforcement, or circuit breaker changed. |
| Vault | Export/migration context only; no storage, DLP, residency, or secret behavior changed. |
| Watch | Relevant through existing live score and behavior drift alert receipts and Watch alert projection. |
| Fleet | Agent-run/log context only; no fleet orchestration, topology, or handoff behavior changed. |
| Passport | Existing live-drift receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Migration/export context only; no compliance mapping changed. |

## Product closure

No product code changed for GAP-0023. The closure adds this source-review receipt and a focused regression over the existing Watch live-drift primitive.

The positive path proves that Literal AI-style production log, online evaluation, score distribution, dataset, experiment, and continuous-improvement context can be cited only when AMC-owned baseline and live windows include baseline distribution, live sample rows, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

The negative path proves that Literal AI homepage/docs/discontinuation/log/eval/dataset/experiment/export metadata cannot replace signed live-drift evidence.

## Fail-closed rule

Literal AI name, `https://literalai.com/` root reachability or HTTP 404 behavior, docs root redirect behavior, migration guide, discontinued-service notice, October 31st, 2025 availability date, stale `https://docs.literalai.com/guides/monitoring` route, dashboard docs, log docs, scorer docs, online-eval docs, dataset docs, experiment docs, evaluation docs, continuous-improvement docs, export docs, observability labels, analytics labels, production-log labels, online-eval labels, score-distribution labels, dataset labels, experiment labels, continuous-improvement labels, OpenTelemetry export labels, local backlog metadata, or source identity alone must fail closed.

Passing evidence requires AMC-owned baseline distribution, live sample, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No Literal AI adapter, SDK wrapper, API client, GraphQL adapter, export importer, log importer, trace importer, scorer importer, online-eval runner, dataset importer, experiment importer, prompt importer, migration assistant, OpenTelemetry importer, dashboard clone, source-specific Watch monitor/API/CLI, Studio panel, Shield verifier, Passport schema change, methodology bump, provider parity claim, or source-specific scoring path was added.

No Literal AI docs prose beyond short metadata phrases, code examples, SDK snippets, API details, GraphQL examples, export data, dataset rows, score examples, prompt templates, screenshots, UI assets, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap0023LiteralAiLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; 3 live-drift/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap0023LiteralAiLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired live-drift regression: `npx vitest run tests/gap0023LiteralAiLiveDriftBoundary.test.ts tests/gap0019HumanloopLiveDriftBoundary.test.ts tests/gap0948CometOpikLiveDriftBoundary.test.ts tests/gap0949LangWatchLiveDriftBoundary.test.ts tests/gap0696LangtraceLiveDriftBoundary.test.ts tests/liveDriftAlerts.test.ts --reporter=dot` passed, 6 files / 101 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1022 files / 8104 tests.
