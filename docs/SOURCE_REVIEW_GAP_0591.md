# GAP-0591 Source Review: Metric validity and reliability checks

## Source verified

- Source: `https://github.com/FareedKhan-dev/langchain-go-vs-python`
- Default branch: `main`
- HEAD verified by `git ls-remote --symref`: `f71363334436093012d6f0501d778838cb39b288`
- License from GitHub metadata: MIT
- Repository description from GitHub metadata: "Benchmarking RAG and agentic systems in Go vs Python"
- Tree evidence from GitHub API: README, LICENSE, paired Go/Python benchmark scenarios for single-turn latency, TTFT streaming, RAG ingestion/retrieval/end-to-end flows, agent single/multi-tool flows, concurrency, memory, resiliency, workflows, data processing, observability overhead, and GPU saturation.

## Relevance decision

Relevant, narrowly. The source is not an AMC dependency and does not introduce a new AMC benchmark subsystem. It is relevant to GAP-0591 because its benchmark shape tests whether performance, resource, RAG, agent, resiliency, and observability metrics are valid only when the measured facets, confounder controls, outcome alignment, process evidence, safety/utility behavior, and lifecycle observability evidence are bound to signed row evidence.

## AMC surface mapping

| AMC surface | Existing primitive used | Source-relevance mapping |
|---|---|---|
| Score | `validationFacetChecks`, `outcomeAlignmentChecks`, confidence intervals, owners, row hashes | Throughput, latency, memory/CPU, RAG, and agent resiliency metrics must state measured facets and target outcomes before influencing maturity-score evidence. |
| Shield | `safetyUtilityChecks`, `processEvidenceChecks` | Timeout, tool-failure, parser-failure, resource-pressure, and observability-overhead claims must preserve safety/utility and include paired run/process evidence. |
| Watch | `lifecycleObservabilityChecks` | Runtime metric claims such as latency tails, CPU/memory drift, error rate, and GPU saturation must bind baseline/live observability evidence rather than source metadata alone. |

## Implementation rule

No source-specific public API fields were added. GAP-0591 uses existing `metricValidation` primitives and now fails closed when a metric-validation eval pack is metadata-only/non-replayable because row evidence refs lack signed evidence refs.

Regression coverage: `tests/metricValidity.test.ts` maps the source to generic primitives and verifies the same source-only metadata path fails closed.
