# AMC Product Surfaces & Integrations Map

## 1. STRUCTURE

| Surface | Location | What it is |
|---|---|---|
| MCP server | `src/mcp/amcMcpServer.ts` (744 ln), `src/mcp/mcpCli.ts` (159 ln), `src/mcp/mcpServerRiskAttestation.ts` (518 ln) | stdio MCP server exposing 10 read-only tools; CLI wiring; signed MCP-server risk-attestation data model |
| REST API | `api/index.ts` (372 ln), `vercel.json`, `railway.json` | Single-file `node:http` server; deployable to Vercel (`@vercel/node` build of `api/index.ts`) or Railway (`npm run api:start` → `tsx api/index.ts`) |
| Website | `website/` (~60 files) | Static marketing/docs site for agentmaturity.co (GitHub Pages, `CNAME`, `netlify.toml` also present); `install.sh`/`install.ps1` pinned-release installers, `openapi.yaml`, `docs/`, `blog/`, `playground.html`, `verify/amc-sample-evidence.amcbundle`, 7 "station" pages, PWA bits (`sw.js`, `manifest.json`) |
| VS Code ext | `vscode-extension/` — `src/extension.ts` (86 ln), `schemas/amcconfig.schema.json`, compiled `out/` | Thin CLI shim: 4 commands + status bar |
| GitHub Actions | root `action.yml` (26 ln) and `amc-action/action.yml` (316 ln) + README | Two separate composite actions |
| Python SDK | `sdk/python/` — `amc_sdk/` (core, types, decorators, assurance; 495 ln total), hatchling `pyproject.toml` v0.1.0 | Subprocess wrapper around the `amc` CLI |
| Platform | `platform/python/` — `amc/{shield,enforce,vault,watch,score,product,core,agents,api,web,benchmarks}` (~190 py files), huge `tests/`, `run_full_validation.py`, own FastAPI app | Python module library agents integrate to *earn* scores; explicitly not the canonical scorer |
| Integrations | `integrations/pytest-amc/` (plugin.py 111 ln, setup.py v1.0.0) | pytest plugin gating test runs on AMC level |
| Examples | `examples/` — 14 framework adapters (langchain node/py, langgraph, crewai, autogen, openai-agents-sdk, llamaindex, semantic-kernel, claude-code, gemini, openclaw, openhands, generic-cli, python-amc-sdk…) plus extras (`hello-agent`, `domain-proof`, `crewai-amc-github-actions`, stray root-level `*_bot.py` files) | Gateway-proxy integration demos |
| Distribution | `Formula/amc.rb` (Homebrew, pinned v1.1.1 tgz + sha256), `website/install-channel.json`, three `agent-maturity-compass-1.x.tgz` tarballs committed at repo root | Install channels |
| Containers/deploy | `Dockerfile` (CLI/Studio image), `Dockerfile.runner` (CI image), `docker/` (Studio quickstart + entrypoint → `amc studio start`), `deploy/{compose,k8s,helm,pulumi,terraform}` | Full self-host matrix for AMC Studio |

## 2. HOW IT ACTUALLY WORKS

**Everything funnels through the TypeScript CLI core (`src/`, ~990 registered commands in `cli.ts`).** The core owns the ledger (SQLite, `src/ledger`), transparency reports (`src/transparency/transparencyReport.ts`), industry packs + paywall (`src/domains/industryPacks.ts`, `industryPackEntitlement.ts`), Studio (`src/studio/studioServer.ts`), and gateway (`src/gateway/server.ts`).

- **MCP**: `amc mcp serve` (registered in `cli.ts:409` via `registerMcpCommands`) starts `startMcpServer()` — stdio transport, in-process 60 req/min `RateLimiter`, workspace validation requiring a `.amc/` dir. Every tool is a thin formatter over `generateTransparencyReport()` or `openLedger()`; `amc_score_sector_pack` checks the Industry Pack entitlement and returns a paywall message when inactive. One resource: `amc://agent/{agentId}` → markdown report. `mcpCli.ts` prints per-IDE config snippets (Claude Code, Cursor, Windsurf, VS Code, Kiro, generic).
- **REST API (`api/index.ts`)**: imports `../src/domains/industryPackEntitlement.js` directly (shared code, not a network call). Implements health, Industry Pack checkout/license issue+verify (HMAC-signed keys, admin-token protected via `AMC_INDUSTRY_PACKS_ADMIN_TOKEN`), `POST /api/quickscore`, and `GET /api/badge/:agentId`. Crucially, **its scoring is a local reimplementation** (`computeQuickScore`: prefix-bucketed question responses → 5 dimensions → composite → L0–L5), not the evidence-based core scorer.
- **GitHub Actions**: `amc-action/action.yml` installs the CLI via the website install script (pinned 1.1.1) or builds locally, runs `amc quickscore --auto --json` (or `--rapid --answers`), extracts JSON with an inline Node brace-matcher, writes step summary, does base-branch re-score for drop detection (git stash/checkout dance), gates on `target-level`, upserts a PR comment via `github-script`, uploads artifacts. Root `action.yml` is a different, simpler product: `amc run --ci --fail-below <grade>` with optional `--fix` (grade-letter gate, matching `cli.ts:5223`).
- **Python SDK**: `_find_amc()` locates the CLI, `_run_amc_command()` shells out and parses JSON. `score()`→`amc quickscore --json`; `fix()`→`amc fix --json --target-level` (real command, `src/guide/fixCli.ts:78`); `with_amc()` starts `amc gateway start --port 3210` and sets `OPENAI_BASE_URL` so LLM calls route through the AMC gateway for evidence capture — the same gateway-proxy pattern all 14 `examples/` use. Failures degrade silently to L0/empty results.
- **pytest-amc**: after the test session, shells out to the CLI, prints score, optionally fails the run below `--amc-min-level`.
- **Website**: pure static; `install.sh` pins release v1.1.1 from GitHub Releases with SHA-256 verification (`install-channel.json` is the channel manifest); `openapi.yaml` documents the *Studio* `/v1` API (cookie/bootstrap-token auth), not the Vercel `api/index.ts`.
- **Deploy stack**: all containers converge on **Studio**: `docker/entrypoint.sh` → `node /app/dist/cli.js studio start` exposing Gateway :3210, Proxy :3211, Studio API/Console :3212; compose adds a fail-closed Notary signing service (:4343) and Caddy TLS; k8s/helm/pulumi/terraform wrap the same image, single-replica by design (SQLite/filesystem state).

## 3. CAPABILITY INVENTORY

- **MCP tools (10, all read-only)**: `amc_list_agents`, `amc_quickscore`, `amc_get_guide`, `amc_check_compliance` (EU_AI_ACT, ISO_42001, NIST_AI_RMF, SOC2, ISO_27001), `amc_transparency_report` (md/json), `amc_score_sector_pack` (41 packs, paywalled), `amc_score_agent`, `amc_list_evidence` (windowed, cap 200), `amc_query_diagnostic`, `amc_get_recommendations`; resource `amc://agent/{agentId}`; CLI: `amc mcp serve|config|list-tools`.
- **REST endpoints**: `GET /api/health`, `GET/POST /api/industry-packs/{access,checkout}`, `POST /api/industry-packs/license/{issue,verify}` + `/webhook` alias, `POST /api/quickscore`, `GET /api/badge/:agentId` (SVG), `/` index. CORS `*`; 1 MB body cap.
- **amc-action inputs/outputs**: agent-id, target-level, fail-on-drop, comment, upload-artifacts, node-version, amc-version (1.1.1|local), working-directory, answers-file → score, level, passed, result-json; PR comment upsert; shields.io badge; 90-day artifacts. Root action: fail-below grade, fix flag.
- **Python SDK**: `score()`, `fix()`, `report()`, `with_amc()` context manager (gateway env injection), `assurance.run()` (red-team packs, SARIF), `@amc_guardrails(min_level, packs, fail_on_drop)`.
- **pytest-amc**: `--amc-score`, `--amc-min-level`, `--amc-fail-below`, `--amc-agent-id`.
- **VS Code**: commands `amc.quickscore|lint|doctor|dashboard` (terminal/exec shims), status-bar item, `amcconfig.yaml` JSON schema; activates on `.amc/**`.
- **Platform (Python)**: ~190 modules — shield (16 pre-exec scanners), enforce (35 runtime policies: circuit breaker, step-up auth, policy engine), vault (14 DLP/secrets/honeytokens), watch (10 observability), score (7, demo-only), product (81 dev-experience); own FastAPI app (`amc/api/main.py` with routers score/shield/enforce/vault/watch/product), web viewer, `run_full_validation.py` (27 phases / 1600 tests).
- **Distribution/deploy**: Homebrew formula, curl|sh + PowerShell installers (pinned, checksummed), npm tarballs, `Dockerfile` (Studio, non-root, healthcheck `amc studio healthcheck`), `Dockerfile.runner` (CI, Python+Node), compose (HTTP/TLS/notary), k8s kustomize (HPA capped at 1, PDB, PVC), Helm chart + Pulumi/Terraform wrappers, Railway, Vercel.

## 4. REUSE VERDICTS

- **`src/mcp/amcMcpServer.ts` — KEEP-AS-SERVICE**: clean, self-contained, thin over core report/ledger APIs; ideal plugin-service shape already.
- **`src/mcp/mcpServerRiskAttestation.ts` — REFACTOR**: solid signed-attestation data model but imported only by two gap tests, wired to nothing user-facing; needs a home before reuse.
- **`api/index.ts` — REPLACE (keep licensing part)**: quickscore/badge logic is a divergent toy reimplementation; license issue/verify + checkout URL logic is real and worth extracting as a service.
- **`amc-action/` — KEEP-AS-SERVICE**: complete, defensive, self-verifying CI gate; only needs release-version plumbing generalized. Root `action.yml` — REPLACE/merge: duplicate product with a different gate semantic.
- **`sdk/python/` — REFACTOR**: right interface (subprocess façade + gateway env injection), but silent-failure-to-L0 behavior and alpha maturity need hardening before it's a dependable service.
- **`integrations/pytest-amc` — KEEP-AS-SERVICE**: tiny, orthogonal, works via CLI contract only.
- **`vscode-extension/` — REPLACE**: 86-line terminal shim; a harness-native panel/LSP surface supersedes it.
- **`website/` — KEEP-AS-SERVICE**: static, deployable anywhere; install channel + verify bundle are genuinely load-bearing distribution infra.
- **`platform/python/` — REFACTOR**: valuable module library but monolithic (190 modules, embedded FastAPI, its own `.amc` workspace and `AMC_OS/LOGS` committed); decompose into installable packages before wrapping.
- **`examples/` — KEEP-AS-SERVICE** (docs asset), after pruning stray root-level `*_bot.py` files.
- **Deploy matrix (`deploy/`, `docker/`, Dockerfiles) — KEEP-AS-SERVICE**: coherent, converges on one Studio image; honest about single-replica limits.
- **`Formula`/installers — KEEP-AS-SERVICE**: pinned + checksummed; only version-bump automation missing.

## 5. SURPRISES & DEBT

- **`api/index.ts` header advertises `GET /api/questions`, `GET /api/packs`, `POST /api/score` — none are implemented**; and `/api/badge/:agentId` always returns a hardcoded L0/0 badge ("In production, look up cached scores").
- **Two competing scorers**: the API's prefix-heuristic `computeQuickScore` (5 dimensions, v2.0.0) vs the CLI's evidence-based scorer — public badge/API numbers can't match CLI numbers. Platform README admits a third (Python `amc/score/`) is "a demo, NOT the canonical scorer."
- **Two GitHub Actions with different semantics** (root: letter-grade `amc run --ci`; `amc-action/`: level-gate `quickscore`) — README of the latter itself warns it's "not a verified Marketplace listing."
- **`website/openapi.yaml` documents the Studio `/v1` API, not the deployed Vercel/Railway API** — the only OpenAPI on the site describes a different server than `api/index.ts`.
- **VS Code extension is unpublished scaffolding**: compiled `out/` committed, no `.vsix`, dashboard command assumes `amc dashboard open` exists; no marketplace evidence.
- Release tarballs (3 versions) committed to git root; `node_modules/`, `logs/`, `tmp/`, `test-results/`, `test_model.pkl`, and `platform/python/.amc`/`.amc_cache`/`AMC_OS/LOGS` workspace state also committed.
- Default vault passphrases baked into both Dockerfiles (`amc-docker-default-passphrase`, `amc-ci-runner-default`) — documented as deliberate but a footgun.
- `src/cli.ts` is a ~14k-line monolith (990 `command(` matches) plus a stray `cli-new-commands.ts.fragment` file — decomposition debt at the core every surface shells into.
- Marketing sprawl at repo root (`SOUL.md`, `IDENTITY.md`, `AMC_ARMY_ROLES.md`, `amc_ai_army/`, `mirofish-simulation/`, `COMPETITIVE_GAP_REPORT_G0DM0D3.md`) intermixed with product code.
- pytest-amc setup.py email `hello@agentmaturitycompass.com` vs everywhere else `agentmaturity.co` — stale identity.
- MCP server's paywall check (`amc_score_sector_pack`) uses `process.cwd()` entitlement, ignoring the per-tool `workspace` argument pattern used elsewhere — inconsistent workspace resolution.