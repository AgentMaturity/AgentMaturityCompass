# GAP-0615 source review — Humanloop provider drift

- Gap: GAP-0615 / `llmops-provider-drift`
- Source: <https://humanloop.com/> and Humanloop docs markdown pages
- Verified live: 2026-06-20T18:00:10Z via HTTPS fetches from this worktree session
- AMC surfaces: Score, Shield, Watch
- Implementation scope: metadata-only drift wrapper over existing AMC provider drift primitives; no Humanloop SDK, importer, subsystem, parity layer, or copied Humanloop content

## Live source observations

1. `https://humanloop.com/` returned HTTP 200 with title `Humanloop joins Anthropic`. The homepage says the Humanloop platform is being sunset and points users to the docs migration guide.
2. `https://humanloop.com/docs/getting-started/overview.md` returned clean Markdown and describes Humanloop as an LLM evals platform for `Evaluation`, `Prompt Management`, and `Observability`, while also stating the platform will be sunset on **September 8th, 2025**.
3. `https://humanloop.com/docs/guides/migrating-from-humanloop.md` returned clean Markdown and explicitly lists exportable entities: `Files`, `Versions`, `Logs`, and `Evaluations`. It also mentions a Humanloop export tool, but GAP-0615 intentionally does not add an importer/exporter or use Humanloop SDKs.
4. `https://humanloop.com/docs/guides/observability/monitoring.md` returned clean Markdown and describes online Evaluators attached to Prompts, automatic execution on new Logs, and dashboard graphs over time.
5. `https://humanloop.com/docs/v5/llms.txt` returned the current docs index and lists relevant pages for evals in code/UI, Agents, Evaluators, Datasets, Logs, Environments, CI/CD Evaluations, and monitoring.

## Product relevance

Humanloop's current docs still expose the concepts needed for provider drift evidence even though the product is sunset:

- provider/model version observed by a Prompt/Agent canary;
- Humanloop File/Prompt/Agent version metadata;
- Evaluation Run or online Evaluator result identity;
- Logs and dataset exports represented as hashes;
- evaluator configuration/results represented as hashes;
- canary result, drift statistic, and alert-or-waiver evidence hashes.

These map to AMC provider drift acceptance without copying Humanloop data: AMC stores hashes and identifiers only, then reuses `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftCiGate`, and `buildProviderDriftWatchAlerts`.

## Implementation notes

- Added `src/benchmarks/humanloopProviderDrift.ts` as a Humanloop-specific metadata proof layer.
- Added `src/watch/humanloopProviderDrift.ts` and `src/watch/index.ts` exports for Watch consumers.
- Added `POST /api/v1/watch/humanloop-provider-drift` in `src/api/watchRouter.ts`.
- The result returns explicit `score`, `shield`, and `watch` surfaces:
  - Score: report id, recommendation, provider versions, drift statistics, evidence hash.
  - Shield: CI/lifecycle gate, blocked status, active and waived alert ids.
  - Watch: projected unwaived provider drift alerts.
- Fail-closed evidence checks require provider version, file version id, environment id, evaluation run id, provider route id, metric ids/count, canary result hash, drift statistic hash, alert-or-waiver hash, signed evidence bundle hash, and no-source-copy proof hash.
- Forbidden content fields such as prompt text, messages, inputs/outputs, log payloads, dataset rows, and file/version contents trigger metadata-only alerts.

## Caveats

- Humanloop has announced platform sunset; the integration is therefore designed for historical exports and metadata receipts rather than live Humanloop API calls.
- No Humanloop SDK/API importer/parity implementation was added by design.
