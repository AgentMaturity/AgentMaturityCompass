# GAP-0637 source review: OpenCompass live drift alerts

Gap: `GAP-0637` / P0 / `obs-live-drift-alerts`
Surfaces: Score, Shield, Watch
Source: <https://opencompass.org.cn/>
Affected AMC modules reviewed: `src/watch`, `src/drift`, `src/score`. Implementation lives in `src/watch` and reuses existing live score/behavior drift receipt primitives; no OpenCompass subsystem, SDK wrapper, importer, result-row loader, parity layer, or copied source content was added.

## Live source verification

Verified from live HTTPS source metadata on 2026-06-20 before implementation:

- Requested product page: `https://opencompass.org.cn/` returned HTTP 200, `text/html`, ETag `"6a26b414-f05"`, sha256 `4ac11f09b8ac5c506cb151a027723763ea42909de768f852f79f34433a6185c1`, title `OpenCompass司南`, canonical `https://opencompass.org.cn/home/`.
- Canonical product page: `https://opencompass.org.cn/home/` returned HTTP 200, `text/html`, ETag `"6a26b414-f05"`, sha256 `4ac11f09b8ac5c506cb151a027723763ea42909de768f852f79f34433a6185c1`, title `OpenCompass司南`.
- Rank entrypoint: `https://opencompass.org.cn/leaderboard-llm` redirected to `https://rank.opencompass.org.cn/leaderboard-llm-v2` and returned HTTP 200, `text/html`, ETag `"69eacb0c-102d"`, sha256 `26f2fc9e3244a903cc86fdae65ab3d5502bfe2fd74ad3c1fba719f2d0090c19f`, title `OpenCompass司南 - 评测榜单`.
- Rank home: `https://rank.opencompass.org.cn/` returned HTTP 200, `text/html`, ETag `"69eacb0c-102d"`, sha256 `26f2fc9e3244a903cc86fdae65ab3d5502bfe2fd74ad3c1fba719f2d0090c19f`, title `OpenCompass司南 - 评测榜单`.
- Documentation entrypoint: `https://doc.opencompass.org.cn/` returned HTTP 200, `text/html`, ETag `"6a35d93f-5f06"`, sha256 `5f96f29aa932c8f89c39bf0e28c0cd9f8049270a0d6104d6becd3dd11f63b3c5`, title `Welcome to OpenCompass’ documentation! — OpenCompass 0.5.2 documentation`.
- Source assets were used only as immutable source-signal hashes:
  - `https://opencompass.org.cn/assets/index-470bf4ae.js` sha256 `c96b8f91c20998190ebb1782242e3d5d0ecfcda0765955c4a6dccb7e4e95e10a`
  - `https://rank.opencompass.org.cn/assets/index-cbbab0ab.js` sha256 `d3abd82e1846b4c9e6f23ae7a5a60188859eb259faad263a40cad8650e0c0c9b`
  - `https://cdn.opencompass.org.cn/assets/opencompass-header.json` sha256 `3c277a0f0fbb61e3c03870326ab7f31831761197e28e81adc2bc0646329807ab`
  - `https://cdn.opencompass.org.cn/assets/llm-datasets.json` sha256 `705b589221bf7bf91373dd4f3f3838d78a4f23b7852e79093f7db12e99f2fb25`

## Relevance decision

Relevant, narrowly, as a metadata-only benchmark/evaluation source signal for AMC's existing live drift receipts. Public OpenCompass metadata identifies evaluation, benchmark, dataset, rank/leaderboard, safety rank, and online evaluation surfaces. Those map to AMC-native Score/Shield/Watch claims only when supplied by user-owned evidence:

- Score: user-owned OpenCompass-adjacent evaluation events normalize to AMC `score0to1`, pass/refusal/error, latency, and cost fields.
- Watch: baseline and live windows flow through `runLiveScoreBehaviorDrift`, producing a baseline distribution, live sample, drift statistic, and standard Watch alerts.
- Shield: signed evidence refs, source metadata hashes, row proof hashes, no-raw-result-row boundaries, no OpenCompass subsystem proof, no SDK/importer proof, no copied source-prose/config/result proof, alert receipt hashes, fail-closed threshold policy, replay command, and CI receipt are mandatory before a receipt can be non-alerting.

## Claim boundary

Source metadata alone is explicitly insufficient. `runOpenCompassLiveDrift` requires an AMC-native metadata proof, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, signed evidence policy, fail-closed threshold policy, replay command, CI receipt, and row-level hashes for benchmark/dataset/model-or-agent/evaluation-config/score-report/leaderboard/schema evidence. Missing or mismatched proof contributes to `openCompassEvidenceCoverage0to1`; incomplete proof emits a signed fail-closed Watch alert even when generic score drift is stable.

No OpenCompass subsystem, SDK wrapper, importer, feature-parity claim, copied website/docs prose, copied config, copied result rows, benchmark dataset, leaderboard row, score row, or proprietary artifact was added. The implementation is a thin typed adapter over AMC's existing Watch live drift primitives.
