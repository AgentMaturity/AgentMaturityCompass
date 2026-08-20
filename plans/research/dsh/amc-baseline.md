# AMC Harness-Capability Baseline (for gap analysis vs. DeepSeek Harness)

Repo: `/Users/sid/AgentMaturityCompass` (TypeScript ESM, Node >=20, npm package `agent-maturity-compass` v1.1.1, bin `amc` -> `dist/cli.js`). ~1,600 TS files under `src/`. Runtime deps are minimal: `@modelcontextprotocol/sdk`, `better-sqlite3`, `chalk`, `commander`, `inquirer`, `semver`, `yaml`, `zod`.

## 1. CLI command surface

- Entry: `src/cli.ts` (24,395 lines, commander-based) plus split registries: `src/cli-business-commands.ts`, `cli-domain-product-commands.ts`, `cli-eval-dataset-commands.ts`, `cli-import-commands.ts`, `cli-late-stage-commands.ts`, `cli-observability-commands.ts`, `cli-strategy-commands.ts`, `cli-trace-commands.ts`, `cli-watch-commands.ts`.
- 990 `command(...)` registrations; ~330 top-level command groups (verified via `node dist/cli.js --help --all`): `score`, `shield`, `enforce`, `vault`, `watch`, `compliance|comply`, `fleet`, `passport`, plus `evidence`, `audit`, `redteam`, `gateway`, `sandbox`, `plugin`, `mcp`, `mechanic`, `fix`, `up|start`, `doctor`, `setup`, `shell` (REPL, `src/repl`), `e2e`, `release`, `dashboard`, `studio`, etc.
- Help groups commands into 7 "primary command groups" (evidence, score, incidents, audit, admin, lifecycle, eval).

## 2. Plugin/extension/adapter architecture

- Adapters: `src/adapters/` — 15 built-ins in `src/adapters/builtins/` (generic-cli, claude-cli, gemini-cli, openclaw-cli, hermes-cli, openhands-cli, autogen, crewai, langchain-node, langchain-python, langgraph-python, llamaindex-python, semantic-kernel, openai-agents-sdk, python-amc-sdk), registered in `registry.ts` and zod-validated (`adapterTypes.ts`). Adapters are **declarative definitions** (env strategy, command template, detection rules, capability/lossiness matrix), not code.
- Plugins: `src/plugins/` — `pluginLoader.ts` loads **declarative asset packs only**: policy packs, assurance packs, compliance maps, adapters, outcome/casebook templates, transform overlays, learn docs. All YAML/JSON validated by zod schemas; signed (`pluginSigner.ts`/`pluginVerifier.ts`), integrity-checked, with a registry client/server (`pluginRegistryClient.ts`, `pluginRegistryServer.ts`) and SSE (`pluginSse.ts`).
- **Does not exist:** arbitrary code plugins — no `require()`, dynamic `import()`, `vm`, `new Function`, or `eval` in `src/plugins/` (grepped all of them). **No hot reload**: grepped `hotReload|watchFile|chokidar` across `src/` — zero hits; plugins load at process start from an installed, verified store.

## 3. Runtime observation

Four observation paths; all local, evidence-ledger-backed:
- **LLM gateway proxy** (`src/gateway/server.ts`, ~1,750 lines): HTTP reverse proxy on 127.0.0.1:3210 for provider traffic (route prefixes -> upstreams, header/JSON/regex secret redaction via `gateway/redaction.ts`), plus a separate **egress proxy** on :3211 with deny-by-default host allowlist. Agents are pointed at it by env rewriting (`adapters/envAssembler.ts` sets `OPENAI_BASE_URL` etc.).
- **Wrapped/monitored process spawn**: `src/ledger/monitor.ts` (`wrapAny`) spawns the agent CLI via `child_process.spawn` with provider keys stripped/dummied, logging to the ledger; `src/adapters/adapterRunner.ts` composes this with leases, budgets, sandbox, and studio state. `src/runtimes/` (claude/gemini/openclaw/mock) only **detects** installed CLIs and probes `--help`/`--version` capabilities.
- **Tool-lifecycle hooks**: `src/adapters/hookIntegration.ts` writes project-local **Claude Code and Gemini CLI PreToolUse/PostToolUse command hooks** (`.amc/hooks/`) that post events to the bridge (`src/bridge/hookIngress.ts`) and fetch allow/deny decisions (`src/bridge/hookControl.ts`). Only those two hook providers exist.
- **Offline log/trace ingestion**: `src/ingest/ingest.ts` (chatgpt / claude_console / gemini_ui / generic_json / generic_text exports), `src/importers/neutralImporter.ts`. OTel export exists outbound (`src/observability/otelExporter.ts`, `evalTracing.ts`); `src/watch/` has ~50 modules of drift/behavioral monitors and a `siemExporter.ts`.
- **Does not exist:** no OTLP *receiver* endpoint (grep `otlp|opentelemetry` hits only exporters/config), **no PTY** (no `node-pty` in package.json or src; stdio is piped), no eBPF/syscall tracing.

## 4. Enforcement (Enforce/Shield mechanics)

- `src/enforce/` (~58 modules): policy firewall, safety DSL + template engine, taint tracker, exec guard, schema gate, circuit breaker, geo fence, two-person auth, watchdog, sandbox orchestrator, etc. Mechanically, most are **evaluation/simulation libraries over config + ledger evidence** (`controlSimulation.ts`, `dryRun.ts`, `policyFixtureRunner.ts`); `stubs.ts` is explicitly "lean implementations" (heuristic string checks).
- **Real runtime interception exists in exactly three places:** (a) the gateway/egress proxy — signed, revocable **lease tokens** (`src/leases/`) verified per request, budget checks (`src/budgets/`), redaction, host allowlist; (b) the **bridge** (`src/bridge/bridgeServer.ts`, `bridgePolicyEnforcer.ts`) — model allowlists, signed model taxonomy, route/provider gating, receipts; (c) **hook control** — PreToolUse allow/deny for Claude Code/Gemini CLI.
- `src/shield/` (~40 modules): prompt-injection detector/sanitizer, MCP server security analyzer + trust ledger (`mcpSecurityAnalyzer.ts`, `mcpTrustLedger.ts`), agent-config scanner, posture, threat intel, reputation — static/heuristic analysis, not inline traffic filtering.
- Sandbox: `src/sandbox/sandbox.ts` builds `docker run --rm` args confining network to the gateway. **Docker-optional wrapper only — no built-in kernel sandbox, seccomp, or firejail** (it degrades when `docker --version` fails).

## 5. Session/state/storage

- Workspace: `.amc/` under the project (`src/workspace.ts`, `src/workspaces/`), holding `gateway.yaml`, keys, reports, hooks, per-agent dirs (`src/fleet/paths.ts`).
- Evidence ledger: `src/ledger/ledger.ts` (2,366 lines, better-sqlite3): tables `evidence_events`, `sessions`, `runs`, `assurance_runs`, `outcome_events/contracts`, `claims`, `claim_transitions`, `evidence_incident_links`, `evidence_corrections`, `bridge_request_usage`, `schema_migrations` — hash-chained, integrity-verifiable.
- Signing: Ed25519 keys per role (`src/crypto/keys.ts`), canonical-JSON SHA-256 digests signed everywhere (targets, adapters config, approval policies, plugins, leases). Receipts: `src/receipts/receipt.ts`, `receiptChain.ts`; transparency log/bundles (`src/transparency/`), notary (`src/notary/`), Merkle/zk commands (`zk-commit`, `zk-range-proof` in cli.ts).

## 6. Does AMC run an agent?

**No agent loop.** AMC never implements plan/act/tool-execute iteration. Searched `chat/completions|/v1/messages|generateContent` across src: the only real LLM callers are `src/eval/llmApiIntegration.ts` (**LLM-as-judge** for eval metrics, OpenAI/Anthropic fetch with retry/rate-limit) and the bridge/gateway (pass-through proxying). The red-team runner (`src/redteam/runner.ts`) composes assurance scenarios × attack strategies against a **"synthetic response engine"**; `src/redteam/mcpAgentProvider.ts` states "In a real deployment, this would connect to an actual agent via MCP" and simulates a cautious agent. `amc adapters run` / monitored spawn **executes the user's agent CLI as a child process** (observation wrapper), which is the closest AMC comes to running an agent. Scoring itself is questionnaire-driven: `src/diagnostic/questionBank.ts` (~246 questions) + quickscore/rapid variants, with `autoAnswer/` evidence-assisted answering.

## 7. Web UI / server surfaces

- **Studio** (`src/studio/studioServer.ts`, `oneCommandUp.ts`, SSE via `studioSse.ts`) — local control plane started by `amc up`.
- **Console** (`src/console/consoleServer.ts` + ~40 static HTML pages in `src/console/pages/`, copied to dist) — vanilla node:http static server + JSON state.
- **Dashboard** (`src/dashboard/serve.ts`, templates/components), **gateway** and **bridge** HTTP servers, **plugin registry server**, **MCP server** (`src/mcp/amcMcpServer.ts`, stdio transport, exposes scoring/guide/compliance tools to Claude Code/Cursor/etc. via `amc mcp serve`).
- Hosted surfaces: `api/index.ts` (Vercel, `vercel.json`), `website/` (static marketing + Pages build), `vscode-extension/`, GitHub Action (`action.yml`, `amc-action/`). No React/SPA framework — all server-rendered/static HTML.

## 8. Test/CI/quality gates

- Vitest: 1,098 `*.test.ts` files, ~8,567 `it/test` cases under `tests/`; `vitest.config.ts` has v8 coverage but **all thresholds set to 0** (coverage measured, not gated). Playwright e2e + axe accessibility (`tests/e2e/`, `@axe-core/playwright`).
- CI (`.github/workflows/ci.yml`): Node 20/22/24 matrix — typecheck (lint == typecheck; **no ESLint/Prettier**), vitest, build, policy-fixture regression (`scripts/run-policy-fixtures-ci.mjs`), architecture-boundary check, release smoke (SBOM/licenses/provenance/secret scan via `amc release ...`), local e2e smoke, docker smoke. Other workflows: changeset requirement, `amc-pr-gate.yml`, `amc-score.yml` (dogfooding), nightly compatibility matrix, npm publish, pages, docker builds. Release gating: `scripts/release-gate.mjs` on prepack.

## 9. `amc fix` pipeline

- `src/guide/oneClickFix.ts` + `fixCli.ts`: quickscore (`diagnostic/rapidQuickscore.ts`) -> top-gap explanation -> framework auto-detect (`guide/guideGenerator.ts`, `KNOWN_AGENT_CONFIGS`) -> writes guardrail text between `AMC-GUARDRAILS` markers into the agent's own config file (CLAUDE.md-style instruction files), optional GitHub Actions trust-gate, hash-sealed receipt; dry-run-first, never touches credentials. Separate deeper pipeline: `src/mechanic/` (gap analysis -> `upgradePlanner.ts` -> `autoFixer.ts` fix plans -> `executionEngine.ts` with approvals -> simulator with evidence gates) and `src/doctor/doctorFix.ts` for workspace misconfigurations. Fixes are **config/instruction-file edits and generated snippets — AMC does not modify agent source code, and no LLM is invoked to author fixes**.

## Summary of verified absences

No agent execution loop or tool-execution engine of its own; no PTY (`node-pty` absent); no hot reload (no fs-watch code); no code-executing plugin system (declarative signed assets only); no OTLP receiver (export only); no built-in OS sandbox (Docker wrapper only); red-team and MCP attack execution are synthetic/simulated, not live-agent; coverage thresholds are zero; no ESLint. Enforcement is real only at the gateway/bridge/egress-proxy and Claude-Code/Gemini-CLI hook layers — everything else in `src/enforce` is advisory scoring, simulation, or config linting over the evidence ledger.