# GAP-0627 — Patronus provider/model drift boundary

- Gap: `GAP-0627`
- Source: `https://www.patronus.ai/`
- Source type: competitor/product page
- Retrieval date: 2026-06-20
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval of `https://www.patronus.ai/` returned HTTP 200, content type `text/html; charset=utf-8`, last-modified `Fri, 19 Jun 2026 05:01:10 GMT`, no ETag header, and first-200KB SHA-256 `e5a0ff2ed2a9f15ea9db2376f5e748400151c3df960d12968868f41e81605680`. The retrieved page title was `Patronus AI | Simulating the World&#x27;s Intelligence`, and the page text included high-level evaluation, benchmark, and guardrail signals.

## Relevance decision

Relevant only as a high-level source signal for AMC's existing provider/model drift benchmark path. It maps to Score/Shield/Watch when, and only when, AMC-owned provider version metadata, canary result hashes, drift statistic hashes, alert-or-waiver hashes, signed evidence, metric ids/counts, and no-copy/source-review proof are present.

No Patronus subsystem, SDK wrapper, importer, external config support, or parity claim was added.

## Product closure

- Added a metadata-only provider drift wrapper that feeds the existing provider drift benchmark, CI gate, eval pack, and Watch alert primitives.
- Added Score, Shield, and Watch API routes for provider versions, canary results, drift statistics, and alert/waiver handling.
- Added tests for complete evidence, missing canary/drift/alert proof, waiver acceptance, copied-content rejection, provider-version mismatch, and API surfaces.

## No-copy boundary

No Patronus webpage prose beyond minimal source metadata, screenshots, product claims, examples, configs, UI text/assets, traces, reports, prompts, datasets, or implementation details were copied. Product-page metadata remains source-signal only and cannot establish external proof by itself.
