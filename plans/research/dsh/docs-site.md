# DeepSeek Harness Documentation — Summary Report

**Site status:** Reachable. Fetched 12 English pages: guide (quickstart, providers, python-sdk), develop/basic (index, tool, config, publish), develop/framework (index/lifecycle, service, events), develop/practice (index), and reference (index).

---

## 1. Quickstart flow (install → config → first run)

The quickstart is Web-UI-centric and deliberately thin on installation — it delegates startup instructions to the repo README (`github.com/deepseek-ai/deepseek-harness`, README#run), which yields a local server URL once the `dsh` process is running. From there:

1. **Model setup:** Settings → Models, paste a DeepSeek API key from platform.deepseek.com, save. No server restart needed — "model changes take effect on the next request."
2. **Workspace:** click "Choose workspace," add the project directory where `dsh` was started, select it to enable the session composer.
3. **First run:** start a session with a natural-language task, e.g. "Summarize this repository and identify its main packages." The agent "can read and edit workspace files, run commands, delegate work, and maintain a plan"; permission-gated operations surface approval prompts.

**Model/provider configuration** (guide/providers): credentials live in `$DSH_HOME/.credentials.yaml` with redacted references in settings. Beyond DeepSeek, a provider catalog covers Anthropic, OpenAI, Bedrock, Vertex, Azure, and Codex (the latter four use native auth: AWS creds+region, ADC project, `api-version`, OAuth). Custom providers (internal gateways/self-hosted) take a permanent lowercase Provider ID, display name, base URL, API protocol, key, and at least one model; the ID is permanent because sessions, defaults, and credential references bind to it. YAML config under `llm-pi-ai.providers` supports `apiKeyEnv`, `api: openai-completions`, `baseURL`, explicit `input: [text, image]` for vision models, and `compat` knobs (`supportsDeveloperRole`, `maxTokensField`) for gateways that hold a valid key but reject requests.

**Python SDK** (guide/python-sdk): `pip install deepseek-harness-sdk`; bundled runtime needs "no system Node.js." Requires Python 3.10+, Linux x64/arm64 or macOS 14+ arm64. Env vars: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DSH_MODEL`, `DSH_SYSTEM_PROMPT`. Usage: a `DeepSeekHarness(...)` context manager taking `provider`, `model` (e.g. `deepseek-v4-flash`), `max_tokens`, `cwd`, `session_root`, and a `cordis` YAML composition path; `harness.run(prompt, session_id=...)` returns a result with `.final_response`. Example composition: persistent `bash` + `str_replace_editor` tools, 300s bash timeout, 16k-char editor output cap, compaction disabled, uncompressed JSONL sessions. Session reuse preserves shell state; the example runs "danger-full-access," so isolated/disposable workspaces are prescribed.

---

## 2. Plugin development model

**Core model:** a plugin is a TypeScript module exporting `name` and an `apply(ctx: Context)` function (context type from `@deepseek-ai/cordis`). Three forms: function (most common), object (`{ name, inject, apply }`), and class extending `Service` (when providing services to others). Local plugins register in `cordis.yml`; dev loop is `pnpm dsh web --patch ./path/to/cordis.yml`.

**Lifecycle:** each plugin runs in a "Fiber" with a six-state machine: PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED, with FAILED on `apply` errors. Loading is dependency-driven: `inject: ['tools', 'llm']` gates execution until services exist; if a service disappears (provider swap), dependents auto-dispose and reload when it returns. Everything registered via `ctx` (listeners, tools, adapters, timers) unwinds automatically on unload; `ctx.effect()` supplies custom disposers, invoked in reverse registration order (async disposers run concurrently). `ctx.plugin(child)` nests contexts; `fiber.dispose()` guarantees full recursive cleanup. HMR ships as `@deepseek-ai/cordis-plugin-hmr`.

**Tools:** `defineTool()` from `@deepseek-ai/dsh-tools` takes `name`, `description`, `parameters` (typed schema, inferred into `execute(args)`), `output` (`schema` + `render(args, value)` producing model-facing content blocks), and async `execute`. Register with `ctx.tools.register(...)` under `inject: ['tools']`.

**Services/DI:** built-in services `ctx.tools` (ToolRuntime), `ctx.llm`, `ctx.agents`. Custom services extend `Service` (`super(ctx, 'metrics')`, `static inject`), with TypeScript declaration merging for typed context access. Required deps via `inject`; optional via `ctx.get('name')`. `cordis.yml` supports service isolation so plugin groups get independent instances.

**Events:** `ctx.on()` / `ctx.emit()`, four dispatch modes — emit (broadcast, sync, return values ignored), bail (first meaningful result short-circuits), serial (registration order, awaited), waterfall (middleware-style `next()` pipeline). Typed via declaration merging. Built-in events: `agent/step`, `agent/request`, `agent/request-error`, `tools/result`, `session/event`; durable session events (`turn/*`, `step/*`, `tool/call`, `tool/result`, `compaction/*`) are inspected via `session/event.type`, not direct listeners.

**Config:** export a `Config` type plus same-named Schemastery schema with defaults on schema fields; validated at load, invalid configs fail loudly. Rule of thumb: anything two deployments might set differently belongs in config.

**Packaging:** a **bundle** is an npm package shipping a config layer (`package.json` with a `dsh.bundle.patch` pointer to `cordis.patch.yml`, plus the entry module); a **profile** is a runnable composition under `$DSH_HOME/profiles/<name>`; "nothing is both." Install via `dsh plugin --profile demo add ./hello-plugin` (also `github:you/repo` — needs a `prepare` script and an `allowBuilds` entry in `pnpm-workspace.yaml` — or a `pnpm pack` tarball, or npm registry). Config layering order: bundle patches → profile patch → `$DSH_HOME/cordis.patch.yml` → `--patch` argv overlays; later layers win per row, patches replace a row's whole `config` (no deep merge).

**Practice guidance (capability layering):** general capabilities split into Service Definition (interface + request/result types), Service Provider (implementation), and Consumer (model-facing tool) — e.g. `dsh-shell` / `dsh-bash-local` / `dsh-tool-bash`. Providers are swappable via `cordis.yml`; providers and consumers depend only on the definition. Advice: don't split packages prematurely; "explicit > implicit" for defaults. An LLM adapter page extends this pattern to model backends.

---

## 3. Reconstructed navigation / table of contents

- **Guide** (`/en/guide/`): Use the Web UI (quickstart) · Configure models (providers) · **SDK:** Python (python-sdk)
- **Development** (`/en/develop/`)
  - **Basics:** Your first Harness plugin (`basic/`) · Build a tool (`basic/tool`) · Plugin configuration (`basic/config`) · Package and install (`basic/publish`)
  - **Framework:** Plugin lifecycle (`framework/`) · Services and dependencies (`framework/service`) · Event system (`framework/events`)
  - **Practice:** Capability layering (`practice/`) · LLM adapter (`practice/llm-adapter`)
  - **Cordis framework tutorial** (`cordis-tutorial/`): overview + 7 progressive lessons (starting `01-first-plugin`, covering plugins, lifecycle, services, events, composition, integration)
- **Reference** (`/en/reference/`)
  - **Concepts:** Architecture · Cordis primer · Capability services · Agent lifecycle · Tool execution
  - **Generated reference:** Plugin configuration · Tool schemas · Persistence events
  - **Cordis core API:** Context · Events · Fiber · Plugin Registry · Service · Inherited surface
  - **Cookbook:** adding packages, tools, LLM adapters, settings cards, conversation nodes; extension patterns
  - **Subsystems:** Core and scopes · Sessions and persistence (~8 pages) · Model and context (~4) · Execution and tools (~9) · Policy and interaction (~7) · Platform and access (~7)

Quickstart also references CLI-modes documentation (URL not captured).

---

## 4. Positioning / marketing claims

- **"Every part of the product is a plugin"** — the flagship claim: no privileged core code; the harness is a composition of plugins over the Cordis framework, extensible via configuration rather than core modification.
- **Replaceability and hot composition:** services/events make components swappable; "registrations are effects that unwind when their plugin unloads," enabling dynamic (re)composition and HMR.
- **Configuration-driven customization:** profiles stack bundles as ordered patch layers — deployment variation without forking code.
- **Durable, inspectable sessions:** turns → steps → tool invocations all persist as durable events (JSONL), pitched at auditability/replay.
- **Multi-provider neutrality:** despite DeepSeek branding, first-class catalog support for Anthropic, OpenAI, Bedrock, Vertex, Azure, plus custom OpenAI-compatible gateways.
- **Low-friction Python embedding:** self-contained SDK ("no system Node.js"), positioning the harness as an embeddable agent runtime for benchmarking/automation, with candid safety framing (full-access example demands isolated workspaces).

The tone is engineering-documentation-first; claims are architectural rather than promotional, centered on the Cordis plugin model as the differentiator.