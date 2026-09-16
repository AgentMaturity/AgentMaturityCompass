# GAP-0636 — HELM provider/model drift boundary

- Gap: `GAP-0636`
- Source: `https://crfm.stanford.edu/helm/`
- Source type: public benchmark website
- Retrieval date: 2026-06-20T20:03:35Z
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live HTTPS retrieval from this worktree session returned:

| URL | Status | Content type | Last modified | ETag | First-200KB SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| `https://crfm.stanford.edu/helm/` | 200 | `text/html; charset=utf-8` | `Mon, 15 Jun 2026 22:23:03 GMT` | `"6a307b47-50f"` | `7b5ae08a8aad37b4ba0fe04ccb68d68a62d23695ec874aff3e81833acca8cca0` |
| `https://crfm.stanford.edu/helm/helm.svg` | 200 | `image/svg+xml` | `Mon, 15 Jun 2026 22:23:03 GMT` | `"6a307b47-1a95"` | `ca5bddd4f00140780577ef6ac1bc302afd245c7efca1d778411cc389729f0d4b` |

The live homepage identifies HELM as a language-model evaluation benchmark site. That is sufficient source relevance for a metadata-only AMC provider/model drift wrapper, but not for a HELM subsystem, SDK, importer, compatibility layer, leaderboard mirror, or result ingestion feature.

## Relevance decision

Relevant only to AMC's existing provider/model drift benchmark and Watch/API primitives. The product closure is limited to metadata receipts that bind:

- provider/model version observed by the canary;
- HELM site/release/snapshot identifier, scenario-suite identifier, run identifier, and AMC-controlled provider route;
- hashes of the source reference, website snapshot, benchmark catalog, scenario-suite manifest, model-registry snapshot, run spec, adapter config, metric suite, and leaderboard snapshot;
- canary result hash, drift statistic hash, and alert-or-waiver hash;
- signed evidence bundle and no-source-copy proof.

No HELM SDK integration, importer, runner, config parser, parity claim, copied website/docs prose, copied benchmark/config/result rows, or leaderboard storage was added.

## Product closure

- Added `src/benchmarks/helmProviderDrift.ts`, a metadata-only proof layer over `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftCiGate`, and `buildProviderDriftWatchAlerts`.
- Added `src/watch/helmProviderDrift.ts` and Watch barrel exports.
- Added API routes for:
  - `POST /api/v1/benchmarks/helm-provider-drift`
  - `POST /api/v1/score/helm-provider-drift`
  - `POST /api/v1/shield/helm-provider-drift/verify`
  - `POST /api/v1/watch/helm-provider-drift`
- Added fail-closed validation for provider version, HELM version/snapshot identifier, scenario-suite and run identifiers, canary result, drift statistic, alert-or-waiver evidence, signed evidence, no-copy proof, metric identifiers/count, and copied-content sentinel fields.
- Added tests for complete metadata, missing required evidence, waiver acceptance, copied-content rejection, provider-version mismatch, and Benchmark/Score/Shield/Watch APIs.

## No-copy boundary

AMC records only caller-owned identifiers and hashes plus minimal source-review metadata. No HELM website prose beyond minimal source metadata, examples, screenshots, benchmark rows, configurations, result tables, leaderboard rows, prompts, datasets, model outputs, or implementation details were copied.
