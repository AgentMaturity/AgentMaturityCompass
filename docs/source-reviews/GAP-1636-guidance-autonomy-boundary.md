# GAP-1636 - Guidance runtime autonomy boundary

- Gap: `GAP-1636`
- Dimension: `runtime-autonomy-boundaries`
- AMC surfaces requested: Enforce, Shield, Vault
- Source reviewed: guidance-ai/guidance
- Retrieval: 2026-06-25 live GitHub API, raw README, and repository contents API review
- Status: Done

## Source reviewed

- Repository URL: `https://github.com/guidance-ai/guidance`
- GitHub API: `https://api.github.com/repos/guidance-ai/guidance`
- Raw README: `https://raw.githubusercontent.com/guidance-ai/guidance/main/README.md`
- Repository contents API: `https://api.github.com/repos/guidance-ai/guidance/contents?ref=main`

Live source metadata at retrieval:

- GitHub API identifies public repository `guidance-ai/guidance`, not archived, not disabled, not a fork, default_branch `main`, language `Jupyter Notebook`, license metadata `MIT`, stars `21519`, forks `1170`, open issues `296`, created `2022-11-10T18:21:45Z`, pushed `2026-05-21T17:08:04Z`, and updated `2026-06-25T12:51:29Z`.
- GitHub API has no topic labels for the repository at retrieval.
- Raw README identifies Guidance as a programming paradigm for controlling large language models, including constrained output, regex/CFG constraints, the ability to constrain generation, interleave control, and tool use.
- Repository contents API confirms top-level files and directories including `README.md`, `LICENSE.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, `MAINTAINERS.md`, `pyproject.toml`, `ruff.toml`, `client`, `docs`, `guidance`, `notebooks`, `packages`, `scripts`, and `tests`.

## Relevance decision

GAP-1636 is relevant to AMC through Enforce, Shield, and Vault, but the Guidance repository is not a tool permission product, MCP gateway, or runtime authority system. Its relevant source-review signal is narrower: constrained generation and tool-use orchestration can still produce plan steps that request authority above the agent's approved boundary.

The correct AMC closure is a generic runtime autonomy boundary receipt. AMC must record a Policy decision, risk tier, requested authority, and block or approval receipt before a constrained-generation, tool-use, MCP, or API-backed step crosses approved authority.

Guidance repository metadata, README claims, language/license/stars/forks, constrained-generation labels, regex/CFG labels, Python/Jupyter labels, tool-use labels, governance files, local backlog text, or source identity cannot prove autonomy safety.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. Autonomy boundary receipts may support score evidence, but no scoring weights changed. |
| Shield | Relevant. Shield needs block/approval receipts for constrained tool-use plans that could become unsafe actions. |
| Enforce | Primary surface. Enforce owns authority policy decisions and blocks requested authority above approval. |
| Vault | Relevant. Vault preserves receipt hashes and approval evidence references without storing raw secrets or copied source artifacts. |
| Watch | Relevant downstream. Watch consumes runtime policy-decision events, but no monitor changed. |
| Fleet | Relevant downstream. Fleet carries plan-step and multi-agent authority propagation evidence. |
| Passport | Not directly relevant. No portable trust-token schema changed. |
| Comply | Context only. Autonomy receipts can support audit, but no compliance mapping changed. |

## Product closure

Closed by extending the existing AMC-native runtime autonomy boundary receipt to bind the requested Shield and Vault surfaces in addition to Enforce, Fleet, Watch, and Studio:

- `defaultRuntimeAutonomyBoundaryPolicy`
- `evaluateRuntimeAutonomyBoundary`
- `verifyRuntimeAutonomyBoundaryDecision`
- `renderRuntimeAutonomyBoundaryAuditExport`
- `tests/gap1636GuidanceAutonomyBoundary.test.ts`

The receipt already records policy id/hash, plan id, step id, risk tier, requested authority, approved authority, approval requirement, approval receipt id, block/approval action, reasons, source citations, evidence refs, runtime event links, receipt id/hash, event path, signature path, and runtime run linkage.

No public scoring, methodology, API route, CLI command, Studio panel, Watch monitor, or source-specific product behavior changed for this gap.

## Fail-closed rule

The following must fail closed for GAP-1636:

- Guidance repository identity alone;
- GitHub API metadata, raw README labels, repository contents API, stars, forks, license, language, branch, commit dates, constrained-generation labels, regex labels, CFG labels, Python/Jupyter labels, tool-use labels, governance files, local backlog text, or source identity alone;
- requested authority above approved authority without a block decision;
- high or critical risk steps requiring approval without an approval receipt;
- approved action where requested authority still exceeds approved authority;
- missing plan-step evidence refs;
- missing signed event path or signature;
- receipt hash mismatch;
- simulated or metadata-only approval pretending to prove runtime authority.

## No-bloat boundary

No Guidance adapter, Guidance API client, Python dependency, Jupyter dependency, constrained-generation runtime, regex/CFG engine, model backend, OpenAI backend wrapper, Transformers backend wrapper, llama.cpp backend wrapper, notebook importer, docs importer, examples importer, governance-file importer, source-specific MCP gateway, source-specific ToolHub integration, API route, CLI command, Studio panel, Watch monitor, methodology bump, diagnostic question-bank change, source-specific scoring path, or Guidance-specific implementation branch was added.

AMC did not copy upstream Python code, Rust code, notebook contents, README prose beyond minimal metadata facts, docs prose beyond minimal labels, examples, configs, prompts, generated outputs, package metadata, workflows, images, or implementation details.

## Verification

- TDD negative check: `npx vitest run tests/gap1636GuidanceAutonomyBoundary.test.ts --reporter=dot` first failed because this doc did not exist and because the generic runtime autonomy boundary receipt did not yet bind Shield/Vault.
- Focused test: `npx vitest run tests/gap1636GuidanceAutonomyBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap1636GuidanceAutonomyBoundary.test.ts tests/gap1853SuperAgiAutonomyBoundary.test.ts tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/gap1646GopherMcpConsentBlastRadiusBoundary.test.ts tests/gap1652DjangoRestFrameworkMcpConsentBlastRadiusBoundary.test.ts tests/runtimeRunManager.test.ts tests/fleetTypedGraph.test.ts tests/governorToolhubWorkorders.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts --reporter=dot` passed, 10 files / 58 tests.
- Whitespace: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 987 files / 7957 tests.
