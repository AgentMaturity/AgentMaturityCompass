# GAP-0602 — Arize Phoenix public methodology versioning boundary

- Gap: `GAP-0602`
- Source: `https://phoenix.arize.com` and `https://arize.com/docs/ax`
- Source type: competitor/product documentation
- Retrieval date: 2026-06-20
- Dimension: `std-public-methodology`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval found `https://phoenix.arize.com` redirects to `https://arize.com/phoenix/` with HTTP 200, `text/html; charset=UTF-8`, last-modified `Sat, 20 Jun 2026 16:33:00 GMT`, and first-200KB SHA-256 `c5e5ee738bd91bb51d4f6891d92935872a93f5950adf5d98e812adcb0b9e42fc`. The retrieved text contained high-level evaluation, observability, tracing, trace, dataset, experiment, LLM, and production signals.

Live retrieval of `https://arize.com/docs/ax` returned HTTP 200, `text/html; charset=utf-8`, ETag `W/"zqbmw0otsqgm79"`, and first-200KB SHA-256 `ac36911a2732ba2c92b8743e1657fd67a84901fa37f235da403b596d22d8f1f2`. The retrieved text contained high-level evaluation, tracing, trace, dataset, experiment, monitor, alert, metric, LLM, provider, and production signals.

## Relevance decision

Relevant only as a high-level public methodology and metric-validity source signal for existing Score/Shield/Watch methodology versioning. It does not establish parity, and it does not justify a Phoenix/AX subsystem.

## Product closure

- Public methodology versioned to include Arize Phoenix/AX-style tracing/evaluation/monitoring boundaries.
- Methodology versioning receipt now includes fail-closed Arize Phoenix primary-source, signed-evidence, threshold-policy, metadata-only rejection, no-copy, and metric-gate checks.
- Tests assert the new methodology/gate/boundary expectations.

## No-copy boundary

No Phoenix/Arize website prose, screenshots, prompts, examples, configs, UI assets, docs text, or implementation details were copied. Public docs metadata is a source signal only and fails closed without AMC-owned eval packs, trace/span exports, evaluator config, dataset/experiment manifests, monitoring/alert policies, thresholds, signed evidence, and row hashes.
