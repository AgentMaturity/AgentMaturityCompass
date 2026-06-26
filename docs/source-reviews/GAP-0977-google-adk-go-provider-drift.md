# GAP-0977 - Google ADK-Go provider-drift boundary

- Gap: `GAP-0977`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository/API at `https://github.com/google/adk-go`, raw README at `https://raw.githubusercontent.com/google/adk-go/main/README.md`, raw license at `https://raw.githubusercontent.com/google/adk-go/main/LICENSE`, raw module file at `https://raw.githubusercontent.com/google/adk-go/main/go.mod`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through GitHub CLI/API, raw GitHub content, and `git ls-remote`.
- Status: closed through existing provider/model drift benchmark receipts only; no ADK-Go adapter, Google integration, Gemini wrapper, Vertex AI connector, A2A bridge, MCP bridge, Go runtime, package dependency, API route, CLI command, Studio panel, or source-specific canary runner added.
- Linear: `AMC-1256`

## Live source metadata

The live GitHub API identifies `google/adk-go` as a public, non-archived Go repository with description `An open-source, code-first Go toolkit for building, evaluating, and deploying sophisticated AI agents with flexibility and control.` Current review metadata showed 8,230 stars, 719 forks, 101 open issues, 59 watchers, Apache License 2.0, default branch `main`, pushed_at `2026-06-24T10:30:13Z`, updated_at `2026-06-24T09:34:29Z`, created_at `2025-05-05T17:16:26Z`, and release `v1.4.0` published `2026-05-29T13:45:25Z`.

`git ls-remote --symref https://github.com/google/adk-go.git HEAD` verified default branch `main` at `53502666c10261bdd2a95f56eddec3562333717f`. Tag discovery found releases from `v0.1.0` through `v1.4.0`.

The raw README identifies ADK-Go as the Agent Development Kit for Go and links official docs, samples, Python ADK, Java ADK, and ADK Web. Source-review signals relevant to provider drift include model-agnostic and deployment-agnostic posture, Gemini optimization, cloud-native deployment, code-first agent logic, rich tool ecosystem, modular multi-agent systems, and Google Cloud Run context.

The GitHub API tree lists repository areas for `agent`, `runner`, `session`, `model`, `tool`, `telemetry`, `server`, `memory`, `platform`, `examples`, and workflows. The raw `go.mod` declares module `google.golang.org/adk`, `go 1.25.0`, and dependencies that include Google GenAI, Vertex AI/API packages, A2A packages, MCP SDK, OpenTelemetry, storage, gRPC, and CLI/web components. Repository topics include Gemini, Vertex AI, A2A, MCP, agents, SDK, Go, and multi-agent systems.

No ADK-Go code, README prose beyond short metadata facts, docs prose, examples, prompts, tests, recordings, package manifests beyond minimal metadata facts, workflows, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0977 is relevant to AMC because ADK-Go is a model-agnostic, tool-using, cloud-native agent toolkit where model, provider, SDK, runtime, tool, telemetry, A2A, MCP, Gemini, or Vertex AI changes can shift score, refusal, latency, cost, guardrail, invalid-action, or tool-call distributions while the agent application appears unchanged.

The accepted AMC primitive already exists: `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate`. Valid proof requires provider version, canary results, drift statistic, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, CI/lifecycle gate proof, source refs, and alert or waiver output. Repository metadata alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned provider canary score rows, metric suites, thresholds, dataset hashes, and row hashes. |
| Shield | Relevant when drift changes refusal, invalid-action, guardrail, unsafe tool use, or tool-call validity metrics. |
| Enforce | No runtime policy, model router, A2A bridge, MCP bridge, or circuit breaker changed. |
| Vault | No credential, data residency, secret storage, artifact storage, or Google Cloud storage behavior changed. |
| Watch | Relevant through existing Watch provider-drift alerts and CI/lifecycle gate receipts. |
| Fleet | ADK-Go multi-agent context only; no Fleet topology or orchestration behavior changed. |
| Passport | Existing provider-drift receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and cloud-native context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing provider-drift primitives can accept ADK-Go-style agent runtime context only when AMC has signed canary rows, provider versions, metric suites, evaluator hashes, trace exports, dataset hashes, observability proof, thresholds, and CI gate evidence.

The positive path produces a replayable provider-drift eval pack and passes the CI gate without Watch alerts. The negative path fails closed when ADK-Go repository metadata, README metadata, license metadata, module metadata, Gemini/Vertex/A2A/MCP labels, Go module labels, topic labels, and source identity replace AMC-owned signed canary proof.

## Fail-closed rule

ADK-Go repository identity, GitHub star/fork/issue/watcher counts, release tags, default-branch SHA, README labels, Apache License 2.0 label, Go language label, `google.golang.org/adk` module label, `go 1.25.0` label, Gemini labels, Vertex AI labels, Google Cloud labels, A2A labels, MCP labels, OpenTelemetry labels, multi-agent labels, tool labels, runner/session/model/telemetry folder names, examples labels, local backlog metadata, or source identity alone cannot prove provider/model drift.

A provider/model drift claim must fail closed unless provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, evaluator config hash, generated test data hash, trace export hash, metric report hash, threshold config, row hashes, CI or lifecycle receipt, Watch alert projection, source refs, and no-copy proof exist.

## No-bloat boundary

No ADK-Go adapter, Google integration, Gemini wrapper, Vertex AI connector, A2A bridge, MCP bridge, Go runtime, Go module import, package dependency, SDK mirror, sample runner, testdata importer, telemetry importer, OpenTelemetry collector, agent runtime, runner/session/tool/model wrapper, command launcher, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, provider router, or source-specific provider-drift lens was added.

No upstream code, README prose beyond short metadata facts, docs prose, examples, prompts, tests, recordings, package manifests beyond minimal metadata facts, workflows, generated outputs, model responses, trace samples, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0977GoogleAdkGoProviderDriftBoundary.test.ts --reporter=dot` - failed before this doc existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0977-google-adk-go-provider-drift.md'`; 3 provider-drift primitive tests passed.
- Focused regression: `npx vitest run tests/gap0977GoogleAdkGoProviderDriftBoundary.test.ts --reporter=dot` - passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0976GraphDtGptQuestionExplainabilityBoundary.test.ts tests/gap0977GoogleAdkGoProviderDriftBoundary.test.ts --reporter=dot` - passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` - passed, 824 files / 7,295 tests.
- Cleanup: `npm run clean` - removed generated `dist/` output before staging.
