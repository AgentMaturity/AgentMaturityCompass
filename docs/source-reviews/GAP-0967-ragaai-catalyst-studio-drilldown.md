# GAP-0967 - RagaAI Catalyst Studio drilldown

- Gap: `GAP-0967`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live GitHub repository page at `https://github.com/raga-ai-hub/RagaAI-Catalyst`, docs directory at `https://github.com/raga-ai-hub/RagaAI-Catalyst/tree/main/docs`, quickstart at `https://github.com/raga-ai-hub/RagaAI-Catalyst/blob/main/Quickstart.md`, and license at `https://github.com/raga-ai-hub/RagaAI-Catalyst/blob/main/LICENSE`
- Retrieval: `2026-06-22` live source review through the web research channel.
- Status: closed through existing Score/Watch Studio evidence drilldown receipts only; no RagaAI adapter, Catalyst SDK integration, dashboard clone, trace importer, analytics importer, or source-specific Studio panel added.
- Linear: `AMC-1245`

## Live source metadata

The live GitHub repository page identifies `raga-ai-hub/RagaAI-Catalyst` as public and showed 16.2k stars, 3.6k forks, 17 issues, 17 pull requests, 0 security and quality findings, 1,095 commits, and Apache-2.0 license labeling during review.

The README positions RagaAI Catalyst as a Python SDK and platform around agent AI observability, monitoring, and evaluation. It describes project management, dataset management, evaluation management, trace management, agentic tracing, prompt management, synthetic data generation, guardrail management, and red-teaming. The backlog and live page also identify dashboard-oriented timeline and execution graph context for multi-agent debugging.

No RagaAI code, SDK examples, API snippets, docs prose beyond minimal metadata facts, screenshots, trace samples, prompts, datasets, generated outputs, dashboard assets, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0967 is relevant to AMC only through existing Studio evidence drilldown behavior. The useful signal is not the Catalyst SDK itself; it is the operator workflow of opening a scored finding and seeing traces, receipts, policy/source context, evidence preview, source artifact links, and empty/error states in one place.

The accepted AMC primitive already exists: `buildScoreEvidenceDrilldown` plus `buildWatchObsStudioSourceArtifactLinks`. Valid proof requires UI route, source artifact links, trace preview, receipt preview, evidence preview, empty-state receipts, error-state receipts, accepted/rejected evidence, row hash, and signed Score/Shield/Watch evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through Score evidence drilldown rows that bind findings to accepted/rejected signed evidence. |
| Shield | Relevant when guardrail, red-team, or unsafe-behavior evidence appears in the drilldown preview. |
| Enforce | No runtime policy, guardrail, or circuit breaker changed in this slice. |
| Vault | No secrets, DLP, privacy, data residency, or storage behavior changed. |
| Watch | Relevant through Watch source artifact links and observability preview receipts. |
| Fleet | Multi-agent debugging context only; no Fleet topology or orchestration behavior changed. |
| Passport | No portable proof-bundle field changed. |
| Comply | No compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing Studio drilldown primitives can accept RagaAI Catalyst context only when AMC has a UI route, source artifact links, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, empty-state hash, error-state hash, accepted evidence, rejected evidence, and row hash proof.

The acceptance contract remains UI route, source artifact links, evidence preview, and empty/error states, with all preview hashes and evidence IDs owned by AMC.

The positive path produces a ready UI drilldown preview for Score/Shield/Watch. The negative path fails closed when repository metadata replaces AMC-owned evidence preview receipts.

## Fail-closed rule

RagaAI Catalyst repository metadata, README claims, license labels, star/fork/issue/PR counts, commit counts, SDK labels, dashboard labels, timeline labels, execution graph labels, tracing labels, evaluation labels, guardrail labels, prompt labels, synthetic data labels, red-teaming labels, and local backlog metadata are not Studio drilldown proof.

A Studio evidence drilldown claim must fail closed unless UI route, source artifact links, trace preview, reasoning trace preview, receipt preview, evidence preview, source artifact preview, empty-state receipts, error-state receipts, accepted/rejected evidence, row hash, and signed evidence exist.

## No-bloat boundary

No RagaAI adapter, Catalyst SDK integration, Python SDK bridge, trace importer, analytics importer, dashboard clone, timeline renderer, execution graph renderer, project/dataset/evaluation importer, prompt manager, synthetic data generator, guardrail manager, red-team runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, package dependency, or source-specific scoring path was added.

No upstream code, docs prose, screenshots, examples, prompts, datasets, trace samples, dashboard assets, configs, generated outputs, model responses, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0967RagaAiCatalystStudioDrilldownBoundary.test.ts --reporter=dot` - 1 file / 4 tests passed.
- Paired regression: `npx vitest run tests/gap0966TencentWeKnoraProviderDriftBoundary.test.ts tests/gap0967RagaAiCatalystStudioDrilldownBoundary.test.ts --reporter=dot` - 2 files / 8 tests passed.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` - passed.
- Typecheck: `npm run typecheck` - passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
