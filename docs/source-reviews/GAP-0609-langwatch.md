# GAP-0609 source review: LangWatch

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0609`
Branch: `agent/gap-0609`

## Gap

- Gap: `GAP-0609` / P0 / Agent evaluation and benchmarks
- Dimension: `eval-replay-corpus`
- Surfaces requested: Score, Shield, Watch
- Source URL: <https://langwatch.ai>
- Affected AMC modules reviewed: `src/eval`, `src/diagnostic`, `tests`

## Live source metadata verified

Verified live public page/docs metadata on 2026-06-20. This review intentionally used only public metadata as high-level source signal; it did not copy LangWatch source code, docs prose, screenshots, claims, sample prompts, datasets, traces, evaluator configs, or UI assets into AMC.

- Homepage: <https://langwatch.ai> returned HTTP 200 with title `LangWatch: AI Agent Testing and LLM Evaluation Platform` and product-page metadata for AI agent testing, LLM evaluation, and LLM observability.
- Docs entrypoint: <https://docs.langwatch.ai> returned HTTP 200 and redirected to <https://langwatch.ai/docs/introduction>, with metadata for observability, evaluations, and agent simulations.
- Docs index: <https://docs.langwatch.ai/llms.txt> returned HTTP 200 and listed public docs/API areas for traces, datasets, evaluator configurations, evaluators, evaluations, monitors, prompts, annotations, scenarios, simulation runs, triggers, and workflows.

## Relevance decision

Relevant to AMC, narrowly, as a high-level eval-replay-corpus source signal for the existing Score, Shield, and Watch surfaces. The live public metadata describes an LLMOps/agent-testing platform with traces, datasets, evaluator configuration, evaluator/scoring APIs, evaluation runs, online monitors, prompt/version workflows, annotations, scenarios, and simulation runs. Those concepts map to AMC's existing replay benchmark corpus, signed eval import, diagnostic question coverage, and fail-closed Watch/CI receipt paths.

It is **not** a reason to add a standalone LangWatch subsystem, claim feature parity, copy LangWatch examples/docs, or accept product/docs metadata as evidence. A real AMC claim must still be backed by an AMC-owned replay pack with deterministic fixture hashes, replay manifest, dataset/scenario/trace/result/evaluator hashes, signed evidence rows, score delta, and a CI/lifecycle receipt.

## AMC/8 surface check

| AMC surface | Relevance | Handling |
|---|---:|---|
| Score | Yes | LangWatch-style score/evaluation outputs can affect AMC Score only when bound to replayable AMC-owned fixtures, signed evidence refs, fixture hashes, score deltas, and result manifests. |
| Shield | Yes | Guardrail/evaluator/prompt-shield claims require deterministic policy hashes, judge/evaluator config hashes, no-copy boundaries, trace evidence, and signed ledger evidence. |
| Enforce | No direct GAP scope | No enforcement policy or runtime blocking changes were needed. |
| Vault | No direct GAP scope | No secret, privacy, residency, or vault storage changes were needed. |
| Watch | Yes | Online monitor/evaluation-run signals map to existing fail-closed replay-corpus CI/lifecycle receipts and Watch alerts. |
| Comply | Indirect only | Compliance claims remain documentation/source-review context; no new compliance control was added. |
| Fleet | No direct GAP scope | No fleet rollout or tenant orchestration change was needed. |
| Passport | No direct GAP scope | No portable credential/passport change was needed. |

## AMC-native closure

- Reused existing `runReplayBenchmarkCorpus` / `verifyReplayBenchmarkCorpusReceipt` primitives for replay evidence instead of adding a LangWatch-specific subsystem.
- Added `langwatch` support to the existing eval-import dispatch/mapping path so exported evaluation rows can be normalized into signed AMC evidence and diagnostic question coverage when a user provides their own data.
- Added source-review regression coverage in `tests/langwatchEvalReplayCorpus.test.ts` proving a LangWatch-style eval pack is replayable only when it has:
  - AMC-owned eval fixture and deterministic seed,
  - replay manifest and fixture hash,
  - dataset/scenario, trace/export, evaluator/judge, guardrail/scoring-policy, result/report, replay-command, and CI receipt hashes,
  - signed baseline/candidate evidence refs,
  - score delta and replay pass-rate gates,
  - CI/lifecycle receipt verification and no Watch alerts on passing CI.
- Added a metadata-only negative case proving source URL/docs metadata plus local scores fail closed without signed rows, replay command, dataset/scenario, trace/result/report artifacts, and CI/lifecycle receipt proof.

## Copy/provenance boundary

No LangWatch code, commands, docs prose, screenshots, UI assets, prompts, datasets, traces, score rows, evaluator configs, examples, claims, or generated reports were copied into AMC. The source was used only for live metadata and high-level relevance mapping.

## Integration instructions

For a real AMC user-owned LangWatch-style eval pack to count as Score/Shield/Watch replay evidence, submit it through the existing replay benchmark corpus path with signed ledger evidence for baseline and candidate rows, deterministic fixture hashes, dataset/scenario manifests, evaluator/judge config hashes, trace/export hashes, result/report manifests, replay command hashes, score delta, and a CI/lifecycle receipt. Product-page/docs metadata alone must remain fail-closed.
