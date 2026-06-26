# GAP-1638 - llama-cpp-agent runtime autonomy boundary

- Gap: `GAP-1638`
- Dimension: `runtime-autonomy-boundaries`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: Maximilian-Winter/llama-cpp-agent
- Retrieval: 2026-06-25 live GitHub API, raw ReadMe, release, tags, license, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/Maximilian-Winter/llama-cpp-agent`
- GitHub API: `https://api.github.com/repos/Maximilian-Winter/llama-cpp-agent`
- Raw ReadMe: `https://raw.githubusercontent.com/Maximilian-Winter/llama-cpp-agent/master/ReadMe.md`
- Wrong-branch README checked and failed as expected: `https://raw.githubusercontent.com/Maximilian-Winter/llama-cpp-agent/main/README.md`
- Repository contents API: `https://api.github.com/repos/Maximilian-Winter/llama-cpp-agent/contents?ref=master`
- Latest release: `https://github.com/Maximilian-Winter/llama-cpp-agent/releases/tag/0.2.35`

Live source metadata at retrieval:

- GitHub API identifies public repository `Maximilian-Winter/llama-cpp-agent`, not archived, not disabled, not a fork, default_branch `master`, language `Python`, license metadata `NOASSERTION`, stars `647`, forks `70`, open issues `25`, created `2023-12-29T16:54:39Z`, pushed `2026-03-09T05:57:48Z`, and updated `2026-06-20T14:15:58Z`.
- GitHub API topics include `agents`, `function-calling`, `llamacpp`, `llm`, `llm-agent`, `llm-framework`, `llms`, and `parallel-function-call`.
- The repository uses `ReadMe.md` on `master`; `main/README.md` returned 404 during retrieval.
- Raw ReadMe begins with `Not Longer Maintained`, points users toward another framework, and describes function-calling, parallel function calling, guided sampling, structured function calls, structured output, RAG, agent chains, llama.cpp server compatibility, Python functions, Pydantic tools, llama-index tools, and OpenAI tool schemas.
- Repository contents API confirms top-level files and directories including `ReadMe.md`, `LICENSE`, `.github`, `.readthedocs.yaml`, `docs`, `examples`, `logo`, `mkdocs.yml`, `pyproject.toml`, `src`, and `tests`.
- Tags API shows recent tags `0.2.35`, `0.2.34`, `0.2.33`, `0.2.32`, and `0.2.31`.
- Latest GitHub release is `0.2.35`, `llama-cpp-agent 0.2.35`, published `2024-06-29T09:55:27Z`.
- The `LICENSE` file identifies MIT License text even though GitHub API license metadata is `NOASSERTION`.

## Relevance decision

GAP-1638 is relevant to AMC through Enforce, Shield, and Vault because function-calling and structured-output agent frameworks can produce plan steps that request tool authority above the user's approved runtime boundary.

The source does not justify a llama-cpp-agent integration. The source is also explicitly marked Not Longer Maintained, so it is weak as a product direction signal. The correct AMC closure is to prove that existing generic runtime autonomy boundary receipts block high-authority function-call actions unless a policy decision and approval receipt allow them.

The required AMC evidence remains: Policy decision, risk tier, requested authority, and block or approval receipt.

Repository metadata, ReadMe claims, maintenance labels, topic labels, star/fork counts, release tags, function-calling labels, guided sampling labels, structured-output labels, llama.cpp compatibility labels, Python packaging metadata, or source identity cannot prove runtime authority control.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Autonomy-boundary receipts can support scoring evidence, but no scoring weights changed. |
| Shield | Relevant. Shield needs block/approval evidence before function calls create unsafe side effects. |
| Enforce | Primary surface. Enforce owns policy decisions and runtime blocks for requested authority above approval. |
| Vault | Relevant. Vault preserves receipt hashes and approval refs without storing raw tool payloads or copied source artifacts. |
| Watch | Relevant downstream. Watch can inspect runtime policy-decision events, but no monitor changed. |
| Fleet | Relevant downstream. Fleet carries plan-step and multi-agent authority propagation evidence. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Receipts may support audit, but no compliance mapping changed. |

## Product closure

Closed through the existing AMC-native runtime autonomy boundary receipt strengthened in GAP-1636:

- `defaultRuntimeAutonomyBoundaryPolicy`
- `evaluateRuntimeAutonomyBoundary`
- `verifyRuntimeAutonomyBoundaryDecision`
- `renderRuntimeAutonomyBoundaryAuditExport`
- `tests/gap1638LlamaCppAgentAutonomyBoundary.test.ts`

The receipt records policy id/hash, plan id, step id, risk tier, requested authority, approved authority, approval requirement, approval receipt id, block/approval action, reasons, source citations, evidence refs, runtime event links, receipt id/hash, event path, signature path, runtime run linkage, and surface binding for Enforce, Shield, Vault, Fleet, Watch, and Studio.

No product code change was needed for GAP-1638 because GAP-1636 already bound Shield and Vault into the generic runtime autonomy receipt.

## Fail-closed rule

The following must fail closed for GAP-1638:

- llama-cpp-agent repository identity alone;
- GitHub API metadata, raw ReadMe labels, repository contents API, stars, forks, license metadata, release tags, language, branch, commit dates, maintenance banner, function-calling labels, parallel-function-call topics, guided sampling labels, structured-output labels, llama.cpp labels, Pydantic/OpenAI schema labels, local backlog text, or source identity alone;
- requested authority above approved authority without a block decision;
- high or critical risk function-call steps requiring approval without an approval receipt;
- approved action where requested authority still exceeds approved authority;
- missing plan-step evidence refs;
- missing signed event path or signature;
- receipt hash mismatch;
- simulated, stale, or metadata-only approval pretending to prove runtime authority.

## No-bloat boundary

No llama-cpp-agent adapter, llama.cpp wrapper, llama-cpp-python wrapper, Python dependency, guided sampling engine, function-calling agent runner, parallel function-call executor, structured-output parser, Pydantic tool importer, OpenAI tool schema importer, llama-index tool importer, RAG importer, colbert reranker dependency, examples importer, docs importer, ReadMe importer, release importer, source-specific MCP gateway, source-specific ToolHub integration, API route, CLI command, Studio panel, Watch monitor, methodology bump, diagnostic question-bank change, source-specific scoring path, or llama-cpp-agent-specific implementation branch was added.

AMC did not copy upstream Python code, ReadMe prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1638LlamaCppAgentAutonomyBoundary.test.ts --reporter=dot` first failed because this doc did not exist while four autonomy-boundary/no-bloat tests passed.
- Focused test: `npx vitest run tests/gap1638LlamaCppAgentAutonomyBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1638LlamaCppAgentAutonomyBoundary.test.ts tests/gap1636GuidanceAutonomyBoundary.test.ts tests/gap1853SuperAgiAutonomyBoundary.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetTypedGraph.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 11 files / 63 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 988 files / 7962 tests.
