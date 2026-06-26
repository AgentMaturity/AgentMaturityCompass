# GAP-0632 — TensorZero provider-drift boundary

- Gap: `GAP-0632`
- Source: `https://github.com/tensorzero/tensorzero`
- Source type: public GitHub repository
- Retrieval date: 2026-06-20
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub metadata was verified before implementation:

- Repository: `tensorzero/tensorzero`
- Default branch: `main`
- HEAD/main commit: `62eb8f63e8ec62018d70420dbf1a8c5d1c026315`
- Latest checked tags: `2026.6.0` at `62eb8f63e8ec62018d70420dbf1a8c5d1c026315`, `2026.5.2` at `c2a4c6f5e617cb8d309446773ecff5bb09691e95`, `2026.5.1` at `c79fb0ad6c99cba31004abd168cd0ad6b62e3d01`, `2026.5.0` at `6e20b54f00872e19f8d4e8bf56f721ab9f73f117`, `2026.4.1` at `5a6ffa128fe92431e86b8de0ecd184e2b90d4331`
- GitHub API metadata at retrieval: Apache-2.0 license, Rust primary language, updated `2026-06-20T16:27:23Z`, pushed `2026-06-11T01:48:44Z`, 11,663 stars, 934 forks, 393 open issues

## Relevance decision

Relevant only as a source signal for AMC's existing provider/model drift benchmark and Score/Shield/Watch API primitives. GAP-0632 does not add a TensorZero subsystem, SDK wrapper, importer, compatibility/parity layer, gateway configuration format, or runtime integration.

## Product closure

- Added a metadata-only TensorZero provider-drift wrapper in AMC `src/benchmarks` that reuses the existing provider drift benchmark engine.
- Added a `src/watch` re-export so Watch callers can consume the same primitive without a TensorZero-specific subsystem.
- Added Score, Shield, Watch, and benchmark API routes under AMC `src/api` for the provider-drift receipt and projections.
- Score surface returns provider versions, canary comparisons, drift statistics, fail-closed state, and TensorZero evidence hash.
- Shield surface verifies the provider-drift CI gate and reports active versus waived alerts.
- Watch surface projects unwaived TensorZero provider-drift proof gaps into Watch alerts.
- Required proof binds provider version, TensorZero version/deployment identifier, source/repository/license/default-branch/release hashes, AMC benchmark/watch/API module hashes, routing/evaluator/canary data hashes, inference trace hash, canary result hash, drift-statistic hash, alert-or-waiver hash, signed evidence bundle hash, no-copy proof hash, metric IDs, and metric count.

## No-copy boundary

AMC records only metadata hashes and source-review facts. No TensorZero code, prose, examples, configs, gateway routes, SDK behavior, templates, prompts, datasets, traces, screenshots, tests, or implementation details were copied.
