# GAP-0635 — Bisheng observability live-drift alerts

- Gap: `GAP-0635`
- Dimension: `obs-live-drift-alerts`
- Source: `https://github.com/dataelement/bisheng`
- Source type: public GitHub repository
- Retrieval date: 2026-06-21
- AMC surfaces: Score, Shield, Watch
- AMC modules touched: `src/watch`, `src/drift`, `src/score`

## Live GitHub metadata

Live GitHub metadata was verified before implementation from the isolated `agent/gap-0635` worktree:

- Repository: `dataelement/bisheng`
- Default branch: `main`
- `HEAD` / `refs/heads/main`: `9eb9328e82e70a27b33b847d39639986394bdc09`
- License reported by GitHub API: Apache-2.0
- Primary language reported by GitHub API: TypeScript
- API metadata at retrieval: updated `2026-06-20T15:37:40Z`, pushed `2026-06-20T14:14:29Z`, created `2023-08-28T10:00:24Z`, 11,461 stars, 1,870 forks, 111 open issues
- Latest checked refs from `git ls-remote` / tags API:
  - `vtest` at `f4cd3ba8d06f7859bd7a31c479c694f1efe16509`
  - `v2.6.0-beta4` at `538723cd9f8b64439a836577c08a765327e673ec`
  - `v2.6.0-beta3` at `0835f12abbd92912baab24e36f6e00dad3cfefac`
  - `v2.6.0-beta2` at `b973ed269e6bb337b825343983d511ed44563f5d`
  - `v2.6.0-beta1` at `2814d3e223645cd91ee646c796160483373a036b`
- GitHub contents API metadata checked without copying file contents:
  - `README.md` blob SHA `03bb75fd82a5d84087e598dc7becbd2e516ae3f6`, size 7,477 bytes
  - `LICENSE` blob SHA `da11a3ce3aa786f2f2e5fbd5d471320aa39cf958`, size 10,759 bytes

## Relevance decision

Relevant only as a metadata-grounded source signal for AMC's existing live-drift, Watch-alert, and Score/Shield/Watch projection primitives. The source metadata indicates an enterprise AI platform repository with observability-related scope, but GAP-0635 does **not** add a Bisheng subsystem, SDK wrapper, importer, compatibility layer, parity claim, copied workflow/config format, copied tests, copied documentation prose, or upstream runtime behavior.

## Product closure

- Added `src/watch/bishengObservabilityLiveDrift.ts`, a thin metadata-only wrapper around `runLiveScoreBehaviorDrift` and `buildLiveDriftWatchAlerts`.
- Added Score, Shield, and Watch projections in the same wrapper and re-exported the Watch primitive from `src/watch/index.ts`.
- Added small `src/score` and `src/drift` projection helpers so callers can consume the Score baseline/live/drift statistic and the drift statistic without introducing a Bisheng subsystem.
- The receipt exposes the required acceptance artifacts:
  - baseline distribution: `result.baselineDistribution` / `result.scoreSurface.baselineDistribution`
  - live sample: `result.liveSample` / `result.scoreSurface.liveSample`
  - drift statistic: `result.driftStatistic`
  - alert receipt: `result.alertReceipt`
- The fail-closed proof requires live GitHub metadata hashes, README/license blob IDs, tag-ref hash, AMC-native mapping hashes for Score/Shield/Watch, baseline distribution hash, live sample manifest hash, drift statistic hash, alert receipt hash, CI/signed-evidence hashes, no-subsystem proof, no-SDK/importer proof, and no-copy proof.
- Per-row proof binds only caller-provided AMC telemetry hashes: surface, signal, project/trace/span/eval/dataset/score/alert hashes, tenant boundary, no-raw-payload proof, no-workflow/config-copy proof, evidence refs, signed evidence refs, and row hashes.

## No-copy boundary

AMC records only metadata, hashes, and caller-owned telemetry references. No Bisheng source code, prose, examples, configs, workflows, SDK behavior, datasets, traces, prompts, screenshots, or tests were copied into AMC. Tests use synthetic AMC-owned rows and hashes solely to exercise existing live-drift receipt behavior.
