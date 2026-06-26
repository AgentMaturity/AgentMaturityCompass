# GAP-1001 - EmoLLM live drift

- Gap: `GAP-1001`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `SmartFlowAI/EmoLLM`
- Retrieval: live GitHub API, raw repository files, release metadata, license endpoint, and `git ls-remote` on `2026-06-24`
- Status: Done

## Relevance decision

`SmartFlowAI/EmoLLM` is relevant to AMC because it is a public mental-health LLM repository with model configurations, datasets, evaluation materials, RAG/deployment materials, and explicit safety limitations. It maps to the existing Watch live score and behavior drift primitive for high-risk conversational agents, especially where Score/Shield/Watch need to detect degraded score, changed behavior, unsafe support responses, privacy-sensitive disclosure, missing escalation, or other runtime drift.

This is not a clinical or medical capability claim for AMC. The source does not justify an EmoLLM runner, dataset importer, evaluation-script wrapper, RAG pipeline, model adapter, clinical subsystem, or medical advice feature. AMC accepts this source only through existing baseline distribution, live sample, drift statistic, alert receipt, evidence refs, signed evidence refs, and fail-closed Watch alert proof.

Live metadata facts reviewed:

- Repository: `https://github.com/SmartFlowAI/EmoLLM`
- GitHub API: `https://api.github.com/repos/SmartFlowAI/EmoLLM`
- README: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/README.md`
- English README: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/README_EN.md`
- License API: `https://api.github.com/repos/SmartFlowAI/EmoLLM/license`
- Evaluation README: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/README_EN.md`
- General evaluation doc: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/General_evaluation_EN.md`
- Professional evaluation doc: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/evaluate/Professional_evaluation_EN.md`
- Datasets README: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/datasets/README_EN.md`
- RAG README: `https://raw.githubusercontent.com/SmartFlowAI/EmoLLM/main/rag/README_EN.md`
- Release reviewed: `https://github.com/SmartFlowAI/EmoLLM/releases/tag/v0.6`
- Git HEAD/default branch: `955155bb536eb1c28ff4500c6dc6a093a24e8209`, default branch `main`
- Repository state: public, not archived, not disabled, not a fork
- Primary language: Python
- License: MIT License
- Topics reviewed: dataset, depoly, evaluation, llm, post-training, the-big-model-of-mental-health
- Counts at retrieval: 1,749 stars, 222 forks, 5 open issues
- Timestamps reviewed: created_at `2024-01-11T08:58:19Z`, pushed_at `2026-06-18T16:47:43Z`, updated_at `2026-06-21T15:11:27Z`
- Latest release reviewed: latest release `v0.6`, published_at `2025-05-18T15:43:36Z`
- Model-family/source context reviewed: InternLM, Qwen, Baichuan, DeepSeek, Mixtral, LLaMA, ChatGLM
- Evaluation context reviewed: General Metrics Evaluation and Professional Metrics Evaluation
- Repository areas reviewed: datasets, RAG, deployment, evaluation, fine-tuning, and demo materials
- Safety limitation reviewed: the English README frames EmoLLM as emotional support and states it is not a substitute for licensed psychological or therapy professionals.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing live score drift receipts. Score claims require baseline distribution, live sample, score drift statistic, row hashes, and signed evidence refs. |
| Shield | Relevant through existing unsafe-response, privacy-sensitive disclosure, social-harm, red-team, and escalation/handoff drift signals. No new clinical safety subsystem was added. |
| Enforce | Context only. No runtime guardrail, policy enforcement, or circuit breaker changed. |
| Vault | Context only. No secrets, DLP, privacy storage, or data residency behavior changed. |
| Watch | Directly relevant through existing live score and behavior drift alert receipts and Watch alert projection. |
| Fleet | Context only. No multi-agent orchestration or fleet trust topology changed. |
| Passport | Not relevant; no portable trust token or external proof bundle changed. |
| Comply | Context only. No medical, healthcare, EU AI Act, NIST, ISO, SOC2, or compliance mapping changed. |

## Product closure

No new product module was added. The existing `src/watch/liveDriftAlerts.ts` primitive already supports the required baseline distribution, live sample, drift statistic, alert receipt, evidence refs, signed evidence refs, and fail-closed alert behavior.

The focused regression uses AMC-owned synthetic fixture rows to prove that EmoLLM mental-health support context can be accepted only through existing Watch live-drift receipts. The positive path exercises Score/Shield/Watch drift over score mean, behavior signature, social harm, sensitive disclosure, authority handoff, red-team unsafe response, red-team compliance, and red-team guard score. The negative path proves source metadata without signed live-drift evidence fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API, CLI, Studio, badge, diagnostic question bank, RAG, model runner, dataset importer, evaluation runner, or clinical subsystem changed for this gap.

## Fail-closed rule

EmoLLM repository metadata, stars, forks, issues, README claims, model-family names, dataset names, evaluation-file names, RAG/deploy folders, release tags, license metadata, local backlog text, or broad mental-health/support language must fail closed for AMC live-drift claims.

Passing live-drift evidence requires AMC-owned baseline distribution, live sample, drift statistic, alert receipt, evidence refs, signed evidence refs, row-level trace IDs, window IDs, behavior signatures, threshold policy, and Watch alert proof. Missing signed evidence must emit a fail-closed alert.

## No-bloat boundary

This gap did not add and must not add an EmoLLM runner, EmoLLM adapter, model-weight integration, dataset importer, dataset mirror, evaluation script wrapper, RAG pipeline, deployment adapter, prompt pack, Chinese/English README importer, medical/clinical subsystem, crisis-care workflow, professional counseling claim, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, copied upstream code, copied upstream docs prose, copied datasets, copied evaluation rows, copied metrics, copied prompts, copied model configs, copied RAG files, copied demo code, copied deployment scripts, copied screenshots, or copied implementation details.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1001EmollmLiveDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1001-emollm-live-drift.md` did not exist; the three Watch drift primitive tests passed.
- Focused test after doc: `npx vitest run tests/gap1001EmollmLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired adjacent source-review tests: `npx vitest run tests/gap1000WfgyPublicMethodologyBoundary.test.ts tests/gap1001EmollmLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Source-specific implementation token scan: `rg -n "SmartFlowAI/EmoLLM|https://github.com/SmartFlowAI/EmoLLM|EmoLLM|emollm_live_drift" src/watch/liveDriftAlerts.ts src/drift/continuousMonitor.ts src/score/index.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 848 files / 7,384 tests.
- Post-doc focused rerun: `npx vitest run tests/gap1001EmollmLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
