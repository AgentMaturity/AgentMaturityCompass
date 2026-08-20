# DeepSeek Harness — Documentation Report

## 1. Architecture (in my own words)

DeepSeek Harness (dsh) is an agent harness built entirely as a plugin tree on **Cordis**, a vendored plugin framework (republished under `@deepseek-ai/*` — see rescope.md). Every part of the product — model adapters, tool registry, session log, even the agent loop — is a plugin contributing **services** (claimed at stable `ctx.<key>` slots), **typed events** (four dispatch modes: emit / waterfall / parallel / serial), and **reversible effects** that unwind on unload. There is no privileged core: you extend the system by mounting plugins beside existing ones, and any config row can be replaced by a patch.

A running `dsh` is composed at boot from layers: a **profile** (named composition, e.g. `web`, `headless`) stacks **bundles** (`dsh-base` first: adapters, tools, persistence, sandbox/approval, settings, credentials, telemetry; then `dsh-web-app` or `dsh-headless`), followed by profile-level, home-level, and `--patch` overlays. `dsh --profile web --dump-config` shows the actual boot tree.

Two organizing ideas dominate:

- **Event-sourced sessions.** The append-only `SessionEvent` log is the single source of truth; model history is *derived* from it (`deriveMessages()`), and the invariant "model-visible means logged" is runtime-asserted. Fork, resume, replay, telemetry, and UI all derive from this stream.
- **Capability seams.** A swappable capability has three roles — Service Definition, Service Provider(s), Consumer(s) (canonical: `dsh-shell` / `dsh-bash-local` / `dsh-tool-bash`). Filesystem, subprocess, sandbox, web, LSP, compaction, spill, skills, subagents, storage, telemetry, session-persistence (JSONL/SQLite), credentials, and settings are all seams; swapping one provider (e.g. to an E2B remote sandbox) moves Bash, PTY, and LSP together with no forks. Experimental Agent Teams layers a durable roster/task-board/mailbox over continuable subagents.

Events split into three domains: durable **session events**, live **agent events** (`agent/*`), and **capability events** (`fs/*`, `tools/*`, …) that attach policy without importing the loop.

## 2. Tool catalog (every built-in model-facing tool)

- **ask_user_question** — pause and ask the human one or more structured questions (options, multi-select).
- **run_code** — Code Mode transport: execute a TypeScript program whose `tools.name(args)` bindings re-enter the full guarded tool pipeline as logged sub-calls.
- **exit_plan_mode** — present the plan for user review; approval leaves plan mode.
- **bash** / **pwsh** — one-shot shell command in a fresh process (workdir, timeout, `run_in_background` → job id); pwsh is the Windows mirror.
- **bash** / **pwsh** (persistent variants) — commands in an owner-isolated persistent PTY shell; state survives calls.
- **str_replace_editor** — view/create/unique-literal-replace/line-insert file editor over `ctx.fs`.
- **read / write / edit / read_image** — line-numbered file read; create/replace; exact-literal edit; image read (requires image-capable model + attachments).
- **glob / grep** — file discovery and ripgrep content search via packaged ripgrep through `ctx.subprocess`; capped results spill to a saved full list.
- **terminal_open / terminal_send / terminal_read / terminal_list / terminal_signal / terminal_close** — persistent PTY sessions: create, type (submit or raw), page retained output, list, signal foreground group, close.
- **create_goal / get_goal / update_goal** — durable same-session objective with revisioned phases (edit/pause/resume need human authority; complete/blocked allowed in goal rounds).
- **schedule_create / schedule_list / schedule_delete** — session-local reminders (delay, absolute, or ≥300 s fixed-rate).
- **lsp** — goToDefinition / findReferences / goToImplementation / hover via a language-server provider.
- **ralph** — foreground fresh-agent loop: one new child per round toward an immutable objective; only a bounded handoff crosses rounds.
- **skill** — load full instructions for a named skill from the session catalog.
- **session_event_read / session_event_search / session_event_trace / session_search / session_trace** — read-only queries over authorized session logs, cross-session search, and lineage tracing.
- **subagent** (alias **subagent_fork**) — delegate a self-contained task to a child agent; shipped `subagent` is continuable/background-default, `subagent_fork` one-shot/foreground.
- **send_message / interrupt_agent / list_agents** — control continuable background subagents (message next turn, cancel current turn, list children/descendants).
- **report** — child-scoped: send a self-contained result to the parent agent.
- **job_list / job_output / job_kill** — kind-agnostic background-job controller for background bash, PTY sends, and subagents.
- **todo_write** — replace-whole-list structured task checklist (session-owned state).
- **workflow** — run a model-written JS orchestration script with `agent()`, `pipeline()`, `parallel()`, `phase()`, `log()` hooks; script coordinates only, agents do the work.
- **web_search / web_fetch** — provider-neutral web search (1–4 queries) and URL fetch.
- **cordis_define / cordis_run / cordis_stop / cordis_undefine / cordis_inspect_list / cordis_inspect_query / cordis_inspect_self** — opt-in, not in any shipped tree: define, activate, stop, remove, and introspect dynamic Cordis packages against the live runtime.
- **Agent Teams (experimental, disabled by default)**: spawn_teammate, send_message, followup_task, interrupt_agent, list_agents, wait_agent, team_task_create/get/list/update — Lead/teammate coordination over a durable shared task board with CAS updates.

## 3. Config catalog highlights

A generated, boot-verified catalog of every `cordis.yml` `config:` block (~100 packages). Notable: **agent-loop** (`maxParallelToolCalls`, startup agents with resume ids); **compaction-basic** (`thresholdRatio` 0.8, `retainRatio` 0.16, per-model policy overrides, overflow-recovery retries); **system-prompt** (persona template, explicit `toolOrder`, harness identity toggle); **sandbox-policy** (fail-safe default `mode: read-only`); **sandbox-local** (runner argv override + failure signatures); **permission-presets** (named sandbox+approval bundles, `workspace-write` / `danger-full-access`); **tool-subagent** (provider, toolName, `backgroundMode`, per-child persona/toolFilter, `maxDepth` default 3); **llm-deepseek/pi-ai/retry/replay** adapters; JSONL vs SQLite persistence (Zstandard compression, packed chunks); tool packages' knobs (`enableRunInBackground`, `allowParallelInProgress`, `sampleOverCapGlobResults`).

## 4. Agent lifecycle and tool execution pipeline

**Lifecycle.** A **turn** is zero or more **steps** (one model request + its tool calls). Input arrives via one inbox; the driver claims pending next-step input plus one queued message, opens `turn/start`, and runs the `agent/pre-step` waterfall — listeners may rewrite or reject the claimed messages (a rejected/empty first claim still logs a step-less turn). Each step: `step/start` → entered messages logged as `user/message` → prompt sections/tool schemas assembled → `agent/request` → `llm/stream` → `assistant/chunk*` → `assistant/message` → tool calls classified by executionMode and run under barriers/bounded rolling pool → `step/end`. Request failures route through `agent/request-error` (compaction uses it for context overflow recovery). If tools owe another request or new input arrived, the next step is claimed; otherwise the serial `agent/turn-stopping` checkpoint fires and `turn/end` closes. Durable facts go on `session/event`; live control/status rides `agent/*`.

**Tool pipeline.** `tool/call` is logged before execution. Then: `tools/pre-execute` waterfall (hooks, permission, sandbox) → registered monotonic guards (deny or abstain) → `ctx.approval` one-shot prompt (absent/unanswerable = deny) → `tools/execute` around-dispatch (timeout, retry, metrics) wrapping the tool body — filesystem mutations gated by `fs/write-intent`/`fs/edit-intent` — → `tools/post-execute` (accept/block/replace/add context) → registry normalization (throws become isError) → definition-owned `finalizeContent` → frozen `tools/result` notification → single model-facing `tool/result` event → batch-settled `additionalContexts` injected as user messages. Code Mode sub-calls traverse the same pipeline carrying the parent token.

## 5. Doc pages, one line each

**Top-level:** architecture (system map, turn flow, extension points) · agent-lifecycle (Mermaid sequence of turn/step events) · tool-execution-pipeline (Mermaid flow of the guarded pipeline) · api-gateway (Typert `@Remote`/`@RemoteScope` Host→Client RPC) · capability-seams (generated seam/service graph) · config-catalog (generated per-package config reference) · cordis-primer (Cordis in five ideas; dispatch modes; waterfall semantics) · defensive-patterns (shipped bug-class rules: orthogonal outcomes, async≠sync, dispose-to-quiescence, scrubbed env, symlink unlink) · development (setup, two-aggregate TS layout, build order, hooks, CI, TODO tags, type-equiv fences) · event-producer-consumer (generated event × dispatcher × listener matrix) · glossary (canonical terms: seam, scope, goal, turn/step/round, Ralph) · graph-atlas (index of generated diagrams) · module-graph (generated package dependency graph) · persistence-catalog (generated catalog of every durable SessionEvent type) · rescope (vendored-package rename map) · testing (tiers: unit, 100 % per-file coverage, real-API e2e, snapshot, web browser; "verify the world"; real-entry-path rule) · web-styling (theme token ownership for client packages) · **BENCHMARK.md** (run benchmarks via the Python SDK `jsonrpc-agent` variant, isolated workspaces/sessions).

**cookbook/:** extension-cookbook (plugin shape patterns) · adding-a-package (new-package checklist) · adding-a-tool (tool authoring contracts) · adding-an-llm-adapter (provider adapter guide) · adding-a-conversation-node (Web Chat node tutorial) · adding-a-settings-card (web settings card) · adding-a-vendored-package (vendoring checklist) · maintaining-dsh-code-review (skill maintenance workflow) · responding-to-pr-review-on-a-stack (stacked-PR review rules).

**cordis-api/:** context, events, fiber, registry, service (generated core API), inherited (vendor `ctx` members).

**cordis-tutorial/:** index + 01–07: first plugin, lifecycle/effects, services, events, config, composition/HMR, into-the-harness (a real tool).

**subsystems/** (one page per subsystem, types + generated Cordis API): README (index) · core (spine: agent/agent-loop contracts) · session (event-sourced log) · persistence (durability seam) · session-projection / session-query / session-reference / session-telemetry / session-title · system-prompt · tools · llm-streaming · token-meter · compaction · scope (per-agent registration) · subagent · agent-team · subprocess · shell · terminal · sandbox · filesystem · fs-adjacent spill · skills · goal · schedule · jobs · workflow · plan · approval · permission-presets · user-questions · commands · credentials · settings · storage · workspace · attachment · feedback · invariants · lsp · web · web-server · client-modules · code-runtime · extensions · typert.

**user/:** index (docs landing) · guide/index (Web UI quickstart) · guide/providers (model config) · guide/python-sdk (SDK quickstart) · develop/basic index/config/tool/publish (first plugin → packaged bundle) · develop/framework index/service/events (plugin model) · develop/practice index/llm-adapter (three-role capability design).

## 6. Postmortem lessons

- **0001 (ACP crash):** `export default` on a namespace plugin makes the Loader discard `inject`; opportunistic service reads must use `ctx.get(name)` (the fiber walk is ancestor-only and fails through shadows). Meta-lesson: 178 green tests and 100 % coverage missed both bugs because nothing exercised the real Loader/export path — "test the real entry path"; keyless real-boot e2e belongs in CI. Trust the trace, not the elegant theory.
- **0002 (fs tools silently disabled):** `!!js` expressions evaluate only under plugin `config`, not entry metadata like `disabled`; a truthy expression object disabled the whole fs stack, and snapshot *refresh* faithfully committed the regression. Lessons: verify exactly which config fields are interpolated; a snapshot refresh is fixture production, not correctness review — add semantic guards (reject `UNKNOWN_TOOL`).
- **0003 (web agent validated the wrong server):** the agent didn't know which URL/process hosted its own GUI, took bare-Vite HTTP 200 as success, and "verified" a replacement server. Lessons: runtime identity (URL, mode) must be model-visible; HTTP readiness ≠ application readiness; acceptance must name the exact origin and be externally observed; a regression test must be able to fail for the reported mechanism.
- **0004 (Landlock misclassification):** a benign launcher notice sharing a prefix with fatal errors, plus any nonzero child exit, was misread as sandbox failure (ripgrep's no-match exit 1 became `SANDBOX_UNAVAILABLE`), and an adapter swallowed the structured error into generic `SEARCH_FAILED`. Lessons: process attribution needs a conjunction of independent evidence (exit code + exact line), exclusions must be exact while unknowns fail closed, adapters must preserve structured errors from the seam below, and platform-dependent behavior needs deterministic fakes plus one assembled product-path test.