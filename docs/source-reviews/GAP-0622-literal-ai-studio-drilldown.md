# GAP-0622 — Literal AI observability Studio drilldown boundary

- Gap: `GAP-0622`
- Source requested: `https://literalai.com`
- Live source used for review: `https://docs.literalai.com/llms.txt` plus linked Literal AI docs pages
- Source type: product documentation
- Retrieval date: 2026-06-20
- Dimension: `obs-studio-drilldown`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live verification was performed before implementation. `https://literalai.com` returned HTTP 404 with HTML body hash `a19d8ba6e0113132f05883c09a3646afc494025abba70ed647b0fd8cbaaee0ea`; the live documentation index at `https://docs.literalai.com/llms.txt` returned HTTP 200, content type `text/plain; charset=utf-8`, body hash `3a94435bf3dd24ce0ba0b3f5f0c5e99bfbf97c5ecb23e5137864d88bed4f1a0f`, 5393 bytes. Reviewed pages included:

- `https://docs.literalai.com/get-started/overview.md` — HTTP 200, hash `e2696bb294a58864c7a9945ec7e84cc12b4145906cc33ba2866e817158c8776e`.
- `https://docs.literalai.com/guides/dashboard.md` — HTTP 200, hash `0b5d86b47a17a5237229ac833b335a83b157d3a3ab088928f6274db7ad758432`.
- `https://docs.literalai.com/guides/logs.md` — HTTP 200, hash `0508f70a0f0125e011a9f65764a8b27828ec0b77279d0bd63548ce2aeff71a02`.
- `https://docs.literalai.com/guides/online-evals.md` — HTTP 200, hash `54b492db87c31b179edff785644ef421f0c934d8cc448469214ef6488c1b364d`.
- `https://docs.literalai.com/guides/annotation-queue.md` — HTTP 200, hash `0eccc2d836a8939c8b0500c4d722e1cd149831ccc7f3444e7ee8b7fe17241e57`.
- `https://docs.literalai.com/guides/experiment.md` — HTTP 200, hash `97cb84bc0dc2e1c1baa507ddbf7df469e4c1c4d2940ec8728e1683dcc761d632`.

The docs identify Literal AI as an observability, evaluation, analytics, dashboard/logs/online-evals/annotation/experiment product. This was used only as source identity for AMC-owned evidence drilldown behavior.

## Relevance decision

Relevant only to the existing AMC evidence drilldown primitive: UI route, source artifact links, accepted/rejected evidence preview, and fail-closed empty/error states across Score, Shield, and Watch. The implementation models Literal AI as a `product` source in the existing observability Studio drilldown lens and reuses existing Scorable/Studio drilldown rendering and fail-closed rules.

## Product closure

- Extended Watch source artifact link building to support product/docs URLs in addition to paper DOI/OpenAlex/publisher identity.
- Documented the AMC-owned Score evidence drilldown route in Studio OpenAPI with Score/Shield/Watch tags and response schema.
- Updated Console copy/tests so Literal AI product rows render through the existing observability Studio drilldown table with source artifact links, evidence previews, and empty/error-state receipts.

## No-copy boundary

No Literal AI subsystem, SDK, importer, UI, website layout, screenshots, images, docs prose, examples, prompts, configuration, or product code was copied. Source URLs and hashes are metadata-only links; all route, preview, receipt, empty-state, and error-state behavior remains AMC-owned.
