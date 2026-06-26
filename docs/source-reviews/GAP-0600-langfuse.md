# GAP-0600 source review: Langfuse

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0600`
Branch: `agent/gap-0600`

## Gap

- Gap: `GAP-0600` / P0 / Agent evaluation and benchmarks
- Dimension: `eval-replay-corpus`
- Surfaces requested: Score, Shield, Watch
- Source URL: <https://langfuse.com>
- Affected AMC modules reviewed: `src/eval`, `src/diagnostic`, `tests`

## Live source metadata verified

Verified live public page/docs metadata on 2026-06-20. This review intentionally used only public product/docs metadata as high-level source signal; it did not copy source code, docs prose, screenshots, claims, example datasets, traces, prompts, or UI assets into AMC.

- Homepage: <https://langfuse.com> returned HTTP 200 and exposed high-level terms for eval/evaluation, traces, and prompts.
- Docs index: <https://langfuse.com/llms-docs.txt> returned HTTP 200 and identified Langfuse as an open-source AI engineering platform with documentation entries for evaluation, datasets, scoring, traces, monitors, and guardrails.
- Evaluation overview: <https://langfuse.com/docs/evaluation/overview.md> describes collecting LLM evaluations in one place across model-based evaluation, human annotations, and custom API/SDK evaluation workflows.
- Core concepts: <https://langfuse.com/docs/evaluation/core-concepts.md> names Scores, Evaluation Methods, Datasets, and Experiments as evaluation concepts.
- Code evaluators: <https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators.md> covers deterministic Python/TypeScript evaluators over observations/experiments.
- LLM-as-a-Judge: <https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge.md> covers rubric-guided automated scoring.
- Scores via API/SDK: <https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk.md> covers custom score ingestion on traces, observations, sessions, and dataset runs.
- Datasets: <https://langfuse.com/docs/evaluation/experiments/datasets.md> covers datasets for structured experiments and benchmarks.
- Experiments in CI/CD: <https://langfuse.com/docs/evaluation/experiments/experiments-ci-cd.md> covers running experiments in CI and gating changes before production.
- Monitors and Alerts: <https://langfuse.com/docs/metrics/features/monitors.md> covers threshold-based metric alerts.
- Trace IDs and Distributed Tracing: <https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing.md> covers deterministic/custom trace IDs and links across services.
- Security and Guardrails: <https://langfuse.com/docs/security-and-guardrails.md> covers monitoring/evaluating LLM safety concerns such as prompt injection, PII leakage, and harmful content.

## Relevance decision

Relevant to AMC, narrowly, as a high-level eval-replay-corpus source signal for the existing Score, Shield, and Watch surfaces. Langfuse's public docs describe traces/observations, scores, datasets/experiments, deterministic/code evaluators, LLM-as-judge evaluation, CI/CD experiment gates, monitors/alerts, and guardrail monitoring. Those map to AMC's existing replay benchmark corpus and eval-pack proof requirements.

It is **not** a reason to add a standalone Langfuse subsystem, copy Langfuse examples/docs/claims, or accept Langfuse product-page metadata as evidence. A real AMC claim must still provide an AMC-owned replay pack with fixture hash, replay manifest, deterministic seed, trace/result exports, scorer/judge config hashes, signed evidence rows, score delta, and a CI/lifecycle receipt.

## AMC/8 surface check

| AMC surface | Relevance | Handling |
|---|---:|---|
| Score | Yes | Langfuse-style score/evaluation outputs can affect AMC Score only when bound to replayable AMC-owned fixtures, signed evidence refs, fixture hashes, score deltas, and result manifests. |
| Shield | Yes | Guardrail, evaluator, judge, and safety-scoring claims require deterministic policy hashes, judge/scorer configs, trace evidence, no-copy boundaries, and signed ledger evidence. |
| Enforce | No direct GAP scope | No enforcement policy or runtime blocking changes were needed. |
| Vault | No direct GAP scope | No secret, privacy, residency, or vault storage changes were needed. |
| Watch | Yes | CI/CD experiment gates and monitor/alert signals map to existing fail-closed replay-corpus CI/lifecycle receipts and Watch alerts. |
| Comply | Indirect only | Compliance claims remain documentation/source-review context; no new compliance control was added. |
| Fleet | No direct GAP scope | No fleet rollout or tenant orchestration change was needed. |
| Passport | No direct GAP scope | No portable credential/passport change was needed. |

## AMC-native closure

- Reused the existing `runReplayBenchmarkCorpus` / `verifyReplayBenchmarkCorpusReceipt` primitives instead of adding a Langfuse-specific subsystem or importer.
- Added source-review regression coverage in `tests/langfuseEvalReplayCorpus.test.ts` proving a Langfuse-style eval pack is replayable only when it has:
  - AMC-owned eval fixture and deterministic seed,
  - replay manifest and fixture hash,
  - dataset/experiment, trace/export, scorer/judge, score-policy, result/report, replay-command, and CI receipt hashes,
  - signed baseline/candidate evidence refs,
  - score delta and replay pass-rate gates,
  - CI/lifecycle receipt verification and no Watch alerts on passing CI.
- Added a metadata-only negative case proving source URL/docs metadata plus local scores fail closed without signed rows, replay command, eval-pack dataset, trace/result/report artifacts, and CI/lifecycle receipt proof.

## Copy/provenance boundary

No Langfuse code, commands, docs prose, screenshots, UI assets, prompts, datasets, traces, score rows, examples, claims, or generated reports were copied into AMC. The source was used only for live metadata and high-level relevance mapping.

## Integration instructions

For a real AMC user-owned Langfuse-style eval pack to count as Score/Shield/Watch replay evidence, submit it through the existing replay benchmark corpus path with signed ledger evidence for baseline and candidate rows, deterministic fixture hashes, dataset/experiment manifests, judge/scorer config hashes, trace/export hashes, result/report manifests, replay command hashes, score delta, and a CI/lifecycle receipt. Product-page/docs metadata alone must remain fail-closed.
