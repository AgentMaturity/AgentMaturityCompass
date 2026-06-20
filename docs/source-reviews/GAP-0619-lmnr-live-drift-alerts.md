# GAP-0619 source review: LMNR/Laminar live drift alerts

Gap: `GAP-0619` / P0 / `obs-live-drift-alerts`
Surfaces: Score, Shield, Watch
Source: <https://www.lmnr.ai/>
Affected AMC modules reviewed: `src/watch`, `src/drift`, `src/score`. Implementation lives in `src/watch` and reuses existing live drift primitives; no standalone `src/drift` or `src/score` subsystem, SDK wrapper, importer, or parity layer was added.

## Live source verification

Verified from live HTTPS source metadata on 2026-06-20 before implementation:

- Requested product page: `https://www.lmnr.ai/` redirected to `https://laminar.sh:443/` and returned HTTP 200, `text/html; charset=utf-8`, sha256 `5221821af80b83708e4c3cc801e28f0929b225598f58a11bef3e02f87f77c155`, title `Laminar - Open-source observability for AI agents`.
- Canonical product page: `https://laminar.sh/` returned HTTP 200, `text/html; charset=utf-8`, sha256 `5221821af80b83708e4c3cc801e28f0929b225598f58a11bef3e02f87f77c155`.
- Docs entrypoint: `https://docs.lmnr.ai/` redirected to `https://laminar.sh:443/docs/overview` and returned HTTP 200, `text/html; charset=utf-8`, ETag `"a087zvilx056xa"`, sha256 `8522fedde3d8626d75edc666c593d0bc3761cebab13fa8fe6077ee67dfe16a41`.
- Docs index: `https://docs.lmnr.ai/llms.txt` redirected to `https://laminar.sh:443/docs/llms.txt` and returned HTTP 200, `text/plain; charset=utf-8`, sha256 `c3e04b0643d4715152d1fd4fc83cde6eec36f96453f0817a97dad70ef76ea888`.
- Relevant public markdown docs returned HTTP 200 and were used only as source-signal hashes:
  - `docs/overview.md` sha256 `93dd66d1b4dabf1341a2afe6d6e87e1e45d32bd8a5d3c45b8df7db60e2138b84`
  - `docs/platform/viewing-traces.md` sha256 `da9e67123cbcf05c1b6bf3d4d81d1c0e2189f6228225781c35a7d3744bcf26ca`
  - `docs/evaluations/quickstart.md` sha256 `ba4bd28190b951415fc77d8ccdfee7abb2d61ccbd750068c03992418443c5a93`
  - `docs/evaluations/concepts.md` sha256 `bc1caa16be12358a9fed7b4cdb9c0b2e263450998222a33078238811c6a0e66d`
  - `docs/signals/alerts.md` sha256 `70e83d3fe5e019d2dbe21dda1196385060ef43d4a113f69186ae24fb6356a420`
  - `docs/platform/pii-redaction.md` sha256 `516c3839d58d000d3f4db78fe72669e6b89bdf22264584b519bdb1504e932cff`
  - `docs/tracing/integrations/overview.md` sha256 `11dff3f0772972076e9e9acb05ccdc3dd0bc970a5cd48a33caf9a0a8a7c29c6e`
  - `docs/platform/mcp.md` sha256 `f707077f18163c86e9faa3c19587339f1231caf859b148cb14da048712c058be`

## Relevance decision

Relevant, narrowly, as a metadata-only observability source signal for AMC's existing live-drift receipt path. The live public metadata/docs identify traces, evaluations, datasets, alerts, PII redaction, dashboards/integrations, and MCP trace-query surfaces. Those map to AMC-native Score/Shield/Watch claims only when supplied by user-owned evidence:

- Score: per-trace/evaluation score events normalize to AMC `score0to1`, pass/refusal/error, latency, and cost fields.
- Watch: baseline and live windows flow through `runLiveScoreBehaviorDrift`, produce a baseline distribution, live sample, drift statistic, and standard Watch alerts.
- Shield: signed evidence refs, privacy/no-raw-payload boundaries, no SDK/importer/subsystem proof, row proof hashes, alert receipt hashes, fail-closed threshold policy, replay command, and CI receipt are mandatory before a receipt can be non-alerting.

## Claim boundary

Product-page or docs metadata alone is explicitly insufficient. `runLmnrObservabilityLiveDrift` requires an AMC-native metadata proof, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, signed evidence policy, fail-closed threshold policy, replay command, CI receipt, and row-level hashes for trace/span/evaluation/dataset/score/alert/privacy evidence. Missing or mismatched proof contributes to `lmnrObservabilityEvidenceCoverage0to1`; incomplete proof emits a signed fail-closed Watch alert even when generic score drift is stable.

No Laminar/LMNR subsystem, SDK wrapper, importer, feature-parity claim, copied docs/web prose, trace payload, screenshot, dataset, score row, or proprietary artifact was added. The implementation is a thin typed adapter over AMC's existing Watch live drift primitives.
