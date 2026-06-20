# GAP-0631 — Inspect AI provider/model drift boundary

- Gap: `GAP-0631`
- Source: `https://inspect.aisi.org.uk/`
- Source type: public open-source evaluation framework documentation
- Retrieval date: 2026-06-20T19:07:18Z
- Dimension: `llmops-provider-drift`
- AMC surfaces: Score, Shield, Watch

## Live source metadata

Live retrieval from this worktree session returned:

| URL | Status | Content type | Last modified | ETag | First-200KB SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| `https://inspect.aisi.org.uk/` | 200 | `text/html; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-141c3"` | `5a578bb188b955526e07b84e72fcb43ffaf78ae8b3322f6b051b13d54f7b3169` |
| `https://inspect.aisi.org.uk/llms.txt` | 200 | `text/plain; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-2d34"` | `5d63c797e92c3a236ad1f675a2998da6d17bf92e3bf2e31517b53db5e93f89a4` |
| `https://inspect.aisi.org.uk/index.html.md` | 200 | `text/markdown; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-285b"` | `68abd724b10cd35e4a63fddf363e6af18835dd4a161d2c99ddd1a2d1e4d5df5e` |
| `https://inspect.aisi.org.uk/models.html.md` | 200 | `text/markdown; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-3738"` | `b1c0caca775bc261b563ff4779385e9f4ae934bc3f890b2c453ed6f515bb24ac` |
| `https://inspect.aisi.org.uk/eval-logs.html.md` | 200 | `text/markdown; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-978a"` | `c63c67c8baecf059674b3126dde26363efa11cac0eddaee85c1857bf02975460` |
| `https://inspect.aisi.org.uk/scorers.html.md` | 200 | `text/markdown; charset=utf-8` | `Fri, 19 Jun 2026 12:30:09 GMT` | `"6a353651-1b92"` | `5cc32bc37bb4eeb3f789cf8b38359a3f8f691bbab2d71ed4f98562234a2b1eed` |

The live docs describe Inspect as an open-source framework for large language model evaluations, with model/provider support, evaluation logs, and scorers. That is sufficient source relevance for a metadata-only AMC drift wrapper, but not for a new Inspect subsystem.

## Relevance decision

Relevant only to AMC's existing provider/model drift benchmark and Watch/API primitives. The product closure is limited to metadata receipts that bind:

- provider/model version observed by the canary;
- Inspect task/eval-run identifiers and Inspect runner version;
- hashes of task, dataset, solver/scorer configuration manifests, eval-log manifest, and score report;
- canary result hash, drift statistic hash, and alert-or-waiver hash;
- signed evidence bundle and no-source-copy proof.

No Inspect AI SDK integration, importer, runner, config parser, parity claim, copied website/docs prose, or Inspect task/log/config storage was added.

## Product closure

- Added `src/benchmarks/inspectProviderDrift.ts`, a metadata-only proof layer over `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftCiGate`, and `buildProviderDriftWatchAlerts`.
- Added `src/watch/inspectProviderDrift.ts` and Watch barrel exports.
- Added API routes for:
  - `POST /api/v1/benchmarks/inspect-provider-drift`
  - `POST /api/v1/score/inspect-provider-drift`
  - `POST /api/v1/shield/inspect-provider-drift/verify`
  - `POST /api/v1/watch/inspect-provider-drift`
- Added fail-closed validation for provider version, canary result, drift statistic, alert-or-waiver evidence, signed evidence, no-copy proof, metric/scorer identifiers, and copied-content sentinel fields.
- Added tests for complete metadata, missing required evidence, waiver acceptance, copied-content rejection, provider-version mismatch, and Benchmark/Score/Shield/Watch APIs.

## No-copy boundary

No Inspect website prose beyond minimal source metadata, examples, screenshots, task source, task configs, solver/scorer configs, eval logs, score reports, prompts, datasets, model outputs, or docs content were copied. The wrapper only accepts caller-owned hashes and identifiers.
