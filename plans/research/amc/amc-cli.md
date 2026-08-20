# CLI / Servers / Startup Exploration Report

## 1. STRUCTURE

- **`src/cli.ts` (24,395 lines)** — the monolithic Commander program. Shebang entry (`bin` in package.json, v1.1.1). Defines ~990 `.command()` registrations across ~100 top-level groups (`score`, `studio`, `host`, `monitor`, `verify`, `gateway`, `firewall`, `vault`, `shield`, `enforce`, `watch`, `product`, `marketplace`, `mechanic`, `bench`, `org`, `transform`, …). Everything from `program.parseAsync` at line 24376.
- **Satellite registries `src/cli-*.ts`** — extracted command packs, each exporting `registerXxxCommands(program, activeAgent)`:
  - `cli-late-stage-commands.ts` (1,561 ln) — *composition hub*: registers demo/redteam commands itself, then calls into `cli-observability-commands.ts`, `cli-trace-commands.ts`, `cli-import-commands.ts`, `cli-strategy-commands.ts`, `cli-eval-dataset-commands.ts`, `cli-business-commands.ts`, plus `registerTransparencyReportCommands`, `registerMcpCommands`, `registerLintCommands`. Wired from `cli.ts:24345`.
  - `cli-watch-commands.ts` — now a stub: `amc watch` is a back-compat alias; canonical is `amc monitor`.
  - `cli-domain-product-commands.ts` — wired directly at `cli.ts:22173` with `{product, productGlossary, domainCmd}` dependency injection.
  - `cli-new-commands.ts.fragment` — **dead file**: a stale copy of the SHIELD section that was pasted inline into cli.ts (~line 19830); nothing imports it.
- **`src/cliUx.ts`** — grouped help (`CLI_GROUPS`, `CLI_ALIASES`), command inventory (`amc commands --markdown` → `docs/CLI_COMMAND_INVENTORY.md`, 1,177 lines), fuzzy "did you mean", shell completions (bash/zsh/fish).
- **`src/repl/`** — `replCli.ts` registers `amc shell`; `amcRepl.ts` (readline loop), `replParser.ts` (60+ regex NL patterns + multi-step workflows), `replRenderer.ts`, `replContext.ts`.
- **`src/studio/`** — the control plane. `studioServer.ts` (**333 KB**, ~220 pathname checks): the HTTP API server. `studioSupervisor.ts`: startup/daemon orchestration. `cliBridge.ts`: CLI-over-HTTP. `oneCommandUp.ts`: `amc up` passphrase/baseline helpers. `openapi.ts` (93 KB): OpenAPI 3.0 generator. `studioSse.ts`, `studioState.ts` (pid/port/token state file), `apiDelegation.ts` (auth/RBAC/rate-limit shim for `/api/v1/*`), `connectWizard.ts`, `onboardingApi.ts`, `signatures.ts`.
- **`src/console/`** — Compass Console static SPA: `consoleServer.ts` (70-line static file server), 59 `pages/*.html`, `assets/*.js`, `state/` (uiModels/uiSelectors/uiFormat TS used at build time).
- **`src/dashboard/`** — `build.ts` (static HTML dashboard generated from run artifacts into `.amc/agents/<id>/dashboard`), `serve.ts` (static server + `/api` via `handleApiRoute`), `components/`, `templates/`.
- **`src/doctor/`** — `doctorRules.ts` (typed PASS/FAIL/WARN/INFO checks), `doctorCli.ts`, `doctorReport.ts`, `doctorFix.ts` (auto-remediation).
- **`src/setup/`** — `setupWizard.ts`, `quickSetup.ts`(+Cli), `onboardingState.ts`, `onboardingActivation.ts`, `integrationScaffold.ts` (framework middleware scaffolds + Bridge OpenAPI).
- **`src/bootstrap/bootstrap.ts`** — non-interactive production bootstrap (`amc bootstrap`).

## 2. HOW IT ACTUALLY WORKS

**Registration**: one Commander `program`; groups are `const x = program.command("x")` then subcommands chained. Satellites receive `program` (or specific group Commands) and an `activeAgent` accessor. Unknown tokens hit a catch-all `program.action` (cli.ts:19796) that prints fuzzy suggestions; **bare `amc`** runs `runInstantFullScoreForAgent` (instant full score), not the REPL.

**`amc up` (alias `start`)** — cli.ts:3535: (1) `--demo`: `startStudioDaemon` with `hostDir=.amc/studio-demo-host`, auto-generated demo vault passphrase, no signing, auto-opens `/w/demo/console/`. (2) Signed path: `ensureUpVaultPassphrase` (env → keychain/credentials-file remembered store → interactive → auto-generate), `initWorkspace`, init action-policy/tools.yaml if missing, vault init/unlock, preflight signature checks (trust.yaml, ops-policy, plugin integrity, notary trust; refuses on failure), then `startStudioDaemon(workspace)` and `runFirstBaselineIfNeeded` (auto `unifiedRun` 8-surface baseline on first run, from `oneCommandUp.ts`).

**Daemonization** — `startStudioDaemon` (studioSupervisor.ts:573) re-spawns `node cli.js _studio-daemon --workspace …` detached, logs to `.amc/studio/logs/studio.log`, polls the state file 6 s. The hidden `_studio-daemon` command (cli.ts:18572) calls `runStudioForeground`, which starts **in one process**: gateway (`startGateway`, LLM proxy + optional proxyPort), metrics server (:9464, Prometheus), dashboard build+serve (:4173), Studio API (`startStudioApiServer`, :3212), verifies ~12 config signatures → `untrustedConfig` flag, writes `StudioState` (pids/ports/agent/vault) via `studioState.ts`. Host mode (hostDir set) instead starts `startWorkspaceRouter` — a multi-tenant router mounting per-workspace studio servers under `/w/<id>/…` with `/host/api/*` auth (login/OIDC/SAML/SCIM). `amc studio start` runs the same `runStudioForeground` non-daemonized for deployments; `amc down`/`amc status` use `stopStudioDaemon`/`studioStatus` + `/readyz`.

**Studio server** (studioServer.ts:1736 handler): CORS → CIDR allowlist → rate limiters (auth/write/health/api) → `/console/*` static via `serveConsolePath` → `/healthz` → `/api/v1/*` via `handleStudioApiDelegation` (delegates to `src/api/` route table with role policy) → `/readyz` → SSE (`/events/org`, plus audit/value/assurance SSE hubs and scheduler ticks) → `/bridge/*` (agent evidence/lease bridge, pairing codes) → hundreds of inline legacy routes → **`/cli/exec|batch|commands|validate`**: the CLI Bridge spawns `dist/cli.js` per request, with a dangerous-prefix confirm list and interactive-command blocklist. Auth: admin token (from `studioState`), user sessions (RBAC roles VIEWER…OWNER), agent tokens/leases.

**Console vs dashboard**: the Console (port 3212 `/console`) is the primary UI — static pages fetching Studio APIs. The Dashboard (port 4173) is an older *pre-rendered static* report built from run artifacts by `dashboard/build.ts`; supervisor builds it at startup (bootstrap placeholder if no runs) and studioServer can rebuild on demand.

**REPL** (`amc shell`): readline loop; each input is matched by `replParser` regex patterns to a real CLI command or `workflow:<id>` step list, then **executed as a child process** (`spawn(node, [cli.js, …], AMC_REPL=1)`), output re-parsed by `updateContextFromOutput` to track score/trust in the status bar. Pure keyword matching, no LLM.

**Bootstrap** (`amc bootstrap` → `bootstrap/bootstrap.ts`): owner-mode-gated, requires `AMC_VAULT_PASSPHRASE_FILE`; initializes vault, users, ~20 signed policy stores (action, tools, budgets, approvals, adapters, bridge, org, gateway, ops, forecast, bench, canon, diagnostic bank, cgx, plugins, mechanic, prompt, assurance), transparency log + Merkle, optional LAN mode + notary trust, emits a signed bootstrap report.

**Doctor**: `runDoctorRules` returns typed checks (node version, workspace, studio running, vault, notary health/sign-smoke, gateway config/routes, toolhub denylist, lease carriers, adapters, native modules ABI); rendered by `doctorReport`; `amc doctor-fix` applies `doctorFix.ts` remediations.

## 3. CAPABILITY INVENTORY

- ~990 commands, ~100 top-level groups (source of truth: `amc commands --markdown`). Core UX: `amc` (instant score), `up/start`, `down`, `status`, `init`, `setup`, `quickstart`, `doctor`, `doctor-fix`, `fix` (guide/fixCli.ts — score→explain→write guardrails→receipt), `run` (unified 8-surface run), `quickscore`, `improve`, `guide`, `shell`, `help`, `commands`, `methodology`, `explain`.
- Server/infra groups: `studio` (ping/start/healthcheck/lan enable|disable/connect), `host` (init/bootstrap/user/workspace/migrate/membership), `gateway`, `firewall`, `runtime`, `metrics`, `config` (profile/print/explain), `logs`.
- Governance/evidence: `verify`, `evidence`, `bundle`, `transparency`(+merkle), `audit`, `compliance`, `policy`, `governor`, `enforce`(+resource protocol commands, registered twice for `enforce resources` and top-level `resource`), `approvals`, `lease`, `budgets`, `workorder`, `ticket`, `notary`, `trust`, `vault`, `dlp`, `shield`, `truthguard`, `proof`, `canon`, `cgx`.
- Scoring/analytics: `diagnostic`, `score`, `eval`, `assurance`, `bench`, `benchmark`, `org`, `whatif`, `indices`, `drift`, `forecast`, `advisory`, `experiment`, `mechanic`, `bom`, `transform`, `memory`, `oversight`, `classify`, `claims`, `dag`, `confidence`, `scan`, `playground`, `mirofish` (simulation engine).
- Ops: `backup`, `retention`, `blobs`, `maintenance`, `release`, `ops`, `ci`, `e2e`, `federate`, `incidents`/`incident`, `alerts`, `freeze`, `monitor` (canonical; `watch` aliased).
- Identity/multi-user: `user`, `identity`, `sso`, `scim`, `pair`, `mode` (role modes), `admin`.
- Ecosystem: `plugin`(+registry), `marketplace`, `adapters`, `integrations`, `archetype`, `export`, `passport`, `standard`, `casebook`, `prompt`, `product`, `domain`, `glossary`, plus late-stage: `demo`, `redteam`, traces, SIEM alerts, golden sets, lite scoring, business KPIs, leaderboards, inventory, comms-check, executive reports, transparency report, MCP server, lint.
- HTTP surfaces: Studio API (`/api/v1/*` REST + legacy routes, `/openapi.yaml`, SSE hubs, `/bridge/*`, `/cli/*`, `/console/*`, `/healthz`, `/readyz`); host router (`/host/*`, `/w/<id>/*`); gateway proxy; metrics `/metrics`; dashboard static server.
- Config: env-driven `loadStudioRuntimeConfig` (workspace dir, binds, ports, CIDRs, CORS, retention, proxy hops, notary, LAN); `.amc/*.yaml` signed configs; remembered vault passphrase (macOS Keychain or credentials file).

## 4. REUSE VERDICTS

- **studioSupervisor (`runStudioForeground`/daemon lifecycle)** — REFACTOR: sound service-composition logic entangled with signature preflight and dashboard-build side effects; decompose into per-service starters first.
- **studioServer.ts** — REPLACE/REFACTOR: 333 KB hand-rolled route dispatcher; the `/api/v1` + `apiDelegation` + `src/api/` route-table path is the keeper; the ~200 inline legacy routes should be migrated into it and the monolith retired.
- **cliBridge (`/cli/exec`)** — KEEP-AS-SERVICE: clean, small, validated CLI-over-HTTP with danger/interactive guards; ideal plugin service surface.
- **consoleServer + console pages** — KEEP-AS-SERVICE (server) / REFACTOR (pages): the static server is trivially wrappable; 59 hand-written HTML pages duplicate API-fetch boilerplate.
- **dashboard build/serve** — REPLACE: pre-rendered static dashboard is superseded by the Console; supervisor still builds it on every start.
- **REPL** — KEEP-AS-SERVICE: fully decoupled (spawns the CLI); parser/renderer are pure functions; NL mappings need upkeep as commands drift.
- **doctor** — KEEP-AS-SERVICE: typed rules + CLI wrapper already API-shaped (`runDoctorCli` returns structured report).
- **bootstrap.ts** — KEEP-AS-SERVICE: single deterministic function with typed options/result.
- **oneCommandUp.ts** — KEEP-AS-SERVICE: small, documented, already extracted from cli.ts.
- **setup/** — REFACTOR: quickSetup/setupWizard/onboarding overlap (3 entry paths); integrationScaffold mixes scaffolds, contract tests, simulator, and OpenAPI in one 38 KB file.
- **cli.ts** — REFACTOR (aggressively): 24 k lines; the satellite-registry pattern already proves the decomposition path.
- **cliUx.ts** — KEEP-AS-SERVICE: inventory/help/completions are program-agnostic over Commander.

## 5. SURPRISES & DEBT

- **`cli-new-commands.ts.fragment`** is dead: a leftover paste-buffer of the SHIELD block already inlined in cli.ts.
- **Two dashboards**: legacy static dashboard (:4173) still built on every startup though the Console is the advertised UI; failure is swallowed with a placeholder page.
- **cli.ts at 24 k lines vs. 10 satellite files** — extraction stalled; `cli-late-stage-commands.ts` became a second monolith/registration hub with its own inline `redteam`/`demo` commands.
- **`amc watch` is a shim** — comments say monitoring moved to `amc monitor`, but the file name/registration remain.
- **`/cli/exec` executes by spawning `dist/cli.js`** — hard dependency on a built dist inside the workspace (`findAmcBin` falls back to `dist/cli.js`); confirm-flag security is prefix-string matching.
- **Resource protocol commands registered twice** (`enforce resources` and top-level `resource`, cli.ts:21112/21118) — deliberate dual-mount, but doubles the surface.
- **Bare `amc` runs a full instant score** (side-effectful for a no-arg invocation), while docs/REPL banner push `amc shell`.
- **Duplicate onboarding paths**: `setup`, `quickstart` (workspace.ts), `quickSetup`, `setupWizard`, `studio connect`, `onboardingActivation` all overlap.
- **`untrustedConfig` is advisory** at daemon runtime (banner + audit event) but *blocking* in `amc up` preflight — two different trust postures for the same checks.
- **`ensureUpVaultPassphrase` auto-generates and persists a passphrase in non-interactive shells** by default (`--no-remember` to opt out) — convenient but surprising for a security-first product.
- Console `state/` TS selectors sit beside plain-JS assets — a half-built typed-UI layer.
- REPL NL patterns and `CLI_GROUPS` highlights are hand-maintained snapshots of a 990-command surface; several highlight paths (e.g. `lifecycle up`) are aliases that may drift from real registrations.