# GAP-0680 — Vellum provider-drift boundary

- Gap: `GAP-0680`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.vellum.ai/`, `https://www.vellum.ai/product`, `https://www.vellum.ai/docs/key-concepts/model-profiles`
- Retrieval: `2026-06-21` via browser access to the live Vellum homepage, product page, docs homepage, and model-profiles docs; shell network remains DNS-restricted in this environment.
- Status: skipped as provider-drift implementation evidence; no Vellum adapter, importer, monitor, API route, or product code change.

## Live source metadata

The current live Vellum homepage presents Vellum as `Personal AI` / `Personal Intelligence` for high-agency individuals, with channels, memory, skills, scheduling, privacy, and comparison content. The product page describes a personal assistant with memory, GitHub/Slack/Linear-style workflow examples, computer-use permissions, latest feature announcements including `v0.8.12` on `Jun 12, 2026`, and trust/security language. The model-profiles docs identify `Model Profiles`, built-in profiles including `Quality Claude Opus`, `Balanced Claude Sonnet`, and `Cost Optimized Claude Haiku`, plus `Action Overrides` for assigning profiles to actions.

No live Vellum prompt-workflows or evals provider-drift page was found during this pass. These current facts are product positioning and model-profile context only. No website prose beyond short metadata facts, screenshots, comparison rows, pricing text, docs prose, release text, examples, workflow details, product copy, or implementation details were copied into AMC.

## Relevance decision

The stale backlog seed describes Vellum as prompt workflows and evals, but the current live site is a personal AI assistant platform. Model profiles and action overrides are adjacent to provider/model routing, but the reviewed pages do not present a public provider-drift benchmark, canary-eval receipt, model-regression alert, eval-pack row hash, signed evidence chain, CI gate, or AMC-compatible Score/Shield/Watch proof.

Therefore GAP-0680 is relevant only as a no-bloat source-review correction: Vellum product metadata alone must fail closed for provider-drift claims. Existing AMC provider-drift primitives remain the only accepted path for provider/model drift proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Product/model-profile context only; no accepted provider-drift scoring proof. |
| Shield | Security/permissions context only; no Shield-verifiable provider-drift receipt. |
| Watch | Model-profile context only; no Watch canary, drift statistic, alert, or waiver proof. |
| Enforce | No permission, policy, or runtime enforcement behavior changed. |
| Vault | No credential, memory, data-retention, or privacy feature changed. |
| Fleet | No assistant/workflow orchestration, skill system, or channel integration added. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, provider adapter, model-profile importer, action-override importer, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0680. The closure is a documented skip because the current source does not provide provider-drift evidence that maps to AMC beyond existing generic provider-drift primitives.

## Fail-closed rule

Vellum homepage claims, product positioning, docs navigation, model-profile labels, built-in model names, action-override tables, release labels, comparison rows, memory/channel/skill descriptions, security/permissions text, local backlog metadata, or source identity alone must fail closed for provider/model drift claims. Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, eval-pack row hashes, signed evidence refs, CI/lifecycle gate receipts, and no-copy proof.

## No-bloat boundary

No Vellum provider-drift adapter, model-profile importer, action-override importer, workflow importer, release-note parser, personal-assistant integration, channel connector, memory connector, OAuth connector, skill-system wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No website prose beyond short metadata facts, screenshots, comparison rows, pricing text, docs prose, release text, examples, workflow details, product copy, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0680VellumProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
