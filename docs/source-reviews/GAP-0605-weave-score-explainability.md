# GAP-0605 — W&B Weave question score explainability boundary

- Gap: `GAP-0605`
- Source: `https://wandb.ai/site/weave`
- Source type: competitor/product page
- Retrieval date: 2026-06-20
- Dimension: `eval-score-explainability`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval of `https://wandb.ai/site/weave` resolved to `https://wandb.ai/site/weave/` with HTTP 200, content type `text/html; charset=UTF-8`, ETag `W/"6aedc-ugkR7zUfKHLrOOG0ieWSBr4nXko"`, and first-200KB SHA-256 `eaa30b33eb266eda5b0f975c1419469dea7f5843cee94df2bd5dc55a64f44151`.

## Relevance decision

Relevant only as a high-level source signal for existing AMC question score explainability. A Weave label, product page, screenshot, or local export is not proof. AMC still requires question ID, accepted evidence IDs, rejected-evidence reasons, repair hint, reproducible eval-pack hashes, signed evidence rows, fail-closed threshold policy, and row hashes.

## Product closure

- Added eval-score explainability pack handling in diagnostic/guide/passport surfaces.
- Added regression coverage showing metadata-only Weave-style exports fail closed.

## No-copy boundary

No W&B/Weave website prose, screenshots, examples, configurations, UI assets, traces, reports, prompts, or implementation details were copied.
