# GAP-0601 source review: Braintrust live drift alerts

Gap: `GAP-0601` / P0 / `obs-live-drift-alerts`
Surfaces: Score, Shield, Watch
Source: <https://www.braintrust.dev/>
Affected AMC modules: `src/watch`; no standalone `src/drift` or `src/score` subsystem was added.

## Live source verification

Verified from live HTTPS source metadata on 2026-06-20:

- Product page: `https://www.braintrust.dev` returned HTTP 200, `text/html`, sha256 `2cb54cb2041155ebd95ef5df6a233b0182ecdde8b8456da1a5c201f76a2777e8`.
- `llms.txt`: `https://www.braintrust.dev/llms.txt` returned HTTP 200, `text/plain`, ETag `"5b47ba32edf3a49fe5fc78edf68314f2"`, sha256 `ee1802d94b245a92cac5e0504a4b0e2e15e9e6ec7ccec229366661201afc7e7e`.
- Relevant docs returned HTTP 200 markdown and were used only as metadata/source-signal hashes:
  - `docs/tracing-quickstart.md` sha256 `0cb2aad2331b63311c39e575ad4c51fdaaa0f1f9003b547bda1aa5b940b47b7b`
  - `docs/evaluation-quickstart.md` sha256 `0513c8a24097f22c42ca5336d43e5e137500ec5807d7fa4de6115e4ff97782c8`
  - `docs/evaluate/run-evaluations.md` sha256 `f137996405c2fcdbf22585050dfbc4696e8ff1c4a21cb982e2a691cea8c38da4`
  - `docs/evaluate/compare-experiments.md` sha256 `0bb9bc839ceb5ddcfb075170dbaa0873b69378afa38a7ab79f1e35102a63a472`
  - `docs/evaluate/score-online.md` sha256 `0096b177f8bb9dffcfea0ca6e15d13162bf55be4ff72b8872c0d083bae4039d9`
  - `docs/observe/index.md` sha256 `9fb4ef714f9fde0f317b1b615fa5abe585b44402887b45599510b68697132b9e`
  - `docs/deploy/monitor.md` sha256 `6031ca3ef5b406ae949b46ec8f412d6fae5b769bb272c312370c1296d4db2eb9`

## Relevance decision

Relevant, but only as a source signal for AMC's existing live-drift receipt path. Braintrust's public source surface links traces, online scoring, datasets/experiments, comparison, and deployment monitoring. That maps cleanly to AMC-native Score/Shield/Watch claims:

- Score: per-trace/eval score events normalize to AMC `score0to1`, pass/error/refusal, latency, and cost fields.
- Watch: baseline and live windows flow through `runLiveScoreBehaviorDrift` and emit standard Watch alerts via `buildLiveDriftWatchAlerts`.
- Shield: signed evidence refs, row proof hashes, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, and fail-closed threshold policy are mandatory before a receipt can be non-alerting.

## Claim boundary

Product-page metadata alone is explicitly insufficient. The adapter requires independent documentation/source hashes, AMC-native mapping proof, no-standalone-subsystem proof, no-copied-prose proof, baseline/live/statistic/alert proof, signed evidence policy, replay command, CI receipt, and row-level trace/eval/scorer evidence. Missing any required proof contributes to `braintrustEvidenceCoverage0to1`; missing proof emits a signed fail-closed Watch alert even when generic score drift is stable.

No Braintrust subsystem, SDK wrapper, copied webpage prose, screenshots, product claims, or standalone storage model was added. The implementation is a thin typed adapter over existing AMC live drift primitives.
