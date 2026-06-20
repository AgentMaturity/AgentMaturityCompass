# GAP-0618 source review: HoneyHive

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0618`
Branch: `agent/gap-0618`

## Gap

- Gap: `GAP-0618` / Agent evaluation and benchmarks
- Dimension: `eval-replay-corpus`
- Surfaces requested: Score, Shield, Watch
- Source URL: <https://www.honeyhive.ai/>
- Affected AMC modules reviewed: `src/eval`, `src/diagnostic`, `tests`

## Live source metadata verified

Verified live public page/docs metadata on 2026-06-20. This review used only public metadata as a high-level relevance signal; it did not copy HoneyHive code, SDK usage, commands, docs prose, screenshots, UI assets, prompts, datasets, traces, evaluator configs, examples, reports, or product claims into AMC.

- Homepage: <https://www.honeyhive.ai/> returned HTTP 200 with title `HoneyHive - The Observability Layer for Production Agents`, metadata describing observability and evaluation for production agents, and SHA-256 `ab186e299b70a30e008dc2426f820d68c97caf7f703fb273d579dca1a1d78f68`.
- Docs index: <https://docs.honeyhive.ai/llms.txt> returned HTTP 200 and describes HoneyHive as an AI observability and evaluation platform for tracing, evaluating, monitoring, and improving AI agents/LLM applications. SHA-256: `3fccc5aa50b08ae8b8b493ce868a3aa5cdfef3d12d8be96857c748d49dda5e1b`.
- Overview doc: <https://docs.honeyhive.ai/v2/introduction/what-is-hhai.md> returned HTTP 200 markdown with observability/evaluation/monitoring signals. SHA-256: `8c2e23f26cd88b63117e2a24c099e186e2c554b0c9b0b8a087a41cedfc052cfc`.
- Experiments quickstart: <https://docs.honeyhive.ai/v2/introduction/experiments-quickstart.md> returned HTTP 200 markdown with experiment/evaluation signals. SHA-256: `02265466dd8f9b32ce7598124d0c2b8f66e943e9ef7041a225b83f56ed2283c1`.
- Tracing introduction: <https://docs.honeyhive.ai/v2/tracing/introduction.md> returned HTTP 200 markdown with distributed tracing signals for AI applications. SHA-256: `a95d764e2b082471d04597c364c2cea69b5b2437c5e4c9f0893746e8a7e304cb`.

## Relevance decision

Relevant to AMC, narrowly, as a high-level eval-replay-corpus source signal for existing Score, Shield, and Watch evidence flows. The live public metadata describes agent observability, tracing, experiments/evaluations, evaluators/scoring, and monitoring concepts that map to AMC's existing replay benchmark corpus, signed evidence, score-delta, CI/lifecycle receipt, and diagnostic fail-closed paths.

This is **not** a reason to add a HoneyHive subsystem, SDK integration, importer, compatibility/parity claim, copied docs/examples, or dashboard-specific behavior. A real AMC claim must still be backed by an AMC-owned replay pack with deterministic fixture hashes, replay manifest, baseline/candidate result hashes, signed evidence rows, score delta, and a CI/lifecycle receipt.

## AMC/8 surface check

| AMC surface | Relevance | Handling |
|---|---:|---|
| Score | Yes | HoneyHive-style evaluation/score outputs can affect AMC Score only when bound to AMC-owned replay fixtures, manifest/fixture hashes, signed evidence refs, baseline/candidate results, and score delta. |
| Shield | Yes | Evaluator/monitor/guardrail-style claims require deterministic policy/evaluator hashes, trace evidence, no-copy boundaries, and signed rows; product metadata alone fails closed. |
| Enforce | No direct GAP scope | No runtime enforcement or policy-blocking path was added. |
| Vault | No direct GAP scope | No secret, privacy, residency, or vault storage change was needed. |
| Watch | Yes | Monitoring/evaluation-run signals map to existing fail-closed replay-corpus CI/lifecycle receipts and Watch alerts. |
| Comply | Indirect only | Compliance claims remain source-review context; no compliance control was added. |
| Fleet | No direct GAP scope | No fleet orchestration or rollout change was needed. |
| Passport | No direct GAP scope | No passport/portable credential change was needed. |

## AMC-native closure

- Reused existing `runReplayBenchmarkCorpus` / `verifyReplayBenchmarkCorpusReceipt` primitives instead of adding any HoneyHive-specific subsystem, SDK adapter, importer, or parity layer.
- Added a generic eval replay corpus evidence receipt helper in `src/eval/replayCorpusEvidenceReceipt.ts` that summarizes replay manifest hash, fixture hash, CI receipt hash, score delta, signed row count, failed rows, and Score/Shield/Watch surface coverage.
- Added a diagnostic boundary helper in `src/diagnostic/evalReplayCorpusBoundary.ts` that blocks Score/Shield/Watch readiness when the eval replay receipt is metadata-only, unsigned, or fail-closed.
- Added `tests/honeyHiveEvalReplayCorpus.test.ts` coverage proving a HoneyHive-style eval pack is accepted only with:
  - AMC-owned deterministic fixture and seed,
  - replay manifest and fixture hash,
  - dataset/experiment, trace/export, evaluator/judge, monitor/scoring-policy, result/report, replay-command, and CI receipt hashes,
  - signed baseline/candidate evidence refs,
  - score delta and replay pass-rate gates,
  - CI receipt verification and no Watch alerts on passing CI.
- Added a metadata-only negative case proving public source/docs metadata plus local scores fail closed without signed rows, replay command, dataset/trace/result/report artifacts, and CI/lifecycle receipt proof.

## Copy/provenance boundary

No HoneyHive code, SDK/import commands, docs prose, screenshots, UI assets, prompts, datasets, traces, evaluator configs, examples, product claims, or generated reports were copied into AMC. Public source metadata was used only to determine relevance and to anchor source-review hashes.

## Integration instructions

For a real user-owned HoneyHive-style eval pack to count as AMC Score/Shield/Watch replay evidence, submit it through the existing replay benchmark corpus path with signed ledger evidence for baseline and candidate rows, deterministic fixture hashes, dataset/experiment manifests, evaluator/judge config hashes, trace/export hashes, result/report manifests, replay command hashes, score delta, and a CI/lifecycle receipt. Product-page/docs metadata alone must remain fail-closed.
