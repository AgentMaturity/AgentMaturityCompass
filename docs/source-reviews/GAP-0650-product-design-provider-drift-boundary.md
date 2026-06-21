# GAP-0650 — product-design multi-agent paper provider-drift boundary

- Gap: `GAP-0650`
- Dimension requested: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7125268930` / DOI `10.1080/09544828.2026.2616583`
- Retrieval: `2026-06-21T04:34:44Z` via live OpenAlex, Crossref, and DOI content-negotiation metadata.
- Metadata facts: title `An LLM-based multi-agent system to assist early-stage product design and evaluation`; journal `Journal of Engineering Design`; publisher `Informa UK Limited`; publication year/date `2026` / `2026-01-20`; OpenAlex type `article`; Crossref type `journal-article`; OpenAlex open-access status `closed`.
- Inspected metadata SHA-256:
  - OpenAlex API `status=200`, `content-type=application/json`, SHA-256 `4f9fec9c35c6acabb98f15a06c104e70c2a6ce3d6a00319644af81bc36b38845`
  - Crossref API `status=200`, `content-type=application/json`, SHA-256 `ad5784df60d831e481b0cfed6d85e353e53f2c7c3c8dc8068d23557c9a2e04b6`
  - DOI CSL JSON `status=200`, `content-type=application/vnd.citationstyles.csl+json`, SHA-256 `b5c945dbbac7b539e5cca6748e2bd0d8e3ab98a9d6be77a11a939680d1680b43`
- Status: not adopted as a provider/model drift wrapper.

## Relevance decision

The live metadata identifies a paper about an LLM-based multi-agent system for early-stage product design and evaluation. That is adjacent to agent evaluation, but it does not publish or expose an AMC-ready provider/model drift primitive: no provider routing canary, baseline/candidate provider versions, model-regression drift statistic, signed canary evidence, or Watch alert/waiver receipt.

Existing AMC provider-drift integrations (`Inspect`, `TensorZero`, `HELM`, and related wrappers under `src/benchmarks/*ProviderDrift.ts` and `src/watch/*ProviderDrift.ts`) are metadata-only only after the caller supplies AMC-owned canary rows, provider versions, evaluator proof, result hashes, drift statistics, signed evidence, and alert/waiver proof. DOI/OpenAlex/Crossref metadata for this product-design paper cannot satisfy that evidence shape.

Therefore GAP-0650 is closed as a source-review non-adoption boundary: relevant high-level context for multi-agent/product-design evaluation, but not relevant enough to add a provider-drift wrapper, API route, paper importer, dataset mirror, benchmark mirror, or product-design subsystem.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No source-specific Score primitive. Product-design paper metadata may be cited only as source-review context; provider/model drift scores still require AMC-owned baseline/candidate canary rows and result hashes. |
| Shield | No source-specific Shield gate. Missing provider-version, signed evidence, canary-result, drift-statistic, and alert/waiver proof must fail closed through existing provider-drift gates. |
| Watch | No source-specific Watch alert. Existing provider-drift Watch alerts apply only to caller-owned drift receipts, not to DOI/OpenAlex metadata. |
| Enforce/Vault/Fleet/Passport/Comply | No direct scope for this gap. |

## Regression boundary

A focused regression test now exercises the existing provider-drift primitive with only GAP-0650 DOI/OpenAlex-style metadata references and partial evaluator labels. The result must fail closed with `signedEvidenceRefs` and `evaluationFrameworkEvidence` alerts, proving that citation metadata is not accepted as Score/Shield/Watch provider-drift proof.

## No-copy / no-bloat boundary

No paper prose, abstract, tables, figures, prompts, examples, datasets, model outputs, evaluation data, implementation details, product-design workflow, importer, parity layer, benchmark mirror, or source-specific provider-drift wrapper was added. The source was used only through live bibliographic metadata for relevance review.
