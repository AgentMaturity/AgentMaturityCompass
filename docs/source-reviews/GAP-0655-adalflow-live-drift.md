# GAP-0655 — AdalFlow live score / behavior drift source-review boundary

- Gap: `GAP-0655`
- Source repository: `https://github.com/SylphAI-Inc/AdalFlow`
- Source ref: `github:SylphAI-Inc/AdalFlow`
- Source type: live GitHub repository metadata
- AMC surfaces requested: Score, Shield, Watch
- Dimension: `obs-live-drift-alerts`
- Retrieval: `2026-06-21` via GitHub repository API and `git ls-remote --symref`

## Live source metadata

Live GitHub metadata was verified before closing this review:

- API status: `200`
- API `full_name`: `SylphAI-Inc/AdalFlow`
- HTML URL: `https://github.com/SylphAI-Inc/AdalFlow`
- Default branch: `main`
- HEAD ref: `refs/heads/main`
- HEAD commit at retrieval: `810de99d86191b3aa0c939aa6d6d1a21977555aa`
- License metadata: `MIT` (`MIT License`)
- Primary language metadata: `Python`
- GitHub API description: `AdalFlow: The library to build & auto-optimize LLM applications.`
- GitHub API topics at retrieval: `agent`, `ai`, `auto-prompting`, `bm25`, `chatbot`, `faiss`, `framework`, `generative-ai`, `information-retrieval`, `llm`, `machine-learning`, `nlp`, `optimizer`, `python`, `question-answering`, `rag`, `reranker`, `retriever`, `summarization`, `trainer`
- GitHub API counts at retrieval: 4,166 stars; 376 forks; 64 open issues; 4,166 watchers; 23 subscribers
- GitHub API timestamps at retrieval: created `2024-04-19T05:05:13Z`; pushed `2026-05-29T05:49:13Z`; updated `2026-06-17T13:03:37Z`
- Archived/disabled flags at retrieval: archived `false`; disabled `false`
- Metadata SHA-256: `17874e26e321b024f888e72ecf03dfe1de42a7deaba8fb568213bde00f6f147b`
- Retrieval command evidence: `git ls-remote --symref https://github.com/SylphAI-Inc/AdalFlow.git HEAD` returned `refs/heads/main` and the HEAD commit above; the GitHub repository API returned the metadata above.

The metadata hash is over the canonical, sorted JSON object containing the API status, repository identity, default branch, HEAD ref/SHA, license, description, language, topics, counts, timestamps, and archived/disabled flags listed above.

## Relevance decision

Relevant to AMC only through existing Watch live score and behavior drift primitives. AdalFlow repository metadata can identify a reviewed LLM application/agent framework and optimization source, but it does not itself provide AMC-owned baseline/live score windows, behavior signatures, alert thresholds, signed evidence, row hashes, or replayable Watch receipts.

For Score, Shield, or Watch claims, AdalFlow-related evidence must be represented as generic AMC live-drift source refs attached to `src/watch/liveDriftAlerts.ts` receipts. The source review does not justify an AdalFlow-specific live-drift subsystem, SDK, importer, adapter, benchmark runner, parity layer, optimizer wrapper, or copied upstream implementation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Watch | Yes, only when AMC-owned baseline/live trace windows use the existing `live-score-behavior-drift` receipt path with signed evidence refs, row hashes, thresholds, and alert receipts. |
| Score | Yes, only as signed score-window evidence processed by existing live-drift scoring primitives; repository metadata alone fails closed. |
| Shield | Yes, only when behavior drift affects safety, refusal, error, unsupported-action, or policy-relevant metrics in signed AMC evidence. |
| Fleet | No direct runtime/fleet orchestration scope from this source review. |
| Enforce | No enforcement-policy implementation scope from this source review. |
| Vault | No secrets, provenance vault, or artifact-store scope from this source review. |
| Passport | No passport/credential issuance scope from this source review. |
| Comply | No compliance attestation scope beyond preserving this source-review/no-copy boundary. |

## Product closure

- Bound GAP-0655 to existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` primitives via focused tests.
- Kept AdalFlow metadata as source-review context only; accepted evidence remains AMC-owned live score windows, behavior signatures, thresholds, signed evidence refs, row hashes, receipt hashes, and Watch alerts.
- No methodology version bump or source-specific metric family was added because the existing Watch live-drift model already covers the relevant Score/Shield/Watch behavior.

## Fail-closed rule

AdalFlow repository metadata, GitHub counts, topics, README positioning, optimizer labels, branch head, license metadata, and repository identity must fail closed for live score/behavior drift claims. Passing evidence requires AMC-owned baseline and live trace windows, behavior signatures, thresholds, signed evidence refs, row hashes, receipt hashes, and Watch alert or waiver proof.

## No-bloat boundary

No upstream code, README prose, docs prose, examples, prompts, configs, tests, data, benchmark definitions, optimizer logic, implementation details, or assets were copied. No AdalFlow subsystem, SDK/importer, adapter, parity layer, benchmark runner, optimizer wrapper, or source-specific live-drift implementation was added.

## Verification

- Focused regression: `npx vitest run tests/gap0655AdalFlowLiveDriftBoundary.test.ts tests/gap0650To0658SourceReviewShape.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
