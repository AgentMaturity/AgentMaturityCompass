# GAP-0607 — Comet Opik question score explainability boundary

- Gap: `GAP-0607`
- Source: `https://www.comet.com/site/products/opik/`
- Source type: competitor/product page
- Retrieval date: 2026-06-20
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval of `https://www.comet.com/site/products/opik/` returned HTTP 200, content type `text/html; charset=UTF-8`, and first-200KB SHA-256 `750499497420e42990621440533d4d727ec72f18cb929ee3c3a98d85afaf942e`. The retrieved text contained high-level evaluation, observability, trace/tracing, dataset, experiment, metric, score, monitor, alert, LLM, and RAG signals.

## Relevance decision

Relevant only as a high-level source signal for existing AMC question score explainability. No Opik subsystem, SDK wrapper, importer, or parity claim was added.

## Product closure

- Added an optional Opik-style evaluation question lens to existing question score explainability receipt shape.
- Added guide/passport/report propagation and regression tests showing product-page metadata fails closed without AMC-owned eval pack, signed evidence rows, accepted/rejected ledgers, repair hints, thresholds, and no-copy/no-parity proof.

## No-copy boundary

No Comet/Opik webpage prose, screenshots, examples, configurations, UI assets, traces, reports, prompts, or implementation details were copied.
