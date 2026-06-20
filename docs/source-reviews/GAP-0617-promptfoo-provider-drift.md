# GAP-0617 — promptfoo provider-drift boundary

- Gap: `GAP-0617`
- Source: `https://github.com/promptfoo/promptfoo`
- Source type: public GitHub repository
- Retrieval date: 2026-06-20
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live GitHub metadata was verified before implementation:

- Repository: `promptfoo/promptfoo`
- Default branch: `main`
- HEAD/main commit: `eb5e45a7a6609496bd3ac3155526cf4ef91a27a3`
- Latest checked promptfoo tags: `promptfoo-v0.119.12` at `efeccab045d243bc8268de10f732349ac676e381`, `promptfoo-v0.119.13` at `d1419964849e897b61e3871af8d009fc217be93e`
- GitHub API metadata at retrieval: MIT license, TypeScript primary language, updated `2026-06-20T15:10:45Z`, pushed `2026-06-20T12:04:47Z`, 22,402 stars, 1,999 forks, 339 open issues

## Relevance decision

Relevant only as a source signal for AMC's existing provider/model drift benchmark and Watch/API primitives. GAP-0617 does not add a promptfoo subsystem, SDK wrapper, importer, parity layer, or promptfoo-compatible config format.

## Product closure

- Added a metadata-only promptfoo provider-drift wrapper that reuses AMC provider-drift primitives.
- Score surface returns provider versions, canary comparisons, drift statistics, fail-closed state, and promptfoo evidence hash.
- Watch surface projects unwaived promptfoo provider-drift proof gaps into Watch alerts.
- Shield surface verifies the promptfoo provider-drift receipt/gate and reports active versus waived alerts.
- Required proof binds provider version, promptfoo release/version, source/repository/package/module hashes, provider route/eval config hashes, canary result hash, drift-statistic hash, alert-or-waiver hash, replay command hash, signed evidence bundle hash, no-copy proof hash, metric IDs, and metric count.

## No-copy boundary

AMC records only metadata hashes and source-review facts. No promptfoo code, prose, prompts, assertions, configs, examples, provider definitions, tests, screenshots, package text, CLI behavior, SDK behavior, or implementation details were copied.
