# GAP-0598 source review: Affordance-Compiled Intelligence

Gap: `GAP-0598` / P0 / Agent evaluation and benchmarks
Dimension: `eval-replay-corpus`
Surfaces requested: Score, Shield, Watch
Assigned source: OpenAlex `W3027879771`; DOI concept URL <https://doi.org/10.5281/zenodo.18717227>
Assigned title: `Affordance-Compiled Intelligence: Observable-Only Cognitive Impedance Matching for No-Meta LLM-Integrated Systems`

## Live source verification

Verified from the isolated `agent/gap-0598` worktree on 2026-06-20 using live DOI, Zenodo API, Zenodo landing page, and OpenAlex API requests. Only metadata was inspected; no paper prose, figures, prompts, data, or PDF contents were copied into AMC.

### DOI and Zenodo metadata

- Requesting `https://doi.org/10.5281/zenodo.18717227` returned HTTP 200 and redirected to `https://zenodo.org/records/18717228`.
- `https://zenodo.org/api/records/18717227` returned HTTP 200 and redirected to `https://zenodo.org/api/records/18717228`.
- The returned Zenodo record was `id: 18717228`, `conceptrecid: 18717227`, `doi: 10.5281/zenodo.18717228`, `conceptdoi: 10.5281/zenodo.18717227`.
- The Zenodo title was `When Systems Turn Inward (II): Windows in the Room`, not the assigned GAP-0598 title.
- The Zenodo landing page title matched that Zenodo record and did not contain the assigned `Affordance-Compiled Intelligence` title.

### OpenAlex metadata

- `https://api.openalex.org/works/W3027879771` returned HTTP 200.
- OpenAlex reported DOI `https://doi.org/10.5281/zenodo.18717227` and the assigned GAP-0598 title.
- The same OpenAlex record also reported primary location `arXiv:2005.11401` with `landing_page_url: http://arxiv.org/abs/2005.11401` and authors/location metadata inconsistent with the assigned Zenodo DOI/title pair.

## Relevance / adoption decision

**Decision: skip / no product change.**

The assigned source cannot be live-verified as a consistent paper/source identity:

1. The DOI concept URL resolves to a different Zenodo record/title than the assigned source title.
2. The OpenAlex record contains the assigned title but points at a mismatched DOI concept and an unrelated arXiv primary location.
3. Because the source identity is inconsistent, AMC cannot safely infer relevance to the Score, Shield, Watch surfaces or to `eval-replay-corpus` from this source without relying on metadata-only or stale aggregator state.

This follows the source-review rule: when a paper is not accessible as a clearly relevant, live-verified source, AMC records a skip/no-product-change review rather than forcing a feature. No source-specific evaluator, benchmark fixture, adapter, prompt, corpus row, metric, or diagnostic behavior is adopted.

## Metadata-only replay proof receipt

The existing AMC replay-corpus primitive was exercised with a synthetic AMC-owned metadata-consistency row to prove the source cannot pass as replay evidence. This is not an upstream fixture; it is a review receipt over the source metadata mismatch.

- Replay manifest id: `replay-corpus:amc-source-review:gap-0598-source-metadata-only:2026.06.20`
- Manifest hash: `226bb943b01ad7330bed89bff10433b078db38df3ed142dfcc2c447290f94fb9`
- Corpus fixture hash: `aebe094e94b3520d3cf1ae1f77d8e9be87b86e1815bede0f1247492cc4e7d3b8`
- Row fixture hash: `09891cd01a5d8f11742af9008f4c7797626c2e21288ddd0fa0ac42d1d7a3fb04`
- Row id: `gap-0598-doi-metadata-consistency`
- Surfaces bound in the proof: Score, Shield, Watch
- Score delta: `-0.5`
- Row status: `missing_evidence`
- CI receipt id: `replay-ci:226bb943b01ad733`
- CI receipt hash: `01ab05ff1c33c6c6df8b1d63e793d0dd639125b6c7299e43b876506b5f999125`
- CI result: `passed: false`, `failClosed: true`, `replayable: false`
- Failed row ids: `gap-0598-doi-metadata-consistency`
- Watch alert id: `watch:replay-ci:226bb943b01ad733:gap-0598-doi-metadata-consistency`
- Receipt verification: `valid: true`, `errors: []`

## Copy/provenance boundary

No Zenodo PDF text, OpenAlex abstract inversion text, paper prose, data rows, figures, prompts, screenshots, or implementation details were copied. The review records only live metadata facts needed to explain the skip decision and a synthetic AMC receipt proving metadata-only evidence fails closed.
