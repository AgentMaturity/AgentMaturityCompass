# GAP-0603 — Galileo provider/model drift boundary

- Gap: `GAP-0603`
- Source: `https://www.galileo.ai`
- Source type: competitor/product page
- Retrieval date: 2026-06-20
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval of `https://www.galileo.ai` redirected to `https://galileo.ai/` with HTTP 200, content type `text/html`, last-modified `Tue, 09 Jun 2026 12:26:57 GMT`, ETag `"fdd14573d676215bd5dd6a208cfba24f"`, and first-200KB SHA-256 `a701bfce9584bc8fa96c45e48cf4bc4ed23f8e1262fe041032b65ce40732e2ab`. The retrieved text contained high-level evaluation, observability, and monitoring signals.

## Relevance decision

Relevant only as a high-level source signal for AMC's existing provider/model drift benchmark path. It maps to Score/Shield/Watch when, and only when, AMC-owned provider route, canary result, drift statistic, alert/waiver, signed evidence bundle, metric ids/counts, and no-copy/source-review proof are present.

No standalone Galileo subsystem, SDK wrapper, importer, or parity claim was added.

## Product closure

- Extended the existing provider drift benchmark row/comparison/eval-pack shape with Galileo-style optional receipt fields.
- Added fail-closed missing-proof handling for Galileo context.
- Updated docs/API/methodology surfaces and provider drift tests.

## No-copy boundary

No Galileo webpage prose, screenshots, product claims, examples, configs, UI text/assets, traces, reports, prompts, or implementation details were copied. Product-page metadata remains source-signal only and cannot establish external proof by itself.
