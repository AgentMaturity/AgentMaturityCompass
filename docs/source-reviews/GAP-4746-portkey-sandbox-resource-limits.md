# GAP-4746 — Portkey sandbox resource limits

- Gap: `GAP-4746`
- Dimension: Sandbox resource limit enforcement
- AMC surfaces requested: API; Studio; Fleet
- Source reviewed: Portkey-AI/gateway
- Retrieval: Live GitHub repository API, languages API, license API, and raw README retrieved on 2026-06-25.
- Status: Done

## Relevance decision

This is relevant to AMC because LLMOps routing, gateway, guardrail, cost, timeout, and MCP Gateway tools increase the risk that autonomous tool execution exceeds runtime resource or boundary assumptions. The live source confirms Portkey-AI/gateway is an AI Gateway repository with routing, guardrails, MCP Gateway, usage analytics, Request Timeouts, TypeScript as the primary language, and MIT license metadata.

AMC should not mirror Portkey. The AMC-native closure is a generic sandbox resource-limit receipt that binds Sandbox policy, observed usage, violation status, and enforcement receipt evidence for tool executions.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as evidence for scoring sandbox/resource-control maturity and score penalties when limits are violated. |
| Shield | Relevant as a runtime containment proof for unsafe tool behavior. |
| Enforce | Primary surface: validates CPU, memory, IO, network, filesystem, and process limits and records violations. |
| Vault | Not changed; no secrets or storage controls were required. |
| Watch | Indirectly relevant because receipts can feed observability views, but no Watch subsystem was added. |
| Fleet | Relevant because the receipt binds agent, workspace, tool, and execution IDs for fleet-level evidence. |
| Passport | Not changed; no portable trust-token behavior was required. |
| Comply | Not changed; no compliance mapping changed. |

## Product closure

Added `src/enforce/toolSandboxLimits.ts` and exported it through `src/enforce/index.ts`. The new generic receipt builder verifies that each tool execution has:

- policy identity and policy evidence
- observed command and resource-usage evidence
- enforcement receipt evidence
- CPU, memory, read IO, write IO, network, filesystem, and process limits
- observed network/filesystem event evidence
- violation rows for exceeded or denied boundaries

Complete non-violating evidence returns `pass`. Complete evidence with exceeded limits returns `violation` and stays verifiable. Missing policy, observed usage, or enforcement evidence returns `fail_closed`.

## Fail-closed rule

metadata-only evidence fails closed. Repository name, homepage text, GitHub stars, TypeScript language metadata, MIT license metadata, README routing claims, guardrail claims, MCP Gateway claims, Request Timeouts claims, usage analytics claims, local backlog text, and source identity are not enough. AMC requires a concrete sandbox policy, observed usage record, violation status, and enforcement receipt.

## No-bloat boundary

No Portkey adapter, gateway integration, MCP Gateway bridge, model-router wrapper, config importer, hosted gateway client, dashboard clone, upstream code, README copy, examples, prompts, screenshots, pricing data, provider-specific route engine, new API route, new CLI command, Studio screen, or methodology bump was added.

## Source evidence

- GitHub repository: `https://github.com/Portkey-AI/gateway`
- GitHub repository API: `https://api.github.com/repos/Portkey-AI/gateway`
- GitHub languages API: `https://api.github.com/repos/Portkey-AI/gateway/languages`
- GitHub license API: `https://api.github.com/repos/Portkey-AI/gateway/license`
- Raw README: `https://raw.githubusercontent.com/Portkey-AI/gateway/main/README.md`
- Live metadata observed: repository `Portkey-AI/gateway`, AI Gateway description, routing and guardrails context, MCP Gateway context, usage analytics, Request Timeouts, TypeScript primary language, `ai-gateway`, `llmops`, `mcp`, `mcp-gateway`, `model-router`, and `openai` topics, MIT license, default branch `main`, and recent push metadata.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4746PortkeySandboxResourceLimitsBoundary.test.ts --reporter=dot` failed because `src/enforce/toolSandboxLimits.ts` did not exist.
- Product-focused rerun passed 4/5 tests and failed only because this source-review doc was absent.
- Final focused test: `npx vitest run tests/gap4746PortkeySandboxResourceLimitsBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap4746PortkeySandboxResourceLimitsBoundary.test.ts tests/enforce.test.ts tests/enforce-full.test.ts tests/pluginMarketplace.test.ts tests/apiRouters.test.ts --reporter=dot` passed, 5 files / 106 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 967 files / 7,869 tests.
