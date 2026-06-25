# GAP-1635 - Viper consent and blast-radius prompts

- Gap: `GAP-1635`
- Dimension: Consent and blast-radius prompts
- AMC surfaces requested: Enforce; Shield; Vault
- Source reviewed: `FunnyWolf/Viper`
- Retrieval: Live GitHub API and raw README retrieval on 2026-06-25.
- Status: Done

## Relevance decision

`GAP-1635` is relevant to AMC because the source is a live adversary-simulation and red-team platform with AI and MCP-related repository topics. That makes it a useful security signal for AMC's existing ToolHub permission boundary: users need to see what a high-impact tool call can touch before execution, and the resulting evidence must bind the consent prompt, summarized impact, reviewer decision, and executed scope.

This does not require AMC to integrate with Viper or reproduce red-team tooling. The closure is a generic ToolHub/Enforce improvement for consent evidence on governed tool execution.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; future diagnostic scoring can consume the stronger ToolHub evidence already emitted by Enforce. |
| Shield | Relevant as a red-team and misuse boundary: high-impact tool execution now records explicit blast-radius context. |
| Enforce | Primary surface. ToolHub intents and executions now carry a generic blast-radius consent object and validate high-impact execution evidence fail-closed. |
| Vault | Relevant because the prompt summarizes account/env scope without copying secrets and remains within the existing redaction/evidence path. |
| Watch | Indirectly strengthened through signed ToolHub action evidence and audit metadata. |
| Fleet | No fleet topology behavior changed. |
| Passport | No portable trust-token behavior changed. |
| Comply | No regulatory mapping changed. |

## Product closure

AMC added a generic ToolHub blast-radius consent primitive. High-impact tool intents now expose the resources, accounts, external systems, irreversible effects, and reviewer decision state before execution. Executions bind the final reviewer decision and executed scope into the existing signed `tool_action` receipt instead of creating a source-specific subsystem.

## Fail-closed rule

High-impact execution evidence fails closed when it is metadata-only, lacks impacted resources, omits irreversible effects, lacks an approved reviewer decision or accepted execution ticket, or does not include executed scope.

## No-bloat boundary

No Viper integration, adapter, runtime, MCP server, red-team module, post-exploitation workflow, copied prompt, copied config, copied screenshot, copied docs, or copied upstream code was added. Viper remains a source-review signal only.

## Source facts

- Repository: `https://github.com/FunnyWolf/Viper`
- Default branch: `master`
- Live description: adversary simulation and red teaming platform with AI.
- Stars/forks at retrieval: 5116 stars and 668 forks.
- Topics at retrieval include `agent`, `ai`, `mcp-server`, `redteam`, and `red-team-tools`.
- Latest release at retrieval: `v3.1.11`, published 2026-03-31.
- Default branch commit at retrieval: `78ffab8729aeb227ab7056ad06140c070ebe2e79`, dated 2026-05-31.
- License field at retrieval: none declared by GitHub metadata.

## Verification

- `npx vitest run tests/gap1635ViperConsentBlastRadiusBoundary.test.ts --reporter=dot`
- `npx vitest run tests/gap1635ViperConsentBlastRadiusBoundary.test.ts tests/governorToolhubWorkorders.test.ts tests/consoleApprovalsWhatifBenchmarks.test.ts tests/mcpComplianceSafety.test.ts tests/mcpServerTools.test.ts tests/outcomesCasebooksExperimentsValueGates.test.ts --reporter=dot`
- `git diff --check -- . ':(exclude)AMC_OS'`
- `npm run typecheck`
- `npm test -- --reporter=dot`
