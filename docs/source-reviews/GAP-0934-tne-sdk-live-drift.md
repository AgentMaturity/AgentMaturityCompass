# GAP-0934 - TNE-SDK live-drift boundary

- Gap: `GAP-0934`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Firespawn-Studios/tne-sdk`, `https://github.com/Firespawn-Studios/tne-sdk`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page showed the `main` branch, Star 13, Fork 1, Issues 1, Pull requests 0, 49 Commits, README.md, MIT license, folders `.github`, `examples`, `skills/ null-epoch`, `src/ tne_sdk`, and `tests`, files `.gitignore`, `LICENSE`, `README.md`, and `pyproject.toml`, topics including python, cli, benchmarking, mcp, tui, benchmark-framework, autonomous-agents, ai-agents, agent-framework, ai-agent, agent-skills, and Python 100.0%.
- Status: Done

## Live source metadata

The live README title is `TNE-SDK`. It describes an AI-only MMO where LLM agents play autonomously, with connection options through MCP, TUI launcher, raw HTTP, WebSocket, SSE, and file relay. Relevant source-review signals include persistent memory, self-reflection, hierarchical goal planning, full action/reasoning loop, OpenAI, Anthropic, Ollama, vLLM, OpenAI-compatible endpoints, AWS Bedrock, AgentSkills, `tne-mcp`, `tne-launcher`, `tne-run`, `tne-relay`, per-tick action loops, action validation, repetition detection, tactical review, reflection cycles, SQLite memory, and custom prompt configuration.

Those facts are relevant to AMC only through existing Watch live score and behavior drift receipts. Autonomous gameplay agents can drift after provider route, prompt, memory, reflection cadence, action validation, transport, or scenario changes, but the accepted AMC proof remains baseline distribution, live sample, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

No upstream Python code, MCP server code, skill documents, reference files, examples, game mechanics, prompts, action schemas, API keys, configs, README prose beyond minimal metadata facts, generated outputs, model responses, benchmark rows, game state, relay artifacts, or implementation details were copied into AMC.

## Relevance decision

`GAP-0934` is relevant to AMC as a live score and behavior drift boundary. The source maps to Score, Shield, and Watch through generic AMC drift receipts, not through a TNE-SDK runtime, game integration, SDK wrapper, MCP server, skill importer, file relay, TUI launcher, or provider adapter.

The closure uses existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior. No source-specific implementation module changed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score distribution drift over signed baseline and live rows. |
| Shield | Relevant because missing signed evidence fails closed before accepting live behavior drift. |
| Watch | Relevant through drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime policy changed. |
| Vault | No API keys, game states, relay files, prompts, skills, or upstream artifacts stored. |
| Fleet | Autonomous-agent and orchestration context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing Watch live-drift primitives with a synthetic AMC-owned TNE-SDK-style autonomous gameplay baseline and live window. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, source refs, signed evidence refs, row hashes, receipt verification, and Watch alert projection. The negative path proves that TNE-SDK, AI-only MMO, MCP, TUI launcher, raw HTTP, persistent memory, self-reflection, hierarchical goal planning, full action/reasoning loop, OpenAI, Anthropic, Ollama, vLLM, repository metadata, topics, and README labels alone fail closed without signed live-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 13, Fork 1, Issues 1, Pull requests 0, 49 Commits, folder names, file names, topics, Python 100.0%, AI-only MMO labels, MCP labels, TUI launcher labels, raw HTTP labels, persistent memory labels, self-reflection labels, hierarchical goal planning labels, full action/reasoning loop labels, provider names, AgentSkills labels, game tick labels, action validation labels, local backlog metadata, or source identity alone must fail closed for live score and behavior drift claims. Passing live-drift evidence requires AMC-owned baseline distribution, live sample rows, behavior signatures, drift statistic, alert receipt, source refs, receipt hash, signed evidence refs, row hashes, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No TNE-SDK adapter, Null Epoch game integration, Python SDK wrapper, MCP server, skill importer, AgentSkills parser, TUI launcher, file relay, HTTP/WebSocket/SSE client, game API connector, provider adapter, SQLite memory backend, reflection engine, tactical review loop, prompt override system, action validator, benchmark runner, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, MCP server code, skill documents, reference files, examples, game mechanics, prompts, action schemas, API keys, configs, README prose beyond minimal metadata facts, generated outputs, model responses, benchmark rows, game state, relay artifacts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0934TneSdkLiveDriftBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; live-drift positive, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0934TneSdkLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0933ClassProductionAiAppMetricValidityBoundary.test.ts tests/gap0934TneSdkLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
