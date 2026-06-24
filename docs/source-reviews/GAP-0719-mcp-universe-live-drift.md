# GAP-0719 - MCP-Universe live-drift boundary

- Gap: `GAP-0719`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/SalesforceAIResearch/MCP-Universe`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and live `README.md` fetch; shell network remains DNS-restricted in this environment.
- Status: closed through existing Watch live score and behavior drift receipts; no MCP-Universe integration, benchmark runner, MCP server adapter, or source-specific monitor added.

## Live source metadata

The GitHub connector identifies `SalesforceAIResearch/MCP-Universe` as a public repository with repository id `976443794`, default branch `main`, size `4098`, owner organization `SalesforceAIResearch`, clone URL `https://github.com/SalesforceAIResearch/MCP-Universe.git`, and read-only permissions in this environment. The repository is not archived.

The live `README.md` at `https://github.com/SalesforceAIResearch/MCP-Universe/blob/main/README.md` identifies MCP-Universe as an ecosystem for building, optimizing, and evaluating AI agents that interact with Model Context Protocol servers. Relevant source-review signals include MCPMark evaluation, MCP+ context management, Deep Research Agent, real-world MCP server interactions, long-horizon reasoning, large unfamiliar tool spaces, real-world data sources, live environments, dynamic evaluation, agents, workflows, MCP server management, multi-provider LLM support, benchmark runners, dashboards, traces, reports, callbacks for intermediate results, and domain benchmarks for web search, location navigation, browser automation, financial analysis, repository management, and 3D design. No upstream code, README prose beyond short metadata facts, benchmark configs, task rows, server definitions, prompts, evaluation rules, workflow YAML, dashboards, screenshots, reports, trace logs, API-key templates, or implementation details were copied into AMC.

## Relevance decision

MCP-Universe is relevant to AMC as live score and behavior drift context because tool-using agents can degrade when tools, MCP servers, providers, prompts, live environments, or benchmark tasks change. AMC already has the right generic Watch primitive for this: baseline/live windows, score distributions, behavior signatures, drift statistics, alert receipts, source refs, signed evidence refs, row hashes, receipt hashes, and Watch alert projection.

This does not require an MCP-Universe integration, benchmark runner, MCPMark runner, MCP+ wrapper, Deep Research Agent adapter, MCP server adapter, YAML importer, trace collector, dashboard importer, or methodology version bump. GAP-0719 is closed by documenting the source boundary and adding regression coverage that MCP-Universe-style tool-use drift uses the existing generic `live-score-behavior-drift` path. Repository or README metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions and signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements for observed tool-use behavior changes. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime MCP policy, tool policy, routing policy, or circuit breaker changed. |
| Vault | No API keys, tool credentials, traces, server configs, or secure-storage behavior changed. |
| Fleet | Tool-use and workflow context only; no MCP-Universe orchestration adapter added. |
| Passport | No portable proof-bundle field or external credential changed. |
| Comply | Security and benchmark context only; no compliance mapping changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, MCP-Universe adapter, MCPMark runner, MCP+ wrapper, Deep Research Agent adapter, MCP server adapter, benchmark config importer, trace collector importer, dashboard importer, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0719.

The focused regression exercises the existing Watch live-drift engine with MCP-Universe-style tool-use fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with valid signed live-drift receipts. The negative path fails closed when repository/README metadata replaces signed live-drift evidence.

## Fail-closed rule

Repository identity, repository id, default branch, README labels, MCP-Universe labels, MCPMark labels, MCP+ labels, Deep Research Agent labels, real-world MCP server labels, dynamic-evaluation labels, benchmark-domain labels, task-definition labels, workflow YAML labels, trace-collector labels, dashboard labels, report labels, callback labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing evidence requires AMC-owned baseline distributions, live sample rows, behavior signatures, drift statistics, alert receipts, source refs, receipt hashes, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No MCP-Universe integration, MCPMark runner, MCP+ wrapper, Deep Research Agent adapter, MCP server adapter, benchmark runner, YAML importer, trace collector importer, dashboard importer, report importer, callback adapter, task-definition parser, workflow runner, tool-use benchmark mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream code, README prose beyond short metadata facts, benchmark configs, task rows, server definitions, prompts, evaluation rules, workflow YAML, dashboards, screenshots, reports, trace logs, API-key templates, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0719McpUniverseLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
