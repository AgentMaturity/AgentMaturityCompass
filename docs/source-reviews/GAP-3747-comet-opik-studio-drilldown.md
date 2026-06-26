# GAP-3747 - Comet Opik Studio drilldown boundary

- Gap: `GAP-3747`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Watch, Studio, API
- Source reviewed: `https://github.com/comet-ml/opik`, `https://api.github.com/repos/comet-ml/opik`, `https://raw.githubusercontent.com/comet-ml/opik/main/README.md`, `https://raw.githubusercontent.com/comet-ml/opik/main/LICENSE`, `https://api.github.com/repos/comet-ml/opik/contents?ref=main`, and prior review `docs/source-reviews/GAP-0962-comet-opik-studio-drilldown.md`
- Retrieval: live GitHub API/raw-source checks on 2026-06-26.
- Status: closed through AMC's existing Score/Watch Studio evidence drilldown receipts; no Comet integration, Opik adapter, trace importer, dashboard clone, source-specific route, or source-specific Studio panel added.

## Live source metadata

The backlog identifies `comet-ml/opik` as source `GAP-3747`, category `Observability, monitoring, and traces`, dimension `Studio evidence drilldown`, and requested Watch, Studio, and API surfaces.

Live retrieval on 2026-06-26 verified:

- Repository API `https://api.github.com/repos/comet-ml/opik` returned HTTP 200, first-200KB hash `5d5ff6718c889034a1aee8556b5140336c50b558f11a9fb9feefbf8261a2214a`.
- Repository full name `comet-ml/opik`, default_branch `main`, license `Apache-2.0`, language `Python`, 19,861 stars, 1,543 forks, 122 open issues, pushed_at `2026-06-25T21:54:47Z`, updated_at `2026-06-26T03:29:34Z`.
- Repository description says `Debug, evaluate, and monitor your LLM applications`, RAG systems, and agentic workflows with comprehensive tracing, automated evaluations, and production-ready dashboards.
- Topics include evaluation, LangChain, LlamaIndex, LLM, LLM evaluation, LLM observability, LLMOps, open source, OpenAI, playground, and prompt engineering.
- README raw URL `https://raw.githubusercontent.com/comet-ml/opik/main/README.md` returned HTTP 200, 33,325 bytes, first-200KB hash `9300fb5a905b102db7e59cabfd33b9e675f06a9e6bd1771eaa23ef32be42964c`, with reviewed metadata phrases including Open-source AI Observability, Evaluation, and Optimization, LLM Applications, tracing, evaluation, prompt, LLM-as-a-Judge, Online Evaluation, Guardrails, Datasets, Experiments, and agent.
- License raw URL `https://raw.githubusercontent.com/comet-ml/opik/main/LICENSE` returned HTTP 200, 11,391 bytes, first-200KB hash `0236cf0195e033d15c120e610d44943e8e478ffed5d60fbba1b5a6b96e778a47`.
- Top-level contents API `https://api.github.com/repos/comet-ml/opik/contents?ref=main` returned HTTP 200, first-200KB hash `748a773d762efc6adae9afe8ebe52a4a64e5de319e577e5aee00ed1a283c9968`, and top-level names including `.agents`, `.codex`, `.github`, `AGENTS.md`, `CHANGELOG.md`, `LICENSE`, `Makefile`, `README.md`, `apps`, `deployment`, `extensions`, `opik.sh`, `scripts`, `sdks`, `tests_end_to_end`, and `version.txt`.
- Prior AMC review `docs/source-reviews/GAP-0962-comet-opik-studio-drilldown.md` already closed Comet Opik through existing Studio drilldown receipts with no Opik adapter or source-specific Studio route.

These facts are Studio evidence drilldown context only. They do not provide AMC drilldown evidence.

## Relevance decision

GAP-3747 is relevant to AMC because the backlog asks operators to open a score finding and drill into traces, receipts, policy rules, source artifacts, evidence previews, and empty/error states. Opik's public repository signals the same operator need around tracing, debugging, evaluation, production dashboards, guardrails, datasets, experiments, online evaluation, prompt workflows, and LLM-as-a-Judge context.

The accepted AMC primitive is the existing Studio evidence drilldown path: UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and fail-closed response state.

The source does not justify a Comet integration, Opik adapter, OpenTelemetry connector, trace importer, dashboard clone, SDK wrapper, prompt playground clone, Agent Playground clone, guardrail connector, optimizer runner, dataset importer, experiment importer, online-evaluation runner, source-specific Studio route, API route, Watch monitor, Shield verifier, methodology version bump, package dependency, or product parity claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score-finding drilldown output, accepted/rejected evidence preview, signed evidence, and fail-closed state. |
| Shield | Relevant because unsupported observability/drilldown claims fail closed when signed evidence and rejected-evidence reasons are missing. |
| Enforce | Guardrail context only; no runtime policy, action blocking, or circuit breaker changed. |
| Vault | PII/security context only; no secure-storage, DLP, secret, or data-retention behavior changed. |
| Watch | Relevant through Watch-side source artifact links projected into Score evidence drilldowns. |
| Fleet | Agentic workflow context only; no Fleet orchestration or trust topology changed. |
| Passport | Existing drilldown receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Audit and evidence context only; no compliance mapping changed. |

## Product closure

No product code change was required for GAP-3747. AMC already has the generic Studio drilldown primitives for this gap:

- `buildScoreEvidenceDrilldown`
- `buildWatchObsStudioSourceArtifactLinks`

Added focused regression `tests/gap3747CometOpikStudioDrilldownBoundary.test.ts`.

The positive path proves Opik source context can be cited only when AMC-owned Score drilldown rows include UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted evidence, rejected evidence, row hash, and repair guidance. The negative path fails closed when Opik GitHub metadata replaces drilldown evidence previews.

This closes the backlog acceptance boundary for UI route, source artifact links, evidence preview, and empty/error states without adding a Comet/Opik-specific product surface.

## Fail-closed rule

Opik repository identity, GitHub API metadata, README content, license metadata, star/fork/issue counts, default branch, Python language label, Apache-2.0 license label, Debug/evaluate/monitor labels, LLM applications label, RAG systems label, agentic workflows label, comprehensive tracing label, automated evaluations label, production-ready dashboards label, Open-source AI Observability, Evaluation, and Optimization label, LLM-as-a-Judge label, Online Evaluation label, Guardrails label, Datasets label, Experiments label, prompt labels, playground labels, local backlog metadata, prior source-review metadata, or source identity alone must fail closed as Studio evidence drilldown proof.

Passing proof requires AMC-owned UI route, source artifact links, evidence preview, trace preview, reasoning trace preview, receipt preview, source artifact preview, empty-state receipts, error-state receipts, signed evidence refs, accepted/rejected evidence, row hashes, and explicit repair guidance.

## No-bloat boundary

No Comet integration, Opik adapter, API client, SDK wrapper, OpenTelemetry connector, trace importer, log importer, dashboard clone, prompt playground clone, Agent Playground clone, optimizer runner, guardrail connector, anonymizer integration, alert connector, dataset importer, experiment importer, online-evaluation runner, test-suite importer, source-specific Studio route, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, badge migration, package dependency, source-specific metric lens, or source-specific scoring path was added.

No Opik repository code, README prose beyond short metadata phrases, docs prose, SDK snippets, install commands, trace rows, dashboard screenshots, prompt examples, evaluation examples, guardrail configs, optimizer content, generated outputs, or implementation details were copied into AMC.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3747CometOpikStudioDrilldownBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; 3 Studio drilldown/no-bloat tests passed.
- Focused test after doc: `npx vitest run tests/gap3747CometOpikStudioDrilldownBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired Studio drilldown regression: `npx vitest run tests/gap3747CometOpikStudioDrilldownBoundary.test.ts tests/gap0962CometOpikStudioDrilldownBoundary.test.ts tests/gap0017PromptLayerStudioDrilldownBoundary.test.ts tests/gap0958LaminarStudioDrilldownBoundary.test.ts tests/evidenceDrilldown.test.ts tests/apiRouters.test.ts --reporter=dot` passed, 6 files / 52 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1028 files / 8128 tests.
