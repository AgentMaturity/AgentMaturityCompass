# GAP-0733 - OpenLLMetry-JS replay-corpus boundary

- Gap: `GAP-0733`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/traceloop/openllmetry-js`
- Retrieval: `2026-06-21` via live GitHub repository page review; raw README fetch was unavailable through the browser tool, and shell network remains DNS-restricted in this environment.
- Status: closed through existing eval replay corpus receipts; no OpenLLMetry-JS SDK integration, OpenTelemetry adapter, instrumentation package, or observability backend added.

## Live source metadata

The live GitHub source identifies `traceloop/openllmetry-js` as a TypeScript sister project to OpenLLMetry that provides open-source observability for LLM applications based on OpenTelemetry. Relevant source-review signals include Apache-2.0 licensing, TypeScript implementation, OpenTelemetry JavaScript context, examples and packages directories, recent releases including `0.27.0`, provider/framework instrumentation labels for OpenAI, Azure OpenAI, Anthropic, Cohere, Bedrock, Vertex AI, LangChain, and LlamaIndex, vector database labels such as Pinecone and Chroma, and backend labels such as Traceloop, Datadog, Honeycomb, Dynatrace, and New Relic.

These facts are relevant to AMC as replayable benchmark corpus context only. Observability traces can help explain benchmark runs, but AMC replay-corpus claims still require rerunnable eval manifests, fixture hashes, fixed seeds, score deltas, CI receipts, signed evidence rows, and source-review boundaries. They do not justify importing OpenLLMetry-JS, copying instrumentation code, adding OpenTelemetry dependencies, or claiming observability parity. No upstream README prose beyond minimal metadata facts, code, package manifests, instrumentation examples, semantic conventions, configs, trace examples, screenshots, docs, or implementation details were copied into AMC.

## Relevance decision

GAP-0733 is relevant to AMC through the existing eval replay corpus receipt path because replayability is the right way to prove that trace-backed benchmark score deltas can be reproduced. The accepted AMC primitives are already `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`.

The OpenLLMetry-JS source can be retained only as context when AMC-owned replay rows include a manifest hash, fixture hash, fixed seed, input/expected hashes, baseline/candidate run IDs, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof. Repository, README, star/fork/release, OpenTelemetry, provider, framework, vector-database, or backend labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay corpus score deltas and fixture-bound manifests. |
| Shield | Relevant through fail-closed handling for missing signed rows, missing fixture hashes, or metadata-only trace evidence. |
| Watch | Relevant through CI/lifecycle receipts that show replay evidence remains reproducible over time. |
| Enforce | No runtime instrumentation, tracing, exporter, or policy enforcement behavior changed. |
| Vault | No traces, prompts, provider responses, telemetry payloads, API keys, or secure-storage behavior changed. |
| Fleet | LLM observability context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or external trace credential changed. |
| Comply | Observability context only; no compliance mapping changed. |

## Product closure

GAP-0733 is closed by documenting the live-source boundary and adding regression coverage over the existing replay corpus primitives. The positive path proves that OpenLLMetry-JS-style trace-backed evaluation context can be cited only with AMC-owned replay fixtures and signed evidence. The negative path proves GitHub repository metadata fails closed.

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/eval/replayCorpusEvidenceReceipt.ts`, `src/diagnostic/evalReplayCorpusBoundary.ts`, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, OpenLLMetry-JS SDK integration, OpenTelemetry adapter, provider instrumentation, vector-database instrumentation, exporter backend, package dependency, methodology version, or scoring behavior changed for GAP-0733.

## Fail-closed rule

Repository identity, repository URL, README labels, OpenLLMetry-JS labels, OpenTelemetry labels, TypeScript labels, Apache-2.0 license labels, release labels, examples/package labels, provider instrumentation labels, framework instrumentation labels, vector-database labels, backend/exporter labels, local backlog metadata, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifest, fixture hash, fixed seed, input/expected hashes, baseline/candidate run ids, score delta, CI receipt, signed evidence refs, row hashes, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No OpenLLMetry-JS SDK integration, OpenTelemetry adapter, provider instrumentation, framework instrumentation, vector-database instrumentation, exporter backend, trace ingester, trace parser, examples importer, package importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code, package manifests, instrumentation examples, semantic conventions, configs, trace examples, screenshots, docs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0733OpenllmetryJsReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
