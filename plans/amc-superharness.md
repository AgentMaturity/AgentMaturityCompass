# AMC Superharness — Gap Analysis & Construction Plan

**Objective:** Make AgentMaturityCompass a strict superset of DeepSeek Harness (`dsh`) — a full agent harness with dsh's composability, execution, and engineering discipline — while keeping and weaponizing AMC's trust plane (signed evidence, maturity scoring, enforcement, compliance) so the result is not a clone but the world's first *governed* agent harness.

**Status:** DRAFT v1 · 2026-08-20 · produced from a 16-agent exhaustive read of the Cordis paper (88 pp), the full `deepseek-harness-master` tree (7,799 files), the public dsh doc site, and the AMC repo at `f419839a`.

**Plan file convention:** Blueprint format. Every step is self-contained (context brief → tasks → verification → exit criteria) so a fresh agent can execute it cold. Steps are one-PR-sized where possible; epics are decomposed. Dependency edges and parallel tracks are explicit in §8.

---

## 0. Executive summary

**The one-sentence thesis.** dsh can run agents but cannot prove anything about them; AMC can prove things about agents but cannot run them. The superset is a harness whose session log *is* a signed evidence ledger — every tool call, approval, sandbox decision, and model request becomes OBSERVED-tier evidence natively, which makes AMC's maturity score live instead of questionnaire-driven and makes dsh-class execution auditable in a way dsh itself cannot match.

**What dsh is.** DeepSeek Harness (v0.1.0-rc.8, MIT, pnpm monorepo, ~50 package families) is an "everything is a plugin" agent harness built on Cordis, a formally-specified composition framework (the paper: revertible effects + reactive coeffects = components can be loaded/unloaded/hot-swapped at runtime with all side effects reverted and dependencies re-resolved). On that kernel dsh builds: an event-sourced session core, a multi-provider LLM seam, a guarded tool-execution pipeline, OS sandboxing (bwrap/Landlock/Seatbelt/Windows ACL), PTY terminals, subagents (in-process + ACP/Codex/Claude-Code), a workflow engine, skills, hooks compatibility with Claude Code and Codex, MCP client, a React web UI, twin TS/Python SDKs with a single-exe runtime, and an engineering system (per-file 100% coverage, session-log-replay snapshot testing, ~30 doc gates, machine-gated ADRs) that is arguably the strongest part of the whole repo.

**What AMC is.** A 482K-line TypeScript CLI (npm `agent-maturity-compass`, bin `amc`) that scores agents L0–L5 from evidence, with 8 surfaces (Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport), a hash-chained SQLite evidence ledger, Ed25519 signing everywhere, an LLM gateway/egress proxy with leases and budgets, Claude-Code/Gemini hook integration, declarative signed plugins, an MCP server, and static-HTML consoles. AMC **never runs an agent**: no agent loop, no tool executor, no PTY, no kernel sandbox, no code plugins, no hot reload (all verified absences).

**The verdict in numbers.** Across 16 capability domains (§5), the gap matrix records ~106 dsh capabilities AMC lacks against ~24 AMC-ahead assets; the gaps cluster into four masses: (1) the composition kernel, (2) the execution engine (loop + tools + sandbox + sessions), (3) product surfaces (web UI, SDKs), (4) the engineering system. The plan closes them in 10 phases (§7). Per §8, the critical path is ~34–42 weeks of calendar time with 2–3 parallel agent-driven workstreams opening after Phase 4; total effort is larger than the critical path because parallel lanes overlap it.

**The five headline moves.**
1. **Adopt Cordis, don't reimplement it** (vendored, like dsh does) — the metatheory is proven, the framework is MIT, and Koishi's 4,000-plugin ecosystem is its validation. AMC's value-add goes *on top*, not underneath. (ADR-1, §6)
2. **Strangler migration, not rewrite** — the existing `amc` CLI keeps working while a new plugin-composed runtime (`amc up` v2 / `amc agent`) grows beside it; existing subsystems (ledger, gateway, crypto, scoring) are wrapped as Cordis services first, decomposed later.
3. **Evidence-native loop** — the session event log and the evidence ledger become one write path: append-only, hash-chained, Ed25519-signed, Merkle-anchored. dsh's "model-visible ⟺ logged" invariant becomes AMC's "logged ⟺ provable."
4. **Enforcement moves inline** — AMC's ~58 `src/enforce` modules are today mostly advisory simulation; the tool pipeline's `pre-execute` waterfall + monotonic guards is where they become real. Policy stops being a report and starts being a deny.
5. **Beat dsh where dsh concedes** — dsh's own "Known Limitations" sections are a target list: no web auth/TLS, no allow-always approval store, unsigned logs, no plugin signing, no session format migrations, process-local jobs, no turn budgets, no live maturity/trust surface at all. Each becomes a differentiator (§7 Phase 10).

---

## 1. Sources and method

| Source | Coverage |
|---|---|
| *A Programming Paradigm for Spatiotemporal Composability* (Shi, Zhang, Cui — Peking University / DeepSeek-AI, 88 pp) | Read in full via 4 page-range readers: §3 revertible effects & reactive coeffects, §4 calculus + metatheory (preservation, temporal/spatial composability, progress, confluence), §5 Cordis implementation (effect tracking, loader, HMR, Koishi), §6 discussion (system boundary, service multiplexing, capability security, versioning, OS co-design), §7 related work |
| `deepseek-harness-master` (7,799 files) | 8 cluster readers: core/Cordis foundations; session & state; tool execution + native sandboxing; LLM & orchestration; security & governance; client/host/web + apps; SDK/Python/examples/vendor; `.agents` self-development system; plus a CI/engineering-process reader |
| dsh public doc site (`deepseek-harness.github.io`) | 12 pages: quickstart, providers, python-sdk, develop/basic (index, tool, config, publish), develop/framework (lifecycle, service, events), practice, reference |
| dsh in-repo docs (330 files) | architecture, agent-lifecycle, tool-execution-pipeline, capability-seams, config/tool/persistence catalogs, cordis primer + tutorial, defensive-patterns, testing, 4 postmortems |
| AMC repo at `f419839a` (branch `codex/reconcile-stale-worktrees`) | Dedicated baseline reader with verified absence claims (grep-backed) |
| Prior session state | Vault checkpoint (`/Users/sid/Documents/AMC`), npm state (1.1.1), open P0 (release), test-count drift |

Full agent reports: `scratchpad/research/*.md` (16 files, session-local). Key claims in this document cite file paths in the respective repos.

---

## 2. DeepSeek Harness digest — what the bar actually is

### 2.1 The kernel (Cordis) and why it matters

The paper formalizes two properties no mainstream plugin system has:

- **Temporal composability** — every context mutation is an *effect paired with an inverse*, tracked in an accumulator (`∂Γ = Γ × (Γ→Γ)`). Unloading a component applies its accumulator: complete recovery is a *structural guarantee*, not a discipline. Independence theory (§3.1.3) + the metatheory's confluence result (Thm 73) prove that a dynamically-assembled system quiesces to the same state as a static assembly — "dynamic history leaves no trace." This is what makes hot-swapping a live component safe.
- **Spatial composability** — components declare dependencies (coeffects) as data; the runtime computes satisfaction on every context change and activates/deactivates/reloads components reactively. Provider swap ⇒ dependents restart automatically. Isolation (per-realm key resolution) and interception (right-biased policy metadata on bindings) give multi-tenancy and capability-based security (§6.3) *without* touching component code.

The runtime realization (§5): `ctx.effect()` is the single mutation primitive (auto-tracked, LIFO recovery, guard-checked per iteration, parent-composed so unload cascades); fibers have a 6-state lifecycle (PENDING→LOADING→ACTIVE→UNLOADING→DISPOSED / FAILED, with inertial transitions that run to completion); the loader reconciles a declarative `cordis.yml` entry tree by id-diff (rebuild / realm-move / in-place / unload per changed field); HMR reclassifies changed modules, then transactionally disposes + re-instantiates stale entries with cache backup/restore — never a half-reloaded state. Failure is per-fiber, never propagated to the parent: a broken plugin leaves siblings running.

**Implication for AMC:** this is a *kernel decision*, not a feature. Everything else in dsh (seams, HMR, config layering, per-agent scopes, self-modification) falls out of it. AMC cannot bolt this on later; it is Phase 1 or never.

### 2.2 The harness on top — capability seams

Every capability is three roles: **Service Definition** (abstract class on `ctx.*`), **Service Provider** (swappable plugin), **Consumer** (model-facing tool). Shell/fs/subprocess/sandbox/LSP/web/compaction/spill/skills/subagents/persistence/credentials/settings are all seams; swapping fs+subprocess providers to E2B relocates bash, PTY, and LSP to a cloud sandbox with zero forks. The agent loop itself is a plugin (`core/agent-loop`), the only package with loop logic.

### 2.3 The ten dsh subsystems that define the bar

1. **Event-sourced sessions** — append-only typed event log; LLM history *derived*, never stored; `surfaceOp: replace` lets compaction shrink context without rewriting history; `request/header` snapshots make every model request reconstructable from log + code; crash repair synthesizes `TOOL_OUTCOME_UNKNOWN` results instead of truncating; JSONL (zstd, packed chunk runs, ~60% smaller) and SQLite backends behind one persistence contract; projections (pure folds with stale-never-wrong caches); FTS5 session search exposed as model tools.
2. **LLM seam** — adapter registry with routes; strict StreamChunk contract (`usage` before `finish`, raw JSON tool args, one call = one attempt); `BlockAssembler` folds deltas; retry lives at the turn boundary (`agent/request-error` waterfall), never wrapping transports; token meter + context-pressure projections; providers: DeepSeek native, plus pi-ai multi-provider (Anthropic/OpenAI/Bedrock/Vertex/Azure/custom gateways); model discovery by endpoint interrogation.
3. **Agent loop** — inbox as the *only* queue (followup/steer/inject over one `send`); turn = steps; `agent/pre-step` waterfall can rewrite claimed input; bounded rolling tool-call pool; `turn/end` reasons; per-agent Cordis scope (events up, visibility down).
4. **Tool pipeline** — `tools/pre-execute` waterfall (allow/deny/ask) → *monotonic* guards (deny-only, so ordering can't launder a denial) → approval seam (fail-closed 4-value vocabulary) → `tools/execute` wrapper → body → `tools/post-execute` (replace/block/attach context) → `finalizeContent` → observe-only `tools/result`. Code Mode: model writes one TS program; `tools.name()` bindings re-enter the full pipeline as logged sub-calls in a hostile-peer worker.
5. **Execution substrate** — subprocess seam with detached process groups, tree termination, bounded collectors with spill files, credential scrub; `node-pty` PTY terminals with a readiness-evidence ladder (OSC 133 prompt marks + foreground-group verification); background jobs with owner fencing and bounded wake budgets.
6. **Sandboxing** — per-call policy (`read-only` → `workspace-write` → `danger-full-access`); bwrap → Landlock (own ~300-line C launcher, musl-static, exit-125 contract) → Seatbelt → Windows restricted-token ACL; fail-closed `SANDBOX_UNAVAILABLE`; denial→same-turn escalation protocol (model retries once with `sandbox_permissions` + one-sentence justification, human approves) with strict-widening checked at execution time.
7. **Orchestration** — subagents: in-process spawn/fork + out-of-process ACP/Codex/Claude-Code/dsh-SDK providers; continuable children whose inbox is the only mailbox; `report` return channel; workflow engine (model-written scripts, `agent()/parallel()/pipeline()`, worker-thread isolation); `ralph` fresh-agent loop; goal rounds; session-local durable schedules; experimental Agent Teams (shared CAS task DAG).
8. **Ecosystem compatibility** — Claude Code and Codex `hooks.json` bridges onto native waterfalls (`deny > ask > allow` merge); skills (SKILL.md, layered discovery, digest-driven durable catalog); agent presets (`agent.cordis.yml` per-session composition); MCP client (`mcp__server__tool` names, reconnect budgets); ACP server.
9. **Product surfaces** — React web UI (streaming chat, approval composer takeover, projections push channel, workspaces, session search, fork/export, per-plugin HMR); typed RPC with Host-header trust fence + loopback-pinned privileged methods; headless one-shot mode; TS SDK + Python SDK (pip-installable single-exe Node runtime — "no system Node.js"); JSON-RPC stdio protocol.
10. **Engineering system** — per-file 100% coverage gate; gate-DAG runner (`run-gates.ts`); session-log-as-fixture snapshot replay (record once with a real key, replay keylessly forever); mock LLM fault server; doc-typecheck of markdown fences against the live API; generated catalogs with `--check` twins; oxlint type-aware + jscpd + knip + publint; Windows-under-Wine as the *required* CI signal; machine-gated ADR corpus (`.agents/notes`, 724 notes: proposed/implemented/rejected/archived with format gates and a sealed hash-manifest archive); 11 repo skills; 4 postmortems feeding standing rules.

### 2.4 dsh's own confessed weaknesses (our target list)

From dsh's mandatory "Known Limitations" sections and TODOs: no TLS/auth on the web server (`--host 0.0.0.0` refused outright); approval has no allow-always/grant store; session logs are unsigned and unencrypted; no plugin signing or registry trust model; `SESSION_FORMAT_VERSION` pinned at 0 with no migrations; jobs are process-local and die with the process; no built-in turn budget; `timeoutMs` declarative-only without the policy wrapper mounted; hook config is process-level not per-session; `HookOutput.updatedInput` parsed but not honored; spill files accumulate unbounded; credential scrub is a name heuristic; no wire-level cancel or per-session close in the SDK protocol; no Windows Python wheels; no maturity/trust/compliance/fleet surface of any kind. AMC keeps or builds the counterpart to every one of these (§7 Phase 10).

---

## 3. AMC baseline — verified against `f419839a`

### 3.1 What exists (harness-relevant)

- **CLI**: ~990 commander registrations (~1,163 documented command paths, ~100 top-level groups) in `src/cli.ts` (24,395 lines) + 10 satellite registries (one of which, `cli-late-stage-commands.ts`, became a second registration hub). Eight product surfaces plus `evidence`, `audit`, `redteam`, `gateway`, `sandbox`, `plugin`, `mcp`, `mechanic`, `fix`, `up`, `doctor`, `shell` (REPL), `dashboard`, `studio`. Bare `amc` runs an instant full score.
- **Real interception engine**: `src/runtime/firewall.ts` (~1,640 lines) — signed policy, regex rule families (promptInjection, secretExposure, destructiveAction, piiLeakage, payloadAnomaly), score→allow/warn/block mapping, observe/warn/enforce modes, fail-closed when enabled, signed decision receipts. Wired into the bridge (HTTP 403 `RUNTIME_FIREWALL_BLOCKED` on request/stream/response) and gateway paths.
- **Toolhub** (`src/toolhub/toolhubServer.ts`): real tool executors (fs/git/http/process) gated by signed action-policy + blast-radius consent + approval consumption — an operator/hook-facing proto-tool-pipeline, not driven by any agent loop.
- **Observation** (four paths, all local): LLM gateway reverse proxy on :3210 with secret redaction + egress proxy on :3211 with deny-by-default host allowlist (`src/gateway/server.ts`); monitored child-process spawn with key stripping (`src/ledger/monitor.ts`); Claude-Code/Gemini PreToolUse/PostToolUse hook emitters posting to a bridge with allow/deny decisions (`src/adapters/hookIntegration.ts`, `src/bridge/`); offline log/trace ingestion (`src/ingest/`).
- **Enforcement (real)**: exactly three interception points — gateway/egress (signed revocable lease tokens, budgets, redaction, host allowlist), bridge (model allowlists, route gating, receipts), and hook control for two CLIs. The other ~58 `src/enforce` modules are evaluation/simulation over config + ledger.
- **Trust plane**: hash-chained SQLite evidence ledger (2,366-line `ledger.ts`, 11+ tables, integrity-verifiable); Ed25519 role keys; canonical-JSON signing of targets/adapters/policies/plugins/leases; receipts + receipt chains; transparency log; notary; Merkle/zk commands.
- **Scoring**: ~246-question diagnostic bank, quickscore/rapid variants, evidence-assisted auto-answering, ~100 scoring dimension modules, evidence-tier weighting (OBSERVED > self-reported), L4/L5 requiring OBSERVED + Merkle anchoring.
- **Extensibility**: 15 declarative adapters (zod-validated definitions — env strategy, command templates, detection rules); signed declarative plugin packs (policy/assurance/compliance/adapters/templates) with registry client+server and SSE — **no code plugins by design today**.
- **Surfaces**: Studio/Console/Dashboard (server-rendered static HTML, no SPA framework), MCP *server* (`amc mcp serve`), VS Code extension, GitHub Action, Vercel API, website.
- **Shield/Watch/Comply**: prompt-injection detector/sanitizer, MCP security analyzer + trust ledger, agent-config scanner, ~50 drift/behavior monitors, SIEM exporter, compliance maps, assurance packs, red-team runner (synthetic response engine — not live).
- **Fix pipelines**: `amc fix` (quickscore → explain → write guardrail blocks into agent instruction files → sealed receipt) and `src/mechanic` (gap analysis → upgrade planner → fix plans → execution engine with approvals). Caveat found in deep read: `amc fix`'s non-interactive default scores an *empty* rapid quiz — a fresh-agent baseline, not a measurement.
- **Approvals**: dual-control HITL subsystem — approval engine, hash-chained approval store, quorum policies, Slack/webhook delivery, one-shot consumption with replay protection. Richer than dsh's one-shot approval seam in governance terms; not wired to any model tool-call site.
- **Enterprise/multi-tenant**: host mode (`src/workspaces/workspaceRouter.ts`, 1,792 lines) — local users + OIDC + SAML + SCIM, RBAC roles, CSRF-protected sessions, host audit log, per-workspace studio servers under `/w/<id>/…`. **dsh has none of this** (its web server refuses non-loopback binds outright).
- **Instrumentation**: `sdk/autoInstrument.ts` monkey-patches 9 LLM client libraries; `sdk/python` (subprocess façade with gateway env injection); `platform/python` (~190-module parallel Python library with its own FastAPI app — explicitly non-canonical); pytest plugin; `examples/` with 14 framework integrations.
- **Also present** (deep-read additions): `governor` (signed action policies, canary rollout, emergency override), `incidents` + `corrections` + calibration (the stale 2026-02 roadmap's P0 items — already built), `steer` (~3k-line thermostat CLI), `forecast`, `experiments`, `federation` (signed bundles), `mirofish` (synthetic market simulator), `value`/`cgx`/`prompt` policy subsystems, release-gate receipts (13-step, wired into prepack), architecture-boundaries ratchet (shrinking line budgets on the two megafiles), docs-drift check.

### 3.2 Verified absences (grep-backed, refined by deep read)

No **agent loop** (no plan/act/tool-iterate anywhere); no **model-facing** tool pipeline (toolhub's executors are operator/hook-facing and loop-less); no LLM streaming client (pass-through proxy + LLM-as-judge fetch only; the judge base engine is a hard-coded mock that `ProductionLLMJudgeEngine` overrides); no PTY (`node-pty` absent); no hot reload (zero fs-watch hits in `src/`); no code-executing plugin system (signed *content-only* packs by design); no OTLP receiver (export only); no kernel sandbox (Docker-args wrapper that degrades when Docker is absent); red-team **and assurance-pack** execution are synthetic (`syntheticResponse()` — no model is ever called, yet compliance mappings consume those scores as evidence); no session/conversation concept (the ledger records audit events, not derivable model history); no SPA (static HTML consoles); no TS SDK; no linter; coverage thresholds all 0.

### 3.3 Repo-health flags that gate this plan

1. **P0 unshipped release, root-caused**: npm is at 1.1.1 while local main is 90 commits ahead; **33 pending changesets (Jul 10–13) were never versioned** — the Changesets automation is stalled (likely unconfigured `NPM_TOKEN`/`CHANGESETS_GITHUB_TOKEN` secrets or a failing workflow). Shipping precedes everything (Phase 0).
2. **Security follow-up owed**: a supply-chain scan (accidentally written to files named `--json`/`--verbose`) reported FAIL with 8 HIGH findings incl. `ANTHROPIC_TOKEN_HINT`, immediately followed by **three BFG history-rewrite runs on 2026-02-23** — no in-repo evidence that flagged keys were rotated. Also: plaintext demo vault passphrase on disk, default passphrases in both Dockerfiles, `AMC_NO_SIGN` escape hatch, unsigned `amc.config.yaml` controlling `trustBoundaryMode`, filesystem-writable key-history as trust root.
3. **Public-repo hygiene**: tracked competitive intel (`COMPETITIVE_*_G0DM0D3.md`, `.tmp-gap-report.json` — `.gitignore` guards the wrong filename), `test_model.pkl` fake-malware fixture, `mirofish-simulation/` **fabricated practitioner testimonials** (reputational risk for an evidence-integrity product), three release tarballs, `..bfg-report/`, dead `cli-new-commands.ts.fragment`, empty `security-audit/` husks, embedded `qa/` sub-project with own lockfile, OpenClaw persona stack (whose `HEARTBEAT.md` monitors a personal crypto bot) sitting in the worktree.
4. **`src/cli.ts` at 24,395 lines**, `studioServer.ts` at ~333KB, 151 top-level `src/` dirs — though an **architecture-boundaries ratchet already enforces shrinking budgets** on the two megafiles, which is the right lever to keep pulling.
5. **Quality gates unenforced**: coverage thresholds 0; `lint` aliases `typecheck`; Playwright e2e unwired in CI (`@playwright/test` not even a devDependency); several QA harnesses (persona QA, 8-agent dogfood, swarm testers, incident-readiness) run only by hand.
6. **Number drift is systemic**: tests (README badge 8,604 vs ~4.2k `it()` blocks in 1,118 files vs qa/'s claimed 5,031), questions (126/240/244/264 across CLI strings, bank version, README), assurance packs (README 142 vs 153 files), five-dimension taxonomy differs between whitepaper and code. Three scorers disagree (CLI evidence scorer, `api/index.ts` prefix heuristic, Python platform demo).
7. **Duplication debt to consolidate during migration**: five fix systems (oneClickFix, mechanic, doctorFix, agentFixPlan, fixerRca), three "run-under-observation" generations (`wrap`/`supervise`/`adapters run`), three redaction engines, two benchmark subsystems, two red-team engines, two GitHub Actions, three distribution channels (signed plugins / unsigned `packs` / marketplace), 10+ SQLite files in three creation idioms, 1.0GB npm cache inside `.amc/`.
8. **The vault** (`/Users/sid/Documents/AMC`) is 3+ weeks past every `review_after`; `plans/` was empty until this document.

---

## 4. What AMC has that dsh lacks — the moat inventory

These are keep-and-integrate assets. None exist in dsh in any form:

| # | AMC asset | dsh status | Disposition in plan |
|---|---|---|---|
| M1 | L0–L5 maturity model, ~100 scoring dimensions, 246-question bank, evidence-tier weighting | Absent | Becomes a live scoring plugin over harness events (Phase 5) |
| M2 | Hash-chained, integrity-verifiable evidence ledger | Session log is append-only but unsigned, unchained | Unify: session events land in the signed ledger (Phase 2) |
| M3 | Ed25519 signing of configs/policies/plugins/leases; receipts (receipt *chains* are currently in-memory-only — REPLACE with persistent records in P2.0) | No signing anywhere | Sign session checkpoints + plugin packages (Phases 2, 9) |
| M4 | Transparency log, notary, Merkle anchoring (zk commands are placeholder crypto — replace with an audited library or drop the claim, P2.0) | Absent | Anchor session-log Merkle roots (Phases 2, 10) |
| M5 | LLM gateway + egress proxy: leases, budgets, redaction, host allowlist | No egress control at all; `web_fetch` caps only | Recast as in-loop policy + keep proxy for foreign agents (Phase 5) |
| M6 | Budget engine (spend/rate) | Token meter measures, never enforces | Budget guard in pre-execute + request path (Phase 5) |
| M7 | Prompt-injection detection/sanitization (Shield) | Absent (context escaping only) | Post-execute + context-ingestion filters (Phase 5) |
| M8 | MCP server *security analyzer* + trust ledger | MCP client trusts what it mounts | Gate MCP client mounts through the analyzer (Phase 6) |
| M9 | Compliance maps, assurance packs, audit surfaces (Comply) | Absent | Compile compliance evidence directly from session logs (Phase 10) |
| M10 | Fleet: multi-agent registry, paths, governance | Workspace = local dirs only | Fleet = multi-harness control plane (Phase 10) |
| M11 | Passport: portable signed trust claims | Absent | Auto-issued from harness-native evidence (Phase 10) |
| M12 | Watch: ~50 drift/behavior monitors + SIEM export | Invariant checkers (dev-only) | Monitors subscribe to live session events (Phase 5) |
| M13 | Red-team scenario corpus + attack strategies | Absent | Re-run live against the real loop via SDK (Phase 10) |
| M14 | Signed declarative plugin registry (client/server/SSE) | `dsh plugin add` = raw npm/git, zero trust model | Extend to signed *code* plugins — beat dsh (Phase 9) |
| M15 | `amc fix` / mechanic auto-remediation with receipts | Absent | Fix targets include harness composition itself (Phase 10) |
| M16 | Adapter capability/lossiness matrix for 15 foreign CLIs | Subagent providers for 2 (Codex, Claude Code) | Foreign-agent observation stays; harness adds native execution (kept) |
| M17 | GitHub Action, VS Code extension, Vercel API, hosted score | None (local web only) | Kept; SDK feeds them (Phase 7) |
| M18 | Eval subsystem with LLM-as-judge + datasets | Benchmark doc = "use the Python SDK" | Eval harness drives the native loop (Phase 10) |
| M19 | Enterprise auth & multi-tenancy: OIDC/SAML/SCIM, RBAC, CSRF sessions, host audit, per-workspace isolation | Web server refuses non-loopback binds; "no TLS/auth" confessed | Harness web surface inherits host auth day one (Phases 7, 10) |
| M20 | Dual-control approvals: quorum policies, hash-chained store, Slack/webhook delivery, replay-protected consumption | One-shot approvals, no grant store | Approval seam wired in P3.3; becomes the answerer behind the tool-pipeline `ask` path in P4.1 |
| M21 | Toolhub: signed action-policy-gated fs/git/http/process executors with blast-radius consent | Tools exist but only inside the loop | Seed executors for the harness tool pipeline (Phase 4) |
| M22 | Runtime firewall: signed rule policy, observe/warn/enforce modes, decision receipts | No content firewall anywhere | Becomes a `pre-execute`/`post-execute` + LLM-stream guard plugin (Phase 5) |
| M23 | Release-gate receipts (13-step signed gate wired into prepack) + architecture-boundaries ratchet + docs-drift check | Gate DAG exists but produces no signed evidence | Merge: dsh-style gate DAG *emitting AMC-style receipts* (Phase 8) |
| M24 | Incident/correction/claims lifecycle models with causal links | Absent | Incidents auto-assembled from harness session events (Phase 10) |

The strategic read: **dsh built the engine and skipped the trust plane; AMC built the trust plane and skipped the engine.** Neither side's asset is quick to replicate — which is exactly why the merged system is defensible. The deep read also confirms AMC's own competitive analysis (G0DM0D3, Apr 2026): *"The gap isn't features — it's rigor."* The harness program is also the rigor program: a real execution loop makes the synthetic parts of AMC (assurance runs, red-team, simulator effect bands, the `amc fix` empty-quiz baseline) honest for the first time.
---

## 5. Exhaustive gap matrix

Legend — **Sev**: ■■■ foundational (blocks other work) · ■■ major product gap · ■ polish/parity. **Phase**: where §7 closes it. "AMC today" reflects verified state at `f419839a`.

### D1 · Composition kernel & plugin runtime  (Sev ■■■ · Phase 1)

| Capability | dsh mechanism | AMC today |
|---|---|---|
| Runtime plugin model | Cordis fibers: PENDING→LOADING→ACTIVE→UNLOADING→DISPOSED/FAILED; function/object/Service plugin forms | None; static imports, commander registry |
| Effect tracking / auto-teardown | Every registration is an effect with a tracked inverse; `ctx.effect()` for unmanaged resources; LIFO disposal, cascade to children | Manual lifecycle; process restart is the only teardown |
| Service injection (coeffects) | `inject: ['name']` gates activation; provider unload restarts dependents; optional deps via `ctx.get()` | Direct imports |
| Per-fiber failure containment | Failed plugin leaves siblings running; fail-loud boot audit names unresolved services | Any module failure = process failure |
| Hot module replacement | Transactional: classify changed modules → dispose+reinstantiate stale entries → cache backup/restore on failure; no half-reloaded state | Absent (0 fs-watch hits) |
| Isolation realms | `isolate:` per-group service realms; same key, different instances (multi-tenant/testing) | Absent |
| Interception | Right-biased policy metadata on bindings — runtime policy without reload (capability security, §6.3 of paper) | Absent |
| Scoped registries | Per-agent scopes: registration visibility down, events up; branded `Scoped<T>` dispatch targets | Absent |
| Typed event bus | 4 dispatch modes (emit/bail/serial/waterfall) with declaration-merged types | Ad-hoc EventEmitters + SSE |
| Runtime type registry | typert: TS→type-graph generator, zod emission, `@Remote` RPC decorators | zod schemas only, hand-wired |

### D2 · Configuration & boot  (Sev ■■■ · Phase 1)

| Capability | dsh | AMC today |
|---|---|---|
| Declarative composition | `cordis.yml` entry tree: `id`, `disabled`, groups, `isolate`, `!!js` lazy expressions | YAML configs per subsystem, no composition semantics |
| Config reconciliation | id-diff → per-field least-disruptive action (rebuild/realm-move/in-place/unload) | Restart |
| Profiles & bundles | Profile = ordered patch layers over empty root; bundle = npm pkg with `dsh.bundle.patch`; platform gating via `!!js disabled` rows | `.amc/` workspace configs; no layering |
| Config provenance | `--dump-config` with per-value provenance comments; offline == what boots | Absent |
| Schema-validated plugin config | Schemastery per-plugin `Config`, fail-loud | zod on asset packs only |
| Env layering | Source-tracked env layers, bootstrap-var rejection, omission-is-refusal | Ad-hoc `process.env` |
| Live settings | Namespaced settings service: schema defaults → base → user layer; file watcher; comment-preserving YAML leaf-diffs; secret-role redaction with path-op writes; optimistic `expectedRevision` | Static YAML + signing (signing is AMC-ahead) |

### D3 · Session & state  (Sev ■■■ · Phase 2)

| Capability | dsh | AMC today |
|---|---|---|
| Event-sourced session log | Append-only typed events; derived LLM history; `surfaceOp` append/replace; `sourceEventSeqs` provenance; `ignorable` forward-compat | Evidence ledger rows (different shape: audit events, not conversation) |
| Request reconstructability | `request/header` snapshots; "model-visible ⟺ logged" runtime-asserted | Gateway logs requests it proxies; nothing loop-native |
| Crash recovery | Synthetic `turn/end {interrupted}` + `TOOL_OUTCOME_UNKNOWN` with verify-side-effects guidance; never truncate | N/A (no sessions) |
| Persistence seam | JSONL (zstd, packed chunk runs ~60% smaller, atomic) + SQLite (WAL, packed rows) behind one contract + shared conformance suite | better-sqlite3 ledger only |
| Checkpoint policy | Flush before model dispatch, before tool side effects, at pre-step | N/A |
| Projections | Pure fold registry; `Object.is` change gating; stale-never-wrong caches keyed by `stateVersion` | Ad-hoc SQL queries |
| Session query | FTS5 search, traces, lineage; exposed as authorized model tools; `/export` ZIP | SQL over ledger (operator-facing only) |
| Fork/resume | `seed` + `seedLength` + boundary event; lineage headers (`parentSession`, `delegationDepth`) | N/A |
| Workspace model | Durable workspace entities grouping sessions by realpath | `.amc` per-project dirs (partial) |
| Spill | Oversized tool output → session-scoped 0600 files + preview + opaque locator + retrieval hint | N/A |
| Signed/verifiable log | **Absent in dsh** | Hash-chained + signed ledger — AMC-ahead, must absorb session events |

### D4 · LLM integration  (Sev ■■■ · Phase 3)

| Capability | dsh | AMC today |
|---|---|---|
| Adapter seam | Route registry; StreamChunk contract; BlockAssembler; deep-frozen requests; `prepareCall` pins adapter across HMR | Reverse proxy (pass-through); LLM-as-judge fetch in eval only |
| Providers | DeepSeek native SSE; pi-ai: Anthropic/OpenAI/Bedrock/Vertex/Azure/custom gateways; per-model compat knobs; vision modalities | Proxy route prefixes to upstreams |
| Retry | Turn-boundary retry via `agent/request-error`; durable retry events + invariant | Gateway-level HTTP retry only |
| Token accounting | Token meter, context-pressure/breakdown projections, cache-hit stats | Usage rows in bridge ledger |
| Model discovery | Endpoint interrogation with one-shot credential | Static model taxonomy (signed — AMC-ahead on integrity) |
| Reasoning controls | `reasoningEffort`, thinking on/off, per-purpose overrides (title calls force thinking off) | N/A |
| Stream watchdogs | `streamIdleTimeoutMs`, cancelled-stream prefix finalization (`interrupted: true`) | N/A |

### D5 · Agent loop & interaction  (Sev ■■■ · Phase 3)

| Capability | dsh | AMC today |
|---|---|---|
| Turn/step loop | Inbox-claimed turns; steps = request + tool calls; bounded rolling tool pool; `turn/end` reasons | **No loop** |
| Input modes | followup / steer / inject over one `send`; queue with edit/steer gestures | N/A |
| Cancellation | `cancel(cause, {keepInbox})`; cooperative tool cancellation, typed causes | Process kill |
| System prompt assembly | Ordered sections registry (identity −100 … tool guidance 100–199), persona templates, `toolOrder`, fail-loud `{{var}}` rendering | Guardrail text blocks written into *foreign* agents' instruction files |
| Approval seam | 4-value fail-closed outcome; audit pair enclosed in turn; per-session `ask`/`never` policy folded from log | Approvals exist for mechanic/leases (operator-facing), not tool-call-time |
| User questions | Structured Q&A tool with options/multi-select/plan-review intent | N/A |
| Slash commands | Host-side registry, logged `command/run`, never enter model history | REPL commands (operator) |
| Context plugins | AGENTS.md/CLAUDE.md instruction loading (budgeted, SHA-digested, resume-safe), time-context, file/session references (`@path`, `@session`) | AMC *writes* CLAUDE.md guardrails; never consumes |

### D6 · Tool system  (Sev ■■■ · Phase 4)

| Capability | dsh | AMC today |
|---|---|---|
| Tool registry | Scoped registration/shadowing; allow/deny `restrict()` masks; `defineTool()` schema DSL; per-call concurrency-safety classification | None (toolhub has fixed executors, no registry) |
| Execution pipeline | pre-execute waterfall → monotonic guards → approval → execute wrapper → post-execute → finalizeContent → result observers; frozen args; nested-call tokens | Partial precedent: toolhub gates fs/git/http/process executors behind signed action-policy + blast-radius consent + approval consumption — operator/hook-facing, no loop, no waterfall/guard model |
| Code Mode | `run_code` transport; per-scope generated TS/Python SDK; sub-calls re-enter pipeline; hostile-peer worker (dual budgets, captured intrinsics) | None |
| Built-in tools (24+) | bash/pwsh (one-shot + persistent), read/write/edit/read_image, str_replace_editor, glob/grep (ripgrep, spill-over-cap), terminal_* (6), lsp, web_search/web_fetch, todo_write, exit_plan_mode, goal tools, schedule tools, session-query tools, skill, subagent/send_message/interrupt/list/report, job_*, workflow, ralph, ask_user_question, cordis_* self-modification | None |
| Result contract | Orthogonal outcome fields (exitCode AND timedOut); nonzero exit = model fact, never isError; canonical value vs rendered content split; UI render-intent cards | N/A |
| Tool timeouts | Declarative `timeoutMs` + cooperative timeout-policy guard (structured `TOOL_TIMEOUT`) | N/A |

### D7 · Execution substrate  (Sev ■■■ · Phase 4)

| Capability | dsh | AMC today |
|---|---|---|
| Subprocess seam | Explicit spawn specs; detached groups; SIGTERM→grace→SIGKILL tree termination; per-stream dispositions; offset-based non-consuming readers; tail-keep + spill; credential scrub; sync exit-listener force-kill | `child_process.spawn` in monitor wrapper |
| PTY | node-pty; readiness-evidence ladder (OSC 133 prompt marks, foreground-group proof, bounded silence); owner-scoped sessions | Absent |
| Background jobs | Owner-fenced registry; `<kind>-N` ids; first-wins settlement; completion notices with bounded wake budgets | Absent |
| LSP | 4-op seam, generic stdio host, single-flight per (server, workspace), read-only | Absent |
| Managed env channel | `DSH_*` contributor registry; scrub-ambient-then-merge prevents nested-harness leakage | Env assembler for foreign agents (adjacent) |

### D8 · Sandboxing & OS security  (Sev ■■■ · Phase 4)

| Capability | dsh | AMC today |
|---|---|---|
| Kernel sandboxing | bwrap → Landlock (own C launcher, exit-125 contract, per-arch npm pkgs) → Seatbelt SBPL → Windows restricted-token ACL; functional probes, cached | `docker run` args wrapper; degrades silently when Docker absent |
| Policy model | Per-call `SandboxExecutionPolicy`; mode fold from session log; fail-closed `SANDBOX_UNAVAILABLE`; enforcement full/partial reported | Config-level |
| Denial attribution | Backend-specific `denialSignatures` + `RunnerFailureRule` (exit-code ∧ exact-line) — never blame the command for broken infra | N/A |
| Escalation protocol | Denial marker → same-turn retry with `sandbox_permissions`+`justification` → strict-widening check → human approval; one-shot grants | N/A |
| Remote execution world | E2B provider swap relocates bash/PTY/LSP wholesale | Absent |
| Egress control | **Absent in dsh** | Egress proxy deny-by-default — AMC-ahead; must become in-loop `web_*`/subprocess policy too |

### D9 · Permissions, approvals & credentials  (Sev ■■ · credentials P3.0, approval seam P3.3, `ask`-wiring P4.1)

| Capability | dsh | AMC today |
|---|---|---|
| Tool-call approvals | One-shot, fail-closed, audit-paired, composer takeover UI | Approvals subsystem is *richer in governance* (quorum, hash-chained store, Slack/webhook delivery, replay-protected consumption) but wired to mechanic/plugin/toolhub flows, not model tool calls |
| Permission presets | Named sandbox+approval bundles; `/permission` command; risk-acknowledged defaults | Policy packs + signed action-policy/tools.yaml (declarative; enforced only at toolhub/gateway) |
| Credentials | References-not-values config; layered store (`.credentials.yaml` 0600, watched, comment-preserving); per-op re-resolution = restart-free rotation; shadowed-write rejection | Keys in gateway config; leases sign access — different, complementary |
| Loop-hygiene guards | repeat-tool-reminder (canonicalized-args chains, escalating reminders); timeout policy | Watchdog concepts in enforce (advisory) |
| Grant store / allow-always | **Absent in dsh (confessed)** | Signed approval policies exist → extend to durable grants (beat-dsh, Phase 10) |

### D10 · Context management  (Sev ■■ · Phase 4–6)

| Capability | dsh | AMC today |
|---|---|---|
| Compaction | Pressure-triggered at pre-step (0.8 threshold); deterministic tool-result pruner first; LLM summary rides `surfaceOp: replace`; lock-as-log-events; overflow-recovery retries | N/A |
| Skills | Layered providers, six-rank root priority, digest-driven durable catalog, frontmatter invocation policy | Learn docs (declarative packs) |
| Presets/persona | `agent.cordis.yml` per-session composition; generation-stamped standing mounts | Archetypes (scoring-side) |
| Instruction files | AGENTS.md/CLAUDE.md budgeted loading with dedup + touch-driven rediscovery | Writes them, never reads |
| Attachments | Content-addressed image store, full-decode admission, dimension caps | N/A |

### D11 · Orchestration  (Sev ■■ · Phase 6)

| Capability | dsh | AMC today |
|---|---|---|
| Subagents | spawn/fork in-process; ACP, Codex, Claude-Code, peer-SDK providers; continuable children (inbox-only mailbox, settlement notices, ancestor-verified interrupt); `maxDepth` durable | Adapter runner spawns foreign CLIs for observation (no delegation semantics) |
| Workflow engine | Model-written scripts; worker-thread vm; `agent/parallel/pipeline/phase/log`; force-settle cancellation | N/A |
| Autonomy drivers | ralph loop; goal rounds (armed, capacity-bounded, human-yielding); schedules (≥300s, DST-aware, at-least-once) | N/A |
| Hooks compat | Claude Code + Codex `hooks.json` consumed onto native waterfalls | AMC *produces* CC/Gemini hooks (inverse direction — keep both) |
| MCP | Client bridge (reconnect budgets, collision-hashed names, image gating) | Server only + security analyzer (analyzer is AMC-ahead) |
| ACP | Automation server (JSON-RPC stdio) | Absent |
| Agent teams | Experimental: durable roster, CAS task DAG, mailbox | Fleet registry (different layer — governance not execution) |

### D12 · Web UI & client architecture  (Sev ■■ · Phase 7)

| Capability | dsh | AMC today |
|---|---|---|
| SPA | React + slot system (register = declaration + authorization); React-free runtime layer; notifier tiering (gesture/microtask/frame) | Static server-rendered HTML pages (~40) |
| Streaming chat | Per-frame materialization, think rows, compaction fold rows, queue dock, steering bubbles | N/A |
| Live state | Generic projection push channel (`asOfSeq`, higher-seq-wins) | SSE for studio state |
| Approval UX | Composer takeover (question card / ApprovalPanel), `pendingInteraction` classification | N/A |
| Security | Host-header trust fence (DNS-rebinding), loopback-pinned privileged methods, 415 CSRF; **no auth/TLS at all** (0.0.0.0 refused) | CORS + CIDR allowlists + rate limiters + admin tokens + RBAC sessions + **OIDC/SAML/SCIM** host auth — AMC-ahead on authn/authz; behind on rebinding fence |
| Client HMR | SSE per-plugin hot reload with DI-epoch cascade | N/A |
| i18n | zh/en with hash-verified pairing | English only |

### D13 · APIs, SDKs & distribution  (Sev ■■ · Phase 7)

| Capability | dsh | AMC today |
|---|---|---|
| Wire protocol | NDJSON JSON-RPC 2.0; enqueue-receipt + idle-boundary run semantics | REST-ish local HTTP servers |
| TS SDK | `DeepSeekHarness` high-level + `HarnessClient`; teardown ladder; typed errors | `sdk/autoInstrument.ts` monkey-patches 9 LLM clients (instrumentation, not control) |
| Python SDK | pip package + platform wheels carrying single-exe Node runtime ("no system Node.js"); manifest-as-distribution | `sdk/python` subprocess façade (score/fix/gateway-env, silent-fail-to-L0) + `platform/python` parallel 190-module library (non-canonical) + pytest plugin |
| Headless mode | `dsh --profile headless "task"` exit 0/1 | `amc adapters run` (observes foreign agent) |
| Typed RPC | typert `@Remote` decorators, generated codecs, forwarded-event allowlist | Hand-rolled JSON endpoints |
| Packaging | Profile bundles via `dsh.bundle` manifest; `dsh plugin add` any pnpm spec | Signed declarative packs + registry (trust model is AMC-ahead) |

### D14 · Observability & diagnostics  (Sev ■■ · Phases 2, 5)

| Capability | dsh | AMC today |
|---|---|---|
| Runtime invariants | `ctx.invariants` + per-package `./invariant` companions (session enclosure, FIFO, prompt reconstruction, approval pairing) | Ledger integrity verification (complementary) |
| Telemetry | OTel logs, FULL/FEEDBACK_ONLY/DISABLED, consent-gated release of stored prefixes, anonymous id | OTel export + SIEM exporter (AMC-ahead on SIEM) |
| Session stats | TTFT, tok/s, cache-hit, billed tokens projections | Usage tables |
| Postmortems | 4 bilingual, feeding standing rules | Docs exist; no postmortem discipline |

### D15 · Engineering system  (Sev ■■■ · Phase 8, starts Phase 0)

| Capability | dsh | AMC today |
|---|---|---|
| Coverage | Per-file 100% thresholds; partitioned instrumented runs; exempt-with-invariant list; exact miss locations reporter | Thresholds all 0 (collected, never enforced) |
| Lint | oxlint type-aware (321-line config) + lint-contract tests; jscpd; knip; publint | None (lint == typecheck; tests never typechecked standalone) |
| Gate runner | `run-gates.ts` DAG scheduler (needs/after/allowFailure), 9 CI aggregates, portable across CI hosts | `release-gate.mjs` — 13-step sequential gate **emitting signed receipts** (AMC-ahead on evidence, behind on DAG/parallelism); architecture-boundaries ratchet + docs-drift check (AMC-ahead concepts) |
| Snapshot testing | Session-log-as-fixture keyless replay; record/refresh modes; override sidecars; mock LLM fault server | Policy-fixture regression (adjacent, narrower) |
| Doc gates | doc-typecheck of md fences; generated catalogs with `--check` twins; md-wrap/links/anchors; word-budget ratchet; type-equiv manifests | 290 hand-maintained docs, no gates |
| Windows | Wine-based required signal + native observational + self-hosted failover drills | Node-matrix Linux/mac only |
| Issue automation | Policy bot (trusted default-branch checkout, App token) | Basic workflows |

### D16 · Self-development system  (Sev ■■ · Phase 8)

| Capability | dsh | AMC today |
|---|---|---|
| ADR corpus | `.agents/notes`: 724 notes in proposed/implemented/rejected/archived lifecycle; format machine-gated; mandatory Alternatives; sealed hash-manifest archive | Obsidian vault (rich but external, unverified 3 weeks) |
| Repo skills | 11 gated skills (code-review, pre-push evidence selection, CoT-leakage trimming with recall batteries, doc standards, GIF-as-evidence) | None in-repo |
| Standing orders | Tiered AGENTS.md files, conventions mechanized by ~30 verify-* gates | CLAUDE.md-level docs |
| Self-modification | `tool-cordis`: agent defines/runs/stops plugins in its own live runtime (`demo:cordis`) | mechanic edits configs, never runtime |

### Gap totals

Foundational (■■■) domains: D1–D8, D15 — none can be skipped; D1→D3→D5→D6 is the critical path. Major (■■): D9–D14, D16. AMC-ahead items appear in 9 of 16 domains — the moat is real but thin outside the trust plane. Every capability in this matrix maps to a §7 step (the adversarial review's first pass found eight orphans — Code Mode, LSP, credentials, live settings, typert, ACP server, consent-gated telemetry, Windows CI — now closed by steps P4.5, P4.3, P3.0, P1.2, P7.1a, P7.1a, P7.3, and P8.1 respectively); any row a future edit adds must add or cite a step.
---

## 6. Architecture decisions (ADRs)

These are the load-bearing choices. Each records the decision, the alternatives it beat, and the consequence — the format is deliberately borrowed from dsh's `.agents/notes` discipline, which AMC should adopt (ADR-10).

### ADR-1 — Adopt Cordis as the composition kernel (vendored), do not reimplement

**Decision.** Vendor the Cordis framework (`@cordisjs/*`, MIT) into `vendor/`, rescoped to `@amc/*`, exactly as dsh vendors it under `@deepseek-ai/*`. Build AMC's runtime as Cordis plugins. The maturity/trust plane goes *on top* as plugins, never underneath.

**Alternatives considered.** (a) *Reimplement effect tracking + reactive DI in AMC* — rejected: the paper's metatheory (confluence, preservation, progress) is 88 pages of proof we would be reproducing by hand; Koishi's 4,000-plugin ecosystem is the validation we would be forgoing; getting inverse-tracking subtly wrong reintroduces exactly the teardown bugs the model eliminates. (b) *Use a generic DI/plugin lib (InversifyJS, Awilix, a bus)* — rejected: none give revertible effects or reactive re-resolution, so HMR and safe hot-swap (the whole point) don't fall out. (c) *Skip a kernel, keep commander + static imports* — rejected: it is the current state and it structurally cannot hot-reload or contain per-plugin failure.

**Consequence.** AMC inherits the fiber lifecycle, loader, HMR, and capability-seam pattern for free, and can consume dsh's own plugins where licensing allows. Cost: a real learning curve and a vendoring/rescope discipline (ADR-9). This is the single highest-leverage decision in the plan.

### ADR-2 — Strangler-fig migration, never a big-bang rewrite

**Decision.** The existing `amc` CLI and all 8 surfaces keep working throughout. A new composed runtime grows beside them behind `amc agent` / `amc up` v2. Existing subsystems are wrapped as Cordis services first (thin adapters over today's code), then decomposed opportunistically. No subsystem is deleted until its replacement passes the same tests plus new ones.

**Alternatives considered.** (a) *Fork and rewrite clean* — rejected: 482K lines and the entire trust-plane moat would be stranded; the product would stop shipping for months; the moat (signed ledger, scoring, compliance) is the reason to do this at all. (b) *Bolt a loop onto the monolith without a kernel* — rejected: reproduces dsh's abandoned pre-Cordis state; no path to HMR/composition.

**Consequence.** Every phase ends shippable. Migration is measured by "surface X now runs as a plugin over the kernel," not "lines rewritten." The two megafiles (`cli.ts`, `studioServer.ts`) shrink under the existing architecture-boundaries ratchet as commands move into plugins.

### ADR-3 — One evidence spine: the session log IS the signed ledger

**Decision.** Unify dsh's event-sourced session log with AMC's hash-chained signed ledger into a single append-only, Ed25519-signed, hash-chained, Merkle-anchored event store. Session events (`turn/*`, `step/*`, `tool/call`, `assistant/chunk`, `approval/*`, `sandbox/mode`) are evidence events. "Model-visible ⟺ logged" (dsh) and "logged ⟺ signed & provable" (AMC) become one invariant.

**Alternatives considered.** (a) *Two parallel logs (dsh session JSONL + AMC ledger) with a sync bridge* — rejected: two sources of truth drift; the reconstructability guarantee and the integrity guarantee must hold over the *same* bytes or neither is trustworthy; AMC already suffers from a parallel `guard_events.sqlite` that undercuts its own single-ledger narrative. (b) *Keep JSONL primary, sign it after the fact* — rejected: post-hoc signing can't prove ordering or non-removal the way an in-transaction hash chain can.

**Consequence.** Scoring, compliance, passports, and audits read the *same* stream the agent runs on — so a score is a live function of real behavior, and L4/L5 OBSERVED evidence is generated natively instead of imported. This is the feature no competitor (dsh included) can match. Cost: the persistence seam must satisfy both dsh's conformance suite and AMC's integrity verifier; blob spill and packed-chunk compression must be integrity-preserving. **Consolidate the 10+ scattered SQLite files onto the pooled store as part of this** (fold `guard_events` into the ledger).

### ADR-4 — Enforcement moves inline; `enforce/*` stops being advisory

**Decision.** The tool-execution pipeline's `pre-execute` waterfall + monotonic guards + `post-execute` become the home for AMC's real controls. The runtime firewall (`src/runtime/firewall.ts`), leases, budgets, taint/DSL evaluators, and prompt-injection detectors register as guards/answerers. The approvals subsystem becomes the `ask`-path answerer. What was "advisory scoring over the ledger" becomes "deny/allow at the call site, recorded as evidence."

**Alternatives considered.** (a) *Keep enforcement in the proxies only* — rejected: the gateway/egress proxy sees LLM traffic but not tool calls, file writes, or subprocess spawns; the loop is where those originate. (b) *Leave enforce/* advisory, add a separate new guard layer* — rejected: doubles the policy surface and the drift AMC already has across four regex prompt-injection implementations.

**Consequence.** AMC's differentiator (governed execution) becomes literally true. Consolidate the four overlapping prompt-injection matchers into one guard. Cost: fail-closed correctness matters now — a buggy guard blocks real work — so guards need dsh's monotonicity discipline (can only deny) and heavy tests.

### ADR-5 — Governed by default: the harness ships secure-by-default where dsh ships open

**Decision.** AMC's harness defaults invert dsh's confessed gaps: web surface requires auth (host OIDC/SAML/SCIM + RBAC already exist) and supports TLS; approvals support durable allow-always grant stores (signed); session logs are signed and optionally encrypted; plugins must be signed to load (AMC already does this for content packs — extend to code plugins); sandbox is fail-closed. Where dsh says "out of scope for now," AMC says "on by default, off by flag."

**Alternatives considered.** (a) *Match dsh's local-first-only posture* — rejected: throws away AMC's enterprise moat (the one thing dsh explicitly has none of) and its whole "trust" positioning. (b) *Security as a paid add-on* — rejected: contradicts "evidence over claims" and open-source positioning.

**Consequence.** "The governed agent harness" is a defensible one-liner dsh cannot copy without building AMC's trust plane. Cost: secure defaults add friction; mitigate with a `--dev`/demo profile (which AMC already has via `amc up --demo`). **Rollback discipline:** the demo/dev profile may flip a default from enforce→observe, but only via composition and only recorded as an explicit ADR-5 exception note — a rollback state never silently becomes the shipped default (this is why every enforcing step's Rollback line is phrased that way).

### ADR-6 — Native execution first; keep foreign-agent observation as a distinct product line

**Decision.** Build a real agent loop, tool pipeline, and sandbox (dsh-class). Simultaneously *keep* AMC's unique ability to observe foreign agents (Claude Code, Gemini, 15 adapters, gateway proxy, hooks). These are two capture modes into the same evidence spine: **native** (AMC runs the agent, richest evidence) and **observed** (AMC watches someone else's agent). Reconcile the three legacy observation generations (`wrap`/`supervise`/`adapters run`) into one.

**Alternatives considered.** (a) *Only build native, drop observation* — rejected: foreign-agent observation is a real moat and the only thing that works for teams who won't switch harnesses. (b) *Only observe, never run* — rejected: it's the current state; observation can't reach L4/L5 OBSERVED_HARDENED evidence the way native execution can, and can't make assurance/red-team real.

**Consequence.** AMC becomes the only tool that scores both "agents you run here" and "agents you run elsewhere" on one maturity scale with one evidence format. Passport/Fleet/Comply span both.

### ADR-7 — Make the synthetic real (the rigor mandate)

**Decision.** Every place AMC currently fakes execution gets wired to the real loop: assurance packs run against a real target agent (native or observed) instead of `syntheticResponse()`; red-team drives real models; the LLM-judge lane writes results into the ledger as evidence; the mechanic simulator's invented effect bands are either replaced with measured deltas or explicitly relabeled heuristic; `amc fix` scores real evidence, not an empty quiz.

**Alternatives considered.** (a) *Leave synthetic, document it louder* — rejected: AMC's own G0DM0D3 analysis names rigor as the #1 weakness; a compliance product consuming synthetic scores as evidence is an integrity contradiction. (b) *Delete the synthetic features* — rejected: the pack corpora, scenario taxonomies, and validators are valuable; only the execution core is wrong.

**Consequence.** The whitepaper's claims (84-point inflation, human-vs-autonomous deltas) become reproducible against a real harness — the missing external validation. Cost: real execution needs API keys/budgets in CI; use dsh's session-log-replay pattern (ADR-8) to keep most tests keyless.

### ADR-8 — Adopt dsh's engineering system as AMC's, emitting AMC-style receipts

**Decision.** Bring over per-file coverage thresholds, the gate-DAG runner, session-log-as-fixture keyless replay, the mock LLM fault server, doc-typecheck, generated-catalog `--check` twins, and a real type-aware linter (oxlint). Wire them so the gate DAG *emits AMC's signed release-gate receipts* — merging dsh's rigor with AMC's evidence discipline. Consolidate AMC's redundant test runs and unwired QA harnesses into the DAG.

**Alternatives considered.** (a) *Keep AMC's current gates* — rejected: coverage at 0, no linter, unwired e2e, and number-drift are exactly the credibility problems. (b) *Adopt dsh's system verbatim, drop AMC's receipts* — rejected: the signed receipt is AMC's edge; keep it as the DAG's output.

**Consequence.** The repo's own quality becomes evidence-backed — dogfooding "evidence over claims" on itself. This is also where the number-drift (tests/questions/packs) gets a single generated source of truth with a `--check` gate.

### ADR-9 — Vendoring & upstream discipline

**Decision.** Follow dsh's vendor model exactly: an exhaustively-logged divergence ledger (`vendor/README.md`), a rescope script, and a CI gate asserting workspace `link:` resolution. Prefer contributing fixes upstream to Cordis over private forks.

**Alternatives considered.** (a) *npm-depend on `@cordisjs/*` directly* — rejected: dsh vendors specifically to avoid registry-name coupling and to carry hardening patches (fiber lifecycle, transactional loader, lazy `!!js`); AMC will need the same patches. (b) *Hard fork* — rejected: loses upstream fixes and the Koishi validation trail.

**Consequence.** AMC can carry the same 18 hardening patches dsh found necessary without diverging silently. **Dual-upstream discipline:** AMC's vendored Cordis tracks *two* upstreams — cordisjs proper and dsh's divergence — so the ledger must record per-patch provenance (upstream-cordis / dsh / AMC-local) and name dsh's `vendor/` as the source-of-truth for the patched tree; a dsh rebase that rewrites its patches is re-vendored, not silently merged.

### ADR-10 — Governance-as-code: adopt the ADR + skills + doc-gate discipline

**Decision.** Adopt dsh's `.agents/notes` machine-gated ADR lifecycle (proposed/implemented/rejected/archived with format gates + sealed archive), repo skills (code-review, pre-push evidence selection, CoT-leakage trimming), and doc-freshness gates. Migrate the Obsidian vault's synthesis role into in-repo, gated notes so it can't go 3 weeks stale unnoticed.

**Alternatives considered.** (a) *Keep the external Obsidian vault as source of truth* — rejected: it drifts (it's 3 weeks stale now) and isn't CI-gated. (b) *No ADR discipline* — rejected: a 40-week multi-agent program without durable decisions re-litigates itself every session.

**Consequence.** This very document becomes ADR-0; subsequent decisions are gated notes. The repo-hygiene cleanup (§7 Phase 0) is the first application.

---

## 7. The construction plan — 10 phases, cold-start steps

Each step is self-contained: **Context** (what a fresh agent must know), **Do** (the work), **Verify** (commands/criteria), **Exit** (definition of done), **Model** (strongest vs default tier), **Rollback**. Steps within a phase are serial unless marked ∥. Branch/PR per step; `main` stays green.

Effort labels: **S** ≈ ≤3 days, **M** ≈ ~1 week, **L** ≈ 2–3 weeks, **XL** ≈ 3–5 weeks. These are one-engineer-with-agents estimates.

### Phase 0 — Stabilize, ship, clean (unblocks everything) — ~2 weeks

**P0.1 — Ship the pending release. [M, strongest]**
Context: npm at 1.1.1; local `main` 90 commits ahead; 33 unversioned changesets (Jul 10–13); Changesets automation stalled. `npm-publish.yml` skips gracefully when `NPM_TOKEN`/`CHANGESETS_GITHUB_TOKEN` are absent — so it's silently no-op'ing.
Do: Diagnose the stall (secrets vs failing gate). Run `release:gate` locally; fix what it flags. Version the 33 changesets, cut the release, publish (or hand Sid the exact gated command if publish requires his credentials — publishing is his action). Update README badge + Homebrew formula + install-channel to the new version in the same change.
Verify: `npm view agent-maturity-compass version` matches; `research/reproduce.sh` runs clean against the published package; badge/formula/channel versions agree (`verify-release-version.mjs`).
Exit: public users get `amc fix` + better-sqlite3 ABI self-heal. Rollback: `npm deprecate` the bad version, revert tag.

**P0.2 — Security follow-up on the BFG event. [S, strongest]**
Context: 2026-02-23 supply-chain scan FAIL (8 HIGH incl. `ANTHROPIC_TOKEN_HINT`), then 3 BFG history rewrites, no in-repo proof of key rotation.
Do: Confirm with Sid whether the flagged keys were rotated (his action if not). Remove the `--json`/`--verbose`/`.tmp-*`/`..bfg-report/` artifacts from the worktree. Fix the token-hint findings in `src/adapters/builtins/claudeCli.ts` if still present. Add a `secret-scan` gate to CI (P0 for a security-branded product).
Verify: `security-scan-lite.mjs` passes on repo + a packed bundle; no tracked secrets.
Exit: clean scan, documented rotation status. Rollback: n/a (additive).

**P0.3 — Repo hygiene: untrack the strays. [S, default] ∥ with P0.2**
Context: §3.3(3) — competitive intel, `test_model.pkl`, `mirofish-simulation/` fabricated testimonials, tarballs, dead fragment, empty husks, persona stack, embedded `qa/`.
Do: `git rm --cached` the tracked strays (fix the `.gitignore` filename bug for `COMPETITIVE_*`). Delete local clutter. Relocate persona/GTM/memory material out of the repo root (to `~/.openclaw`-style home). Extract `qa/` to its own repo. Delete `mirofish-simulation/` outputs (keep the `src/mirofish/` engine). Remove `cli-new-commands.ts.fragment` and `autoFixer.ts` (dead). Move the 1.0GB npm cache out of `.amc/`.
Verify: `git status` clean; npm tarball unchanged (already clean per `files`); tests still green; no fabricated-quote files tracked.
Exit: a public repo that matches an evidence-integrity product's claims. Rollback: git revert.

**P0.4 — One source of truth for the numbers. [S, default]**
Context: §3.3(6) — tests/questions/packs counts disagree across README/CLI/qa/whitepaper; three scorers.
Do: Add a `gen-counts` script that computes real counts (test cases, questions per bank version, assurance packs) and a `--check` twin gate (dsh pattern). Replace every hand-maintained number (README badge, CLI help strings, docs) with the generated value or a check against it. Pick the canonical five-dimension taxonomy; retire the other.
Verify: `gen-counts --check` passes; grep finds no stale hardcoded counts.
Exit: numbers can't drift silently again. Rollback: revert.

**P0.5 — Refresh the vault checkpoint. [S, default] ∥**
Context: `/Users/sid/Documents/AMC` is 3+ weeks past `review_after`; this plan changes direction.
Do: Reverify `AMC Now`/`AMC Roadmap` against `f419839a`, live Linear, npm; record the superharness direction and link this plan. (Per ADR-10 this is the last big external-vault synthesis before ADRs move in-repo.)
Verify: against external ground truth, not self-attestation — the vault's stated HEAD matches `git rev-parse HEAD`, its npm claim matches `npm view agent-maturity-compass version`, and its Linear claims match live issue states.
Exit: workflow state matches reality. Rollback: n/a.

**P0.6 — Resolve OQ-1 (repo layout) with the user. [decision]**
Context: Phase 1 cannot start until the monorepo-vs-single-package question is settled — P1.1's pnpm-workspace work presupposes it (adversarial-review finding 7).
Do: Present OQ-1 (§10) with the recommendation (pnpm monorepo) and get an explicit decision; record it as a gated ADR note.
Verify: the ADR note exists and names the layout; P1.1's Context is updated to cite it.
Exit: **Phase 0's exit gate** — Phase 1 is unblocked. Rollback: n/a (decision).

### Phase 1 — The composition kernel — ~4–6 weeks (critical path root)

**P1.1 — Vendor Cordis. [M, strongest]**
Context: ADR-1/-9. Prerequisite: P0.6 resolved the repo layout. **Vendor source-of-truth: dsh's already-patched vendor tree** at `/Users/sid/Downloads/deepseek-harness-master/vendor/` (`cordis, cosmokit, schemastery, loader, include, group, timer, hmr, logger-console`) — it already embeds the 18 hardening patches (fiber lifecycle, transactional loader, lazy `!!js`, `--dump-config`); do not re-derive them from upstream `@cordisjs/*`. Its divergence ledger is `vendor/README.md` in that repo. dsh's repo is MIT; note `native/landlock-run` (used later in P4.4) is **BSD-3-Clause** — carry THIRD_PARTY_NOTICES obligations for everything vendored.
Do: Add `vendor/` with the packages rescoped to `@amc/*` via a `rescope-vendor.ts` script. Start AMC's own divergence ledger recording **per-patch provenance** (upstream-cordis / dsh / AMC-local — ADR-9). Add pnpm workspace + `link:` resolution + a `verify-vendored-links` gate + THIRD_PARTY_NOTICES generation. Add `tsconfig` host/client faces if the two-face split is adopted (defer to P7 if web isn't touched yet).
Verify: `pnpm install` resolves vendor links; a trivial `ctx.plugin(() => {})` loads and disposes with effect tracking; the divergence ledger lists every local mod with provenance; notices file covers the vendored tree.
Exit: Cordis runs inside the AMC repo. Rollback: remove `vendor/`, revert workspace config. **This is the gate for all of Phase 1+.**

**P1.2 — `amc-core` boot + loader + config. [L, strongest]**
Context: dsh `packages/boot/app-boot` + `core` + the loader (`cordis.yml` entry tree, id-diff reconciliation, profiles/bundles, `!!js`, `--dump-config`). Note: AMC is currently a package manager's workspace? No — AMC is a single npm package. Decide now (see Open Question OQ-1) whether to become a pnpm monorepo (dsh-style, recommended) or keep one package with an internal plugin dir.
Do: Build `boot()` (root context → home path → loader install → mount include tree → fail-loud settled-tree audit → dispose-on-partial). Implement declarative composition (`amc.cordis.yml`) with id-diff reconciliation, profile/patch layering over an empty root, schema-validated plugin config (Schemastery), source-tracked env layers, and `amc --dump-config`. Reuse AMC's existing signed-config discipline: make the composition file signable (beat dsh — its config is unsigned). Include the **live settings service** (dsh `packages/settings/*`: namespaced schema defaults → base → user layer, file watcher, comment-preserving YAML leaf-diffs, secret-role redaction with path-op writes, `expectedRevision` concurrency) — it is the substrate later phases' "live override without restart" behaviors assume.
Verify: `amc --dump-config` shows the boot tree with provenance; changing one entry's config reconciles only that fiber (not a restart); a PENDING plugin with an unresolved service fails loud naming the service.
Exit: AMC boots as a composed plugin tree. Rollback: keep the legacy `cli.ts` entry as default; `amc agent` gates the new path.

**P1.3 — Capability-seam scaffolding + typed event bus + scopes. [M, strongest]**
Context: dsh's Service Definition/Provider/Consumer pattern; 4 dispatch modes (emit/bail/serial/waterfall); per-agent scopes (events up, visibility down); `ctx.effect()` for unmanaged resources.
Do: Establish the seam conventions (abstract Service classes on `ctx.*`, `inject` gating, `ctx.effect()` disposers), the typed event bus with declaration merging, and the scope primitive (branded `Scoped<T>` dispatch, parent chains). Write the "HMR-safety test" convention dsh mandates (every service must prove disposal).
Verify: a demo two-service graph where unloading the provider disposes+reloads the consumer; an events-up/visibility-down scope test passes; a resource registered via `ctx.effect` is released on unload.
Exit: the seam/event/scope substrate other phases build on. Rollback: n/a (additive).

**P1.4 — HMR + runtime-diagnostics invariants. [M, default]**
Context: dsh HMR (classify → stale-detect → transactional reload with cache backup/restore) and `ctx.invariants` + per-package `./invariant` companions.
Do: Wire `@amc/hmr` (fs-watch → reclassify → transactional dispose+reinstantiate). Stand up `ctx.invariants` and write the first companions (session enclosure, FIFO, prompt reconstruction, approval pairing — mirror dsh's). This is also AMC's *first fs-watch code* (previously zero).
Verify: editing a plugin file hot-reloads it without dropping sibling plugins; a deliberately broken reload restores the prior good tree (never half-loaded); invariants fire in dev.
Exit: hot reload works; invariant harness exists. Rollback: disable the watcher (composition-level).

### Phase 2 — The evidence spine — ~5 weeks (depends P1)

**P2.0 — Harden the trust root. [M, strongest] — prerequisite for every "signed & provable" claim**
Context: Adversarial-review finding 2. The deep read (plans/research/amc/amc-trust.md) shows the current signing stack is spoofable at its root: key-history JSON is unsigned and filesystem-writable (anyone with workspace write can append a pubkey and pass `verifyHexDigestAny`); notary responses auto-append to auditor key history (`signer.ts:131`); `AMC_NO_SIGN=1` writes literal `"unsigned"` sigs; the vault falls back to `amc-test-passphrase` under `NODE_ENV=test`; `binderVerifier.ts` and bundle paths shell out to raw `tar -xzf` on untrusted archives; `zkPrivacy.ts` is hand-rolled placeholder crypto; `receiptChain.ts`'s store is an in-process `Map`; `amc.config.yaml` (controlling `trustBoundaryMode`) is the one unsigned root config.
Do: Sign (or chain) the key-history files; remove the notary auto-append (pin explicitly instead); gate `AMC_NO_SIGN` behind an explicit, loudly-evidenced dev profile or remove it; remove the test-passphrase fallback from production builds; route every tar extraction through the limit-validated safe extractor; replace `zkPrivacy.ts` with an audited library or delete the ZK claims; persist receipt chains; sign `amc.config.yaml`.
Verify: an attacker-appended pubkey in key history fails verification; a `tar` bomb in a passed artifact is rejected; no code path emits `"unsigned"` writer sigs outside the evidenced dev profile; receipt-chain verify works across two processes.
Exit: the trust root deserves the claims Phases 2/9/10 make on it. Rollback: per-item revert; each hardening is independent.

**P2.1 — Wrap the ledger + crypto as Cordis services. [M, strongest]**
Context: ADR-3. AMC's `ledger.ts` (2,366 lines, hash chain + triggers + receipts + seals) and `crypto/keys.ts`/signing/vault are KEEP-AS-SERVICE but need decomposition; the cross-module `verifyLedgerIntegrity` coupling (fails on unrelated config-sig problems) must be severed.
Do: Expose `ctx.ledger` (append/session/seal/verify), `ctx.crypto` (sign/verify/keys), `ctx.receipts`, `ctx.blobs` as services over the existing implementations. Decompose `ledger.ts`: separate schema/migrations, retention, verification, receipts. Sever the config-governance checks out of evidence-chain verification. Consolidate `guard_events.sqlite` and the other 9 scattered DBs onto the pooled store.
Verify: existing ledger tests pass through the service; `verifyLedgerIntegrity` no longer fails on unrelated config sigs; one DB file where there were 10+.
Exit: signed evidence available as a kernel service. Rollback: services delegate to unchanged code, so the wrap reverts cleanly; the DB consolidation is staged **dual-write → verify parity → cutover**, with a reversible export at each stage — never a one-way migration.

**P2.2 — Session model as signed evidence events. [L, strongest]**
Context: ADR-3. dsh's event-sourced session (append-only, derived history, `surfaceOp` append/replace, `sourceEventSeqs`, `request/header` reconstructability, crash-repair synthetic close). AMC's ledger becomes the backing store.
Do: Implement the `Session` service where every `SessionEvent` is a signed, hash-chained ledger row; derive LLM history via a surface projection; add `request/header` snapshots; implement crash recovery (synthetic `turn/end {interrupted}` + `TOOL_OUTCOME_UNKNOWN`). Enforce "model-visible ⟺ logged ⟺ signed" as a runtime invariant. **Decide the signing granularity explicitly** (adversarial-review finding 5): per-event sign+chain+fsync on a `synchronous=FULL` SQLite ledger is plausibly 10–100× slower than dsh's batched zstd JSONL; the recommended design is per-event hash-chaining with **batched signatures over checkpoint windows** (sign turn-boundary seals; Merkle the intra-turn deltas), preserving tamper-evidence without signing every `assistant/chunk`.
Verify: the event chain verifies end-to-end and the surface fold is deterministic (same log → same derived history, asserted twice); killing mid-turn leaves a detectable interrupted turn, not a truncated one; **a measured throughput gate**: a streaming turn sustains a stated events/sec floor (set from a benchmarked dsh-equivalent baseline) without unbounded write-queue growth. (Full request-reconstructability is verified in P3.1, which builds request derivation.)
Exit: the unified evidence spine — the plan's keystone. Rollback: n/a (new subsystem; gated behind `amc agent`).

**P2.3 — Persistence seam (JSONL + SQLite) + projections + spill. [M, default]**
Context: dsh persistence (JSONL zstd packed-chunks + SQLite behind one contract + conformance suite), projection registry (stale-never-wrong caches), spill (oversized output → files + locator).
Do: Build the persistence seam with both backends and a shared conformance suite; the projection registry (pure folds, `Object.is` gating, `stateVersion` invalidation); spill as a `post-execute` policy. Keep everything signed (beat dsh — its logs are unsigned).
Verify: both backends pass the conformance suite; a projection cache is stale-but-never-wrong across a `stateVersion` bump; oversized tool output spills with a working retrieval locator.
Exit: durable, queryable, signed sessions. Rollback: JSONL-only default.

**P2.4 — Merkle anchoring + transparency over session roots. [S, default] ∥ with P2.3**
Context: AMC's transparency log + Merkle (M4) currently anchors published artifacts; extend to session-log roots. Fix the O(n) rebuild-per-append and swallowed-failure debt found in the deep read.
Do: Anchor periodic session-log Merkle roots into the transparency log; make Merkle updates incremental + fail-loud.
Verify: a session's inclusion proof verifies offline; Merkle root never silently lags the log.
Exit: sessions are externally verifiable. Rollback: disable anchoring (composition-level).

### Phase 3 — LLM seam + agent loop — ~6 weeks (depends P2)

**P3.0 — Credentials seam. [S, strongest]**
Context: Adversarial-review finding 1 — P3.1's adapters need API keys and nothing supplied them. dsh's model (`packages/credentials/*`, see plans/research/dsh/code-security.md): config carries env-var-name *references*, never values; layered store (process env > `~/.amc/.credentials.yaml` 0600, watched, comment-preserving) with per-operation re-resolution (restart-free rotation), shadowed-write rejection, and `describe()` for UIs without value exposure. AMC's vault/keychain passphrase store is adjacent but for signing keys, not provider credentials.
Do: Build `ctx.credentials` on dsh's reference-not-value model, backed by a 0600 layered store; integrate with AMC's existing keychain support; adapters resolve per request.
Verify: a rotated key applies on the next request without restart; a write shadowed by process env is rejected loudly; `describe()` never returns a value; file perms enforced with a fix-it error.
Exit: providers have a credential source. Rollback: env-vars-only fallback.

**P3.1 — LLM adapter seam + providers. [L, strongest]**
Context: dsh LLM seam — StreamChunk contract, BlockAssembler, `prepareCall` pins adapter, deep-frozen reconstructable requests; the contract text is at `/Users/sid/Downloads/deepseek-harness-master/packages/llm/llm/src/types.ts` and `docs/subsystems/llm-streaming.md` (digest: plans/research/dsh/code-orchestration.md). AMC today only proxies.
Do: Build `ctx.llm` (adapter registry, routes, StreamChunk protocol, BlockAssembler). Implement adapters for the providers AMC's users need first (Anthropic, OpenAI, plus AMC's gateway-as-provider so foreign traffic still routes through evidence capture). Token meter + context-pressure projections. Request derivation from the session log (`request/header` + derived history) lands here — this completes P2.2's reconstructability story.
Verify: a streamed completion assembles correctly; `usage` precedes `finish`; a recorded request reconstructs byte-identically from the session log; a forced 429 surfaces a typed retryable error from a direct `ctx.llm.stream()` call with a durable event.
Exit: AMC can call models natively (not just proxy). Rollback: n/a (new).

**P3.2 — The agent loop. [L, strongest]**
Context: dsh `core/agent-loop` (the only package with loop logic): inbox-claimed turns, steps = request + tool calls, bounded rolling tool pool, `turn/end` reasons, `agent/pre-step` waterfall. This is what AMC has *never had*.
Do: Implement `ctx.agentLoop` over the session + llm services: turn/step state machine, inbox (followup/steer/inject over one `send`), cancellation (`cancel(cause, {keepInbox})`), the `agent/pre-step` waterfall, bounded parallel tool-call pool, and **turn-boundary retry** (the `agent/request-error` waterfall — the loop is what dispatches it, so retry policy lands here, not in P3.1's transport). Every loop event is a signed session event.
Verify: an agent runs a multi-step turn calling (stub) tools; steering mid-turn works; cancel leaves a clean interrupted turn; the whole run is reconstructable and signed.
Exit: **AMC runs an agent** — the single biggest capability gap closed. Rollback: `amc agent` gated; legacy paths untouched.

**P3.3 — System-prompt assembly + context plugins + approval seam. [M, default]**
Context: dsh system-prompt registry (ordered sections, persona, `toolOrder`, fail-loud vars), context plugins (AGENTS.md/CLAUDE.md loading, time, `@file`/`@session`), and the approval seam (4-value fail-closed, audit-paired, per-session policy).
Do: Build the system-prompt assembly service; context plugins (AMC now *reads* AGENTS.md/CLAUDE.md, closing the irony that it only wrote them). Wire the approval seam — but back it with AMC's richer approvals subsystem (quorum, hash-chained, delivery) as the answerer (ADR-4).
Verify: prompt sections assemble in order; an unknown `{{var}}` fails loud; a direct `ctx.approval.request()` blocks on a real (quorum-capable) approval, records the audit pair, and normalizes rogue answerers to `unavailable` (fail closed). (Routing tool-call `ask` decisions through this seam is verified in P4.1, which builds the pipeline.)
Exit: the loop has identity, context, and human-in-the-loop. Rollback: a dev-profile composition may temporarily flip the default to allow — tracked as an explicit ADR-5 exception note, never a silent new default.

### Phase 4 — Tools, execution substrate, sandbox, Code Mode — ~8 weeks serial (sandbox sub-steps parallelize) (depends P3)

**P4.1 — Tool registry + execution pipeline. [L, strongest]**
Context: ADR-4. dsh pipeline (pre-execute waterfall → monotonic guards → approval → execute wrapper → post-execute → finalizeContent → result observers; frozen args; nested tokens; orthogonal outcome fields). AMC's toolhub executors + action-policy are the seed.
Do: Build `ctx.tools` (scoped registry, `defineTool()` DSL, `restrict()` masks) and the full pipeline. Port toolhub's fs/git/http/process executors into pipeline tools. Wire AMC's firewall/leases/budgets/DSL as guards and post-execute filters (ADR-4). Enforce monotonicity (guards deny-only).
Verify: a tool call traverses the full pipeline with a denied-then-approved path; a guard can't launder a denial by ordering; outcome fields are orthogonal (exitCode AND timedOut); args are frozen.
Exit: governed tool execution — AMC's core promise made literal. Rollback: `amc agent` gated.

**P4.2 — Subprocess + PTY + jobs substrate. [L, strongest]**
Context: dsh subprocess seam (detached groups, tree kill, spill, credential scrub), node-pty terminals (readiness-evidence ladder), background jobs (owner-fenced, wake budgets). AMC has only a monitor spawn wrapper; no PTY.
Do: Build `ctx.subprocess` (explicit specs, tree termination, bounded collectors + spill, credential scrub — AMC's scrub already exists, converge it), `ctx.terminal` (node-pty; add the `patches/node-pty` packaging patch dsh uses), `ctx.jobs`. Reconcile the three legacy observation paths (`wrap`/`supervise`/`adapters run`) onto this substrate (ADR-6).
Verify: a subprocess tree is fully killed on cancel; a PTY reaches readiness by evidence ladder; a background job settles once with an owner-fenced wake.
Exit: real execution substrate. Rollback: pipe-only (no PTY) fallback.

**P4.3 — Core built-in tools. [L, default]**
Context: dsh's 24+ tools. Prioritize the load-bearing set: bash (one-shot + persistent), read/write/edit + read-before-edit policy, glob/grep (ripgrep + spill-over-cap), todo_write, web_search/web_fetch (AMC's egress proxy makes these governable — beat dsh), terminal_*, ask_user_question, and the **lsp tool** (dsh's 4-op read-only seam + generic stdio host — `packages/lsp/*`).
Do: Implement each as a pipeline tool with the canonical value/rendered-content split and render-intent cards. Route `web_*` and subprocess network through AMC's egress allowlist (AMC-ahead).
Verify: an **AMC-native scenario checklist mirroring dsh's snapshot census names** (bash turns, fs read/write/edit/policy-reject, glob/grep over-cap spill, web fetch caps, todo, terminal readiness, lsp definition) passes as integration tests — note dsh's own fixtures are in dsh's session format and cannot literally run here; keyless CI replay of these scenarios arrives with P8.2; `web_fetch` to a non-allowlisted host is denied and recorded.
Exit: a genuinely useful coding agent. Rollback: subset of tools via composition.

**P4.4 — Kernel sandbox (three sub-steps). [L total, strongest]**
Context: dsh sandbox (bwrap → Landlock w/ own C launcher → Seatbelt → Windows ACL; per-call policy; fail-closed; denial→escalation protocol; runner-failure vs denial attribution). AMC has only a Docker-args wrapper. dsh's `native/landlock-run` is **BSD-3-Clause** (not MIT — notice-retention + no-endorsement obligations; add to THIRD_PARTY_NOTICES when vendoring).
Do, staged: **P4.4a Linux** — sandbox seam + per-call policy model with session-log mode fold + bwrap/Landlock backends (vendor `landlock-run` or reimplement per its exit-125 contract), plus the denial→same-turn-escalation protocol with strict-widening + approval. **P4.4b macOS** — Seatbelt SBPL backend. **P4.4c Windows** — restricted-token ACL backend; *blocked on the P8.1 Windows CI lane* (unshippable untested; dsh has 14 spec files on this backend alone). Keep AMC's egress allowlist as an orthogonal network layer throughout.
Verify: per sub-step, the OS-matrix confinement proof (a write outside the workspace is denied with the backend's own denial signature); a denied write triggers the escalation protocol and one-shot grant; unavailable sandbox fails closed, never silent-passthrough; runner failure is attributed as infrastructure, never blamed on the command.
Exit: real OS confinement — closes AMC's most-confessed enforcement gap. Rollback: Docker-wrapper fallback with a loud "degraded" evidence event.

**P4.5 — Code Mode. [M, strongest]**
Context: Adversarial-review finding 1 — a headline dsh capability with no step. dsh's design (plans/research/dsh/code-tools.md, code-core.md): a reserved `run_code` transport executes one model-written TypeScript program in a hostile-peer worker (fresh worker per run, rebuilt port messages, captured intrinsics, dual busy/wall budgets, empty env, byte-accounted output); `tools.name(args)` bindings re-enter the full guarded pipeline as logged sub-calls carrying the parent token; under `mode: code`, direct calls to non-`run_code` tools fail at execution creation.
Do: Implement the code-runtime seam + worker-thread backend + per-scope generated tool SDK; wire sub-calls through the P4.1 pipeline so every guard/approval/evidence rule applies to code-dispatched calls identically.
Verify: a `run_code` program calling a denied tool is denied inside the worker with the denial recorded as evidence; sub-calls appear as logged `tool/code-dispatch` events with parent tokens; worker budgets kill a spinning program.
Exit: Code Mode parity with governance applied. Rollback: `mode: native` composition default.

### Phase 5 — Fold the trust/enforcement plane onto the loop — ~4 weeks (depends P4; ∥ tracks)

**P5.1 — Enforcement guards as pipeline citizens. [M, strongest]**
Context: ADR-4. Firewall, leases, budgets, taint/DSL, prompt-injection detectors move inline.
Do: Register the runtime firewall as a pre/post-execute + llm-stream guard; leases + budgets as pre-execute quota guards; consolidate the four prompt-injection matchers into one guard. Every decision is a signed evidence event.
Verify: a prompt-injection payload is blocked at the tool boundary and recorded; a budget breach denies with the configured consequence; one injection-matcher, not four.
Exit: `enforce/*` stops being advisory. Rollback: a composition may temporarily flip enforce→observe per guard — recorded as an explicit ADR-5 exception, never a silent new default.

**P5.2a — Live scoring over session events. [M, default] ∥**
Context: M1/M12. Scoring reads the live evidence spine. **Scope honestly** (adversarial-review finding 9d): the canonical scorer is the evidence-gated diagnostic runner (`src/diagnostic/`) — the `api/index.ts` prefix heuristic and the Python platform demo scorer are non-canonical and get retired/labeled in P7.3. Only evidence-gated *behavioral* dimensions are live-computable from session events; organizational dimensions (strategicOps/leadership/culture layers) remain questionnaire/attestation-driven by nature.
Do: Enumerate the live-computable question/dimension subset (start from the gates whose `requiredEvidenceTypes` map onto session events: tool calls, approvals, sandbox modes, budget events, injection blocks, session seals); make the scoring service consume harness session events directly for that subset, as a projection; label the rest by their evidence source.
Verify: running a governed agent moves the live-subset score in real time with per-question evidence refs; the published score names which dimensions are live vs attested.
Exit: maturity score is live where evidence can make it live, and honest about the rest — the headline feature. Rollback: batch scoring fallback.

**P5.2b — Collapse the drift-monitor sprawl. [M, default] ∥**
Context: `liveDriftAlerts.ts` is 15,979 lines with ~26 near-clone satellites split-brained across `watch/`/`drift/`/`score/` — pure report-builders.
Do: Point the monitors that matter at the live session-event stream; collapse the clone family behind one parameterized monitor; enforce the 800-line ceiling with the architecture-boundaries ratchet.
Verify: a drift monitor fires on a live behavioral change; `liveDriftAlerts.ts` is under the ratchet ceiling; the clone count is measured and falling.
Exit: Watch runs on real events with a sane surface. Rollback: keep legacy reports as a lane.

**P5.3 — Reconcile the three redaction engines + observation modes. [S, default] ∥**
Context: §3.3(7). Three redaction impls; three observation generations (`wrap`/`supervise`/`adapters run`) — a *shipped* CLI surface, so ADR-2's rule applies.
Do: One redaction service used by gateway, bridge, and adapters. One observation entry point (native vs observed); keep `wrap`/`supervise`/`adapters run` as **deprecation aliases for at least one release cycle**, emitting a pointer to the new command.
Verify: one redaction code path (grep); aliases still pass their existing tests while warning; one documented capture command with two modes.
Exit: less surface, no drift, no broken users. Rollback: revert.

### Phase 6 — Orchestration + ecosystem compat — ~4 weeks (depends P4; ∥ with P5)

**P6.1 — Subagents + workflow + autonomy drivers (four sub-steps). [XL total, default]**
Context: dsh subagents (in-process + ACP/Codex/Claude-Code providers, continuable inbox-only), workflow engine (model-written scripts), ralph, goals, schedules — ~20 dsh packages; too big for one PR. AMC's fleet/handoff/A2A concepts complement this.
Do, staged: **P6.1a** in-process subagents (`ctx.subagents`, spawn/fork, continuable children whose inbox is the only mailbox, `report` channel, `maxDepth`). **P6.1b** out-of-process providers (ACP, Claude Code, Codex — reuse AMC's existing foreign-CLI adapters, ADR-6). **P6.1c** workflow engine (worker-thread scripts, `agent()/parallel()/pipeline()`, force-settle cancellation). **P6.1d** autonomy drivers (ralph loop, goal rounds, durable schedules). Throughout, wire AMC's signed handoff packets + trust-inheritance as the delegation evidence layer (AMC-ahead).
Verify (per sub-step): a parent delegates to a continuable child that reports back; a foreign-provider child honors permission modes; a workflow runs `parallel()`/`pipeline()` and survives cancellation; a goal round yields to human input; every delegation carries a signed handoff packet.
Exit: multi-agent orchestration with signed delegation. Rollback: single-agent only (each sub-step independently composable).

**P6.2 — Hooks (consume) + MCP client + skills. [M, default]**
Context: dsh consumes Claude Code/Codex `hooks.json`; MCP client; skills. AMC *produces* CC/Gemini hooks and has an MCP security analyzer + server.
Do: Add hook *consumption* onto the native waterfalls (AMC now both produces and consumes hooks — full-circle). Build the MCP client, gating every mount through AMC's `mcpSecurityAnalyzer` + trust ledger (beat dsh — it trusts what it mounts). Skills service (SKILL.md, layered, digest-driven catalog).
Verify: a Claude Code `hooks.json` gates a native tool call; an MCP server is analyzed+scored before its tools mount; a skill loads on `/name`.
Exit: ecosystem interop with AMC's security posture. Rollback: disable client mounts.

**P6.3 — Compaction + presets + attachments. [M, default] ∥**
Context: dsh compaction (pressure-triggered, pruner-first, `surfaceOp: replace`), presets (`agent.cordis.yml`), attachments.
Do: Build compaction (deterministic pruner → LLM summary as a replace-surface event, all signed), agent presets over Cordis composition, content-addressed attachments.
Verify: context pressure triggers compaction that shrinks the surface without rewriting the signed log; a preset composes a per-session agent.
Exit: long-running sessions stay in budget. Rollback: no-compaction (fail at context limit with a clear error).

### Phase 7 — Product surfaces: web UI + SDKs — ~5 weeks (depends P3+; ∥ after P4)

**P7.1 — Typed RPC + SDK protocol + TS/Python SDKs (two sub-steps). [XL total, default]**
Context: dsh JSON-RPC (enqueue-receipt + idle-boundary run semantics), TS SDK, Python single-exe-runtime SDK, typert-generated codecs, ACP server. AMC has REST servers + a subprocess Python façade.
Do, staged: **P7.1a** — the NDJSON JSON-RPC protocol with enqueue-receipt semantics + the TS SDK + a **typert-equivalent typed-RPC layer** (runtime type registry + generated codecs; dsh `packages/typert/*` — required, not implicit) + an **ACP server** so editors/automation can drive AMC agents. **P7.1b** — the Python SDK (evaluate the single-exe-runtime wheel distribution; AMC's `platform/python` and `sdk/python` get superseded by a real client). Every SDK run is a signed session.
Verify: TS + Python SDKs drive a headless run to an idle boundary and get a signed `RunResult`; an ACP client completes a prompt round-trip; codecs are generated, not hand-written; teardown ladder is clean.
Exit: embeddable governed harness. Rollback: keep REST surfaces.

**P7.2 — Web SPA over the harness. [XL, default]**
Context: dsh React web UI (slots, projection push, approval composer takeover, HMR, session search). AMC has static HTML consoles + the host auth stack (M19).
Do: Build the SPA (streaming chat, projection push channel, approval takeover, workspaces, session search/fork/export) — but mount it behind AMC's existing OIDC/SAML/SCIM host auth + RBAC (beat dsh: auth day one) and add the Host-header trust fence AMC lacks. Progressive: the Console can coexist during migration (ADR-2).
Verify: a session streams in the SPA; an approval takes over the composer; the surface requires auth and passes a rebinding-fence test.
Exit: a modern, *authenticated* agent UI — dsh has the UI, AMC has the UI+auth. Rollback: Console stays primary.

**P7.3 — Consolidate the surface sprawl. [M, default] ∥**
Context: §3.3(7). Two GitHub Actions, two benchmark subsystems, three distribution channels, the divergent `api/index.ts` scorer, unpublished VS Code shim.
Do: One GitHub Action (keep the pinned/self-verifying `amc-action`); one benchmark subsystem; one signed distribution channel (retire unsigned `packs`); make `api/index.ts` call the real scorer or clearly label it. Ship the VS Code surface as a real harness panel or drop it. Add **consent-gated telemetry** (dsh's FULL/FEEDBACK_ONLY/DISABLED model with fail-closed redaction — D14) as the harness's usage-reporting seam, defaulting DISABLED.
Verify: one action, one benchmark schema, one scorer number across CLI/API/badge; telemetry ships nothing until a consent event releases it.
Exit: coherent product surface. Rollback: revert per-item.

### Phase 8 — Engineering system (starts P0, lands here) — ~3 weeks (∥ throughout)

**P8.1 — Real linter + per-file coverage + gate DAG emitting receipts. [M, strongest]**
Context: ADR-8. dsh: oxlint type-aware, per-file 100% coverage, `run-gates.ts` DAG. AMC: no linter, coverage 0, `release-gate.mjs` (signed receipts).
Do: Add oxlint type-aware + lint-contract tests + jscpd + knip + publint. Ratchet coverage thresholds up from 0 (start at current measured floor, ratchet like dsh). Rebuild the gate runner as a DAG (needs/after/allowFailure) that *emits AMC's signed release-gate receipts*. Consolidate the redundant test runs and wire the unwired QA harnesses (persona QA, dogfood, e2e — add `@playwright/test` to devDeps). Stand up a **Windows CI lane** (dsh proves Wine-on-Linux works as the required signal with native-Windows observational) — P4.4c is blocked on this.
Verify: `lint` catches a real type-unsafe pattern; coverage gate blocks a PR that drops covered lines; the gate DAG produces a signed receipt; the Windows lane runs the suite subset green.
Exit: quality is enforced and evidence-backed. Rollback: keep thresholds at floor.

**P8.2 — Session-log-replay snapshot testing + mock LLM. [M, strongest]**
Context: ADR-7/-8. dsh records once against a real key, replays keylessly forever; mock LLM fault server. This is what makes ADR-7 (real execution) testable without API budgets.
Do: Adopt session-log-as-fixture replay (record/refresh/replay modes, override sidecars) and the scriptable mock LLM server. Convert AMC's synthetic assurance/red-team tests to replay against recorded real runs.
Verify: a recorded agent session replays keylessly and diffs clean; a fault-injected mock triggers the retry path.
Exit: real execution is CI-testable keylessly. Rollback: keep synthetic tests as a lane.

**P8.3 — Doc gates + generated catalogs. [M, default] ∥**
Context: dsh doc-typecheck, generated catalogs with `--check`, md-wrap/links, word budgets. AMC has 290 ungated docs + number-drift.
Do: Add doc-typecheck of markdown fences against the live API; generate the tool/config/persistence catalogs with `--check` twins; md-links + word-budget gates. This subsumes P0.4's counts gate.
Verify: a doc code fence that doesn't compile fails CI; catalogs regenerate deterministically.
Exit: docs can't drift from code. Rollback: warn-only.

### Phase 9 — Signed code-plugin ecosystem (beat dsh) — ~3 weeks (depends P1, P2 — starts right after Phase 2, ∥ with Phases 3–6)

**P9.1 — Signed code plugins over Cordis. [L, strongest]**
Context: ADR-5. dsh `plugin add` = raw npm/git, zero trust model (confessed). AMC has a signed *content-pack* registry (M14) — extend it to signed *code* plugins that load as Cordis fibers.
Do: Extend AMC's plugin signer/verifier/registry to package and verify code plugins (Cordis-plugin bundles), with publisher allowlists, risk-category gating, approval-gated install, and transparency-log entries — the machinery already exists for content packs. A plugin loads only if signed+approved.
Verify: an unsigned code plugin refuses to load; a signed+approved one mounts as a fiber and hot-reloads; install is transparency-logged.
Exit: **the only agent harness with a signed, approval-gated code-plugin supply chain** — a category-defining differentiator. Rollback: content-packs-only.

**P9.2 — Self-modification with governance. [M, default]**
Context: dsh `tool-cordis` lets an agent define/run/stop plugins in its own runtime. AMC's mechanic edits configs.
Do: Add the self-modification tool *gated by AMC's approval + signing*: an agent proposing a runtime plugin creates a signed, approval-gated intent before it mounts (the paper's §1.2.2 self-evolving harness — but governed). This is dsh's self-modification + AMC's governance = the paper's own "compelling future validation," done safely.
Verify: an agent-authored plugin requires approval + signature before mounting; the mount + its inverse are tracked effects.
Exit: governed self-evolution. Rollback: disable the tool.

### Phase 10 — Differentiators: make the moat unassailable — ~4 weeks (depends P2, P5)

**P10.1 — Passport/Comply/Fleet span native + observed. [L, default]**
Context: M9/M10/M11/M24. These AMC surfaces now read the live harness evidence spine.
Do: Passports auto-issue from harness-native OBSERVED evidence; compliance reports compile directly from signed session events (no synthetic assurance dependency once ADR-7 lands); Fleet becomes a multi-harness control plane; incidents auto-assemble from session events with causal edges (the built-but-roadmap-stale incident model).
Verify: running a governed agent produces a passport with real OBSERVED evidence and a compliance report backed by real session events.
Exit: the trust plane runs on real execution. Rollback: keep import-based evidence.

**P10.2 — Beat-dsh checklist. [M, default] ∥**
Context: §2.4 — dsh's confessed gaps.
Do: Ship the counterparts: durable signed allow-always grant store; encrypted-at-rest session logs; per-session hook config; turn budgets; SDK wire-cancel; session format versioning + migrations (AMC's signed migrations model already exists). Each is a small, high-signal differentiator.
Verify: per-gap concrete assertions — the grant store survives process restart and verifies under Ed25519; an encrypted session log round-trips and refuses an unkeyed read; a turn budget halts a runaway loop with a typed `turn/end` reason; a session-format v0→v1 migration round-trips; an SDK client cancels an in-flight run over the wire.
Exit: a public "AMC vs dsh" capability matrix where AMC is a strict superset. Rollback: per-item.

**P10.3 — Make the synthetic real + publish the rigor. [L, strongest]**
Context: ADR-7. Assurance/red-team/judge/simulator wired to the real loop; whitepaper claims reproducible.
Do: Point assurance packs + red-team at real target agents **driven through the native loop directly** (the P7.1 SDK is a convenience here, not a prerequisite); write judge results into the ledger; replace or relabel simulator effect bands; make `amc fix` score real evidence. Re-run the whitepaper case studies against the real harness and publish reproducible baselines (the acknowledged #1 gap).
Verify: an assurance run calls a real model and its score enters the ledger as evidence; the whitepaper's headline numbers reproduce via `research/reproduce.sh` against the harness.
Exit: rigor matches the marketing — AMC's own stated #1 weakness closed. Rollback: keep synthetic lane labeled as such.

---

## 8. Dependency graph & parallelism

```
Phase 0 (stabilize/clean) ──────────────► [gate: shippable, clean repo, OQ-1 resolved]
        │
        ▼
Phase 1 (Cordis kernel)  ◄── critical path root
   P1.1 vendor ─► P1.2 boot/loader/settings ─► P1.3 seams/events/scopes ─► P1.4 HMR/invariants
        │
        ▼
Phase 2 (evidence spine)   depends P1
   P2.0 harden trust root ─► P2.1 ledger-as-service ─► P2.2 session-as-evidence ─► P2.3 persistence ∥ P2.4 merkle
        │
        ├───────────────────────────────► Phase 9 (signed code plugins)  starts after P2
        │                                     P9.1 signed code plugins ─► P9.2 governed self-mod
        ▼
Phase 3 (creds + llm + loop)   depends P2
   P3.0 credentials ─► P3.1 llm seam ─► P3.2 agent loop ─► P3.3 prompt/context/approval
        │
        ▼
Phase 4 (tools/exec/sandbox/codemode)   depends P3
   P4.1 tool pipeline ─► P4.2 subprocess/pty/jobs ─► P4.3 built-in tools+lsp ∥ P4.4a/b/c sandbox ∥ P4.5 code mode
        │
        ├──────────────► Phase 5 (fold trust plane)   depends P4
        │                   P5.1 guards ∥ P5.2a live scoring ∥ P5.2b drift-collapse ∥ P5.3 reconcile
        │
        ├──────────────► Phase 6 (orchestration/compat)   depends P4, ∥ Phase 5
        │                   P6.1a-d subagents/providers/workflow/autonomy ∥ P6.2 hooks/mcp/skills ∥ P6.3 compaction
        │
        └──────────────► Phase 7 (surfaces)   depends P3+ (P7.1a needs typert; P7.2 needs P4), ∥ after P4
                            P7.1a rpc+ts-sdk+acp ─► P7.1b python-sdk ∥ P7.2 web spa ∥ P7.3 consolidate

Phase 8 (engineering system)   STARTS in Phase 0, lands continuously, ∥ throughout
                               (P8.1 Windows lane is a prerequisite of P4.4c; P8.2 replay of P4.3 keyless CI)
Phase 10 (differentiators)   depends P2, P5; P10.3 drives the native loop directly (P7.1 optional)
```

**Critical path:** P0 → P1 → P2 → P3 → P4 → (P5 ∥ P6 ∥ P7) → P10. Recomputed from step labels: **P0(2w) + P1(≈6w: 3 + boot/settings) + P2(≈5w) + P3(≈6w) + P4(≈8w serial spine, sandbox sub-steps parallelize) + P5(≈4w) + P10(≈4w) ≈ 35 weeks critical path**; realistic band **~34–42 weeks** once R1/R2/R6 slippage and any Phase-1-finding steps are absorbed. Phases 6, 7, 8, 9 run in parallel lanes overlapping the critical path, so *total* engineer-effort exceeds the critical-path calendar. This is a ~34–42-week program; the earlier "28–30" figure understated it (per adversarial review) and is retracted.

**Parallel-safe workstreams:** {P9 plugins} opens right after Phase 2. Once Phase 4 lands, {P5 enforcement}, {P6 orchestration}, {P7 surfaces}, {P8 engineering} share almost no files and run as separate branches/worktrees (`git worktree` per ADR-2). This parallelism is what keeps the ~35-week critical path from becoming a ~50-week serial slog.

---

## 9. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cordis learning curve stalls Phase 1 | Med | High | dsh's docs + Koishi are a working reference; P1.3 demo-graph is a forcing function; strongest model on P1.1–P1.3 |
| R2 | Ledger↔session unification corrupts the hash chain / breaks integrity verification | Med | Critical | P2 keeps the ledger core unchanged behind a service first; conformance suite + integrity verifier gate every change; migration path with signed format version |
| R2b | Signing every session event throttles the hot loop path (per-event Ed25519 + `synchronous=FULL` fsync vs dsh's batched zstd JSONL) | High | High | P2.2 decides granularity up front — hash-chain per event, batch signatures over checkpoint windows / Merkle the deltas; P2.2 Verify includes a measured events/sec throughput floor |
| R2c | The trust root is filesystem-spoofable (unsigned key-history, notary auto-append, `AMC_NO_SIGN`, test-passphrase, raw tar, placeholder ZK, in-memory receipt chains) | High (present today) | Critical | P2.0 hardens each before P2.2 builds on it; it is an explicit prerequisite gate, not a later cleanup |
| R3 | Strangler migration stalls half-done — two runtimes forever | Med | High | Every phase ships; `amc agent` gates new path; architecture-boundaries ratchet forces `cli.ts`/`studioServer` to shrink as commands move |
| R4 | Fail-closed guards (ADR-4) block real work / cause outages | Med | High | Monotonic guards (deny-only) + observe-mode default + heavy tests; dsh's escalation protocol gives a same-turn recovery path |
| R5 | Real execution (ADR-7) needs API budgets in CI | High | Med | Session-log-replay (P8.2) keeps ~all tests keyless; real-key smoke self-skips without a key (dsh pattern) |
| R6 | Sandbox portability (Landlock/Seatbelt/Windows) is deep OS work | Med | Med | Adopt dsh's MIT `landlock-run` + seam directly rather than reinventing; Docker fallback with loud degraded evidence |
| R7 | Scope explosion — 10 phases, agent fatigue, context loss | High | Med | This plan's cold-start briefs; ADR-10 gated notes; blueprint step granularity; `git worktree` isolation per workstream |
| R8 | Security debt (BFG/rotation, plaintext passphrases, unsigned config) surfaces publicly first | Med | High | P0.2 front-loads it; ADR-5 secure-by-default; sign `amc.config.yaml` |
| R9 | Upstream Cordis changes break the vendor fork | Low | Med | ADR-9 divergence ledger + `link:` gate; prefer upstreaming |
| R10 | The moat (scoring/compliance) regresses during migration | Med | Critical | Strangler keeps it running; P2.1 wraps-before-decomposing; existing tests are the floor |
| R11 | "Superset of dsh" becomes a treadmill as dsh iterates (it's in rapid dev preview) | Med | Med | Compete on the axis dsh can't follow (governed/signed/scored), not feature-for-feature; §2.4 target list is dsh's *structural* gaps, not transient ones |

---

## 10. Open questions for the user

- **OQ-1 (monorepo):** Convert AMC to a pnpm monorepo (dsh-style `packages/*/*`) or keep one npm package with an internal plugin dir? Recommendation: **monorepo** — it's how Cordis composition, per-package invariants, and the two-face build want to be structured, and it's the honest way to shrink `cli.ts`. Cost: a one-time restructure in P1.2.
- **OQ-2 (scope of "superset"):** Is the goal genuine feature-parity-plus (this plan, ~28–30 weeks), or a *strategic* superset that matches dsh on the load-bearing 20% (kernel + loop + tools + sandbox + evidence) and wins on governance — deferring web-SPA/i18n/Windows-Wine polish? Recommendation: **strategic superset first** (Phases 0–5 + 9 + 10), then parity polish (6–8 web/i18n) as demand dictates.
- **OQ-3 (Cordis licensing/branding):** Comfortable vendoring an MIT DeepSeek-adjacent framework and its rescope, and publicly crediting Cordis/Koishi (as dsh does)? This is low-risk (MIT) but worth an explicit yes.
- **OQ-4 (publish cadence):** Ship each phase to npm as it lands (dogfooding "evidence over claims" continuously), or develop the harness on a branch and release at a milestone? Recommendation: **ship continuously** behind `amc agent`, keeping the strangler honest.
- **OQ-5 (rigor priority):** Elevate Phase 10.3 (make-synthetic-real + publish reproducible baselines) earlier? AMC's own competitive analysis calls rigor the #1 gap; a real loop (P3–P4) is the prerequisite, but publishing even one reproducible native-vs-observed maturity delta right after Phase 4 could be the highest-credibility milestone. Recommendation: **insert a "rigor spike" (P4.6)** — one reproducible real-execution case study — immediately after the Phase 4 tool/sandbox work lands, pulling the most defensible slice of P10.3 forward.

---

## Appendix A — Per-agent research reports

Committed into the repo alongside this plan (per ADR-10, they are ADR-0's evidence base and must not vanish with the session): `plans/research/dsh/` (16 reports — the Cordis paper by page range, plus per-cluster dsh codebase/docs/CI digests) and `plans/research/amc/` (12 reports — per-subsystem AMC digests). Cited inline throughout by those paths.

## Appendix B — This document's provenance

Produced 2026-08-20 by two exhaustive multi-agent read passes (28 subagents, ~3.5M tokens, 730 tool calls, zero failures) over the Cordis paper, the full `deepseek-harness-master` tree, the dsh doc site, and the AMC repo at `f419839a`. This is ADR-0 under the governance discipline it proposes (ADR-10); subsequent decisions should be gated in-repo notes, not external-vault synthesis.
