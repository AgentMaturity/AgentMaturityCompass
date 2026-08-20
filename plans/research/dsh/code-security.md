# Security & Governance — DeepSeek Harness

## 1. PACKAGE PURPOSES

- `packages/guard/` — loop-hygiene guard family: behavioral plugins that watch the agent loop and enforce per-call budgets.
- `packages/guard/repeat-tool-reminder/` — advisory detector for consecutive identical tool calls; injects escalating reminders, never vetoes.
- `packages/guard/timeout-policy/` — cooperative per-tool-call deadline enforcer mapping expiry to a structured `TOOL_TIMEOUT` error.
- `packages/credentials/credentials/` — abstract credential-reference seam (`ctx.credentials`): config carries env-var-name *references*, never values.
- `packages/credentials/credentials-local/` — file+env provider over `$DSH_HOME/.credentials.yaml` with layered precedence, file watching, and 0600 enforcement.
- `packages/identity/anonymous-user-id/` — persists one random UUID per harness home (`.anonymous-user-id`) for telemetry/feedback correlation; never derived from machine identity.
- `packages/interaction/user-approval/` — the approval seam (`ctx.approval`): request/outcome vocabulary, answerer waterfall, audit-event pair, per-session `ask`/`never` policy. (Found via permission grep; the actual permission core.)
- `packages/sandbox/sandbox/` + `sandbox-policy/` — sandbox mode vocabulary, escalation choreography (`approveEscalation`), and the per-session policy resolver (`ctx.sandboxPolicy`).
- `packages/core/tools/` (permission-relevant slice) — `tools/pre-execute` waterfall producing `allow`/`deny`/`ask`, monotonic `ToolGuard`s, per-agent `restrict()`.
- `packages/hooks/` — bridges Claude Code/Codex shell hooks onto the same interception points; hook `permissionDecision` maps to the pre-execute gate.
- `docs/defensive-patterns.md` — bug-class rules distilled from shipped defects (orthogonal outcome reporting, teardown quiescence, env scrubbing, symlink-safe deletion).

## 2. KEY MECHANISMS

**Approval flow** (`packages/interaction/user-approval/src/index.ts`): `ctx.approval.request({agent, toolName, callId?, reason?, signal?})` returns a closed `ApprovalOutcome`: `allowed-once | rejected | cancelled | unavailable`. Only `allowed-once` grants, and only for that one action. Requests must be inside an open turn; the service appends an `approval/asked`/`approval/decided` audit pair (log-only, never in the model transcript) keyed by a branded `ApprovalRequestId`. Answerers register on the `approval/request` waterfall (scope-filtered per agent); a missing, throwing, or non-vocabulary-returning answerer normalizes to `unavailable` (fail closed). Per-session policy is the fold of the last `approval/policy` session-log event (`effectiveApprovalPolicy`), written only via `setApprovalPolicy()`; `never` is enforced inside the service *before* dispatch so a `prepend`-registered listener can't bypass it. Policy is surfaced to the model via a runtime-context snapshot (order 115) rather than rewriting the cached system prompt.

**Permission gate** (`packages/core/tools/src/index.ts:1459-1507, 1689`): every tool call runs the `tools/pre-execute` waterfall → `PreToolDecision` (`allow`/`deny`/`ask`). `ask` resolves through `ctx.approval` (`serviceAsk`); no approval service or no agent degrades to deny with distinct reasons. After the waterfall, *monotonic* `ToolGuard`s run — they can only deny, never re-allow, so listener ordering can't launder a denial. `ctx.tools.restrict({allow?, deny?})` intersects per-agent visibility filters and must be scoped, validates names, and can't touch the `run_code` transport.

**Sandbox modes & escalation** (`packages/sandbox/sandbox-policy/src/index.ts`, `session-mode.ts`, `packages/sandbox/sandbox/src/escalation.ts`): three modes `read-only` (default) → `workspace-write` → `danger-full-access`. Effective mode = explicit approved override > last `sandbox/mode` session event > deployment default; the workspace root is the session cwd (symlink-canonicalized). Escalation: a denied bash/fs call reports `[sandbox: file access denied under <mode> mode]` plus a hint marker; the model retries the exact command once with `sandbox_permissions` + one-sentence `justification` (`packages/shell/tool-bash/src/index.ts`). `approveEscalation` checks strict widening against the *per-call* effective mode (`WIDER_MODES` table — schema enums can't express it), then routes through `ctx.approval` with reason `escalate sandbox to <mode>: <justification>`; every non-grant throws distinct verbatim text before anything executes.

**Credential storage** (`packages/credentials/credentials-local/src/index.ts`): precedence — inherited process env (read-only, wins) > `$DSH_HOME/.credentials.yaml` (writable) > project `.env` > user `.env`. Writes to a ref shadowed by process env are rejected loudly (`assertUnshadowed`, re-judged after queuing). The YAML store is a strict ref→non-empty-string mapping; parse errors quote code+position but never the source line (it holds a secret). Writes run on a serialized promise queue under a cross-process file lock, re-read disk first (`reconcileFromDisk`), patch only their key via comment-preserving YAML edits, and write atomically at 0600/0700. Boot and every reload assert no group/other permission bits (`assertOwnerOnly`). A chokidar watcher hot-publishes external edits via `credentials/updated`; reload failure keeps the last good snapshot. Consumers re-resolve per operation — rotated keys apply on the next request without restart. `describe()` gives UIs `configured/source/writable` without ever the value.

**Guards** (`packages/guard/repeat-tool-reminder/src/index.ts`): canonicalizes arguments (deep key-sort + stringify), keys a per-agent chain in a `WeakMap`, counts consecutive identical calls (denied calls too — hammering a denial is the loop worth breaking), and at thresholds `[3,5,8]` prepends a gentle-then-detailed reminder as `additionalContexts` on the post-execute decision, stamped `{kind:'plugin'}`. A user interjection resets the chain. `timeout-policy` (`packages/guard/timeout-policy/src/index.ts`) swaps a code-scoped deadline signal onto `exec.signal`, awaits the tool to quiescence (never abandons the promise), and substitutes a structured `TOOL_TIMEOUT` result only when *its own* timer fired.

**Identity** (`packages/identity/anonymous-user-id/src/index.ts`): `getOrCreateAnonymousUserId()` — memoized per path; exclusive-create (`wx`) write settles concurrent first launches; best-effort persistence on read-only homes still returns a usable id.

## 3. FEATURE INVENTORY

- `ctx.approval.request(req)` → `ApprovalOutcome`; `setPolicy(agent, policy)` (injects a model-visible switch notice); `overrideOf(session)`; `setApprovalPolicy(session, policy)` free function; `effectiveApprovalPolicy(events)` pure fold.
- Approval config: `policy: 'ask' | 'never'` (deployment default; `never` = deterministic CI/headless auto-reject).
- Session events: `approval/asked`, `approval/decided`, `approval/policy` (with `source: 'delegation'` for child seeding); `sandbox/mode` (same delegation marker).
- `approval/request` waterfall event for custom answerers (UI, ACP one-shot machine decisions).
- Abortable approvals: `signal` withdraws → `cancelled`; late answers discarded.
- `PreToolDecision` `allow`/`deny`/`ask`; `PostToolDecision` `accept`/`block` + `additionalContexts`; `tools/result` contained observers.
- `ctx.tools.register/restrict/guard`; `ToolGuard` monotonic denials; per-agent tool shadowing; `ToolPresentationMode` `native|code|both`; `maxParallelSubCalls`.
- Sandbox: `SANDBOX_MODES`, `ctx.sandboxPolicy.resolve({session?, mode?})`, `overrideOf`, `setSandboxMode`; config `mode` (default `read-only`), `workspaceRoot` (default cwd); system-prompt policy section (order 110).
- Escalation: `sandbox_permissions` (enum `workspace-write|danger-full-access`) + `justification` tool args on bash (and fs, subject `operation`); `validateEscalationArgs` pairing rule; `sandboxDenialMarker`/`escalationHintMarker`; strict-widening `WIDER_MODES`; per-call one-shot grants only.
- Bash tool: `command`, `description` (5-10 word UI caption), `timeoutMs`, `workdir` (session-relative), `run_in_background` (+ `enableRunInBackground` config; jobs via `job_output`/`job_kill`), structured output schema (`exitCode/signal/timedOut/aborted/stdout/stderr` with spill paths, `sandbox {mode, denied, enforcement, runnerFailed}`), terminal-card presentation with exit pill.
- Credentials: `credentialRef()` brand ctor; `resolve/describe/set/unset`; `credentials/updated` event; empty-value-is-absent rule; sources `env|file|project-env|user-env`; config `path`, `dshHome`, `watch` (default true), `debounceMs` (default 100); `CREDENTIALS_FILENAME`; chmod-600 enforcement with actionable error; comment-preserving edits; hot reload; shadowed-write rejection.
- Identity: `getOrCreateAnonymousUserId({env?, randomUUID?})`; `ANONYMOUS_USER_ID_FILE_NAME`; delete-file-to-reset semantics.
- repeat-tool-reminder config: `thresholds` (default `[3,5,8]`, fail-loud validation: non-empty, integers ≥2, no dupes), `include`/`exclude` `*`-wildcard tool patterns (transparent, not resetting), `argumentsPreviewChars` (default 500; caps reminder text, never detection).
- timeout-policy: honors per-tool `timeoutMs` declarations; `TOOL_TIMEOUT` error code routable by retry/replay plugins.
- Hooks bridges: Claude Code `permissionDecision` `allow/deny/ask` (+reason) mapped onto pre-execute; most-restrictive merge `deny > ask > allow` (`packages/hooks/hook-protocol/src/merge.ts`).
- Subprocess hygiene: `SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i`, `scrubbedParentEnv()` (`packages/subprocess/subprocess/src/index.ts`).

## 4. PATTERNS WORTH STEALING

- **Session log as policy store**: overrides are events; `effective = fold(events) ?? default` — restart-survivable, per-session isolated, zero external config store, replay *is* the state (`sandbox-policy/src/session-mode.ts`, `user-approval/src/index.ts:112`).
- **Fail-closed closed unions**: every approval path normalizes to a 4-value vocabulary; rogue returns and throws become `unavailable`, and callers deny on everything but `allowed-once` (`user-approval/src/index.ts:304-344`).
- **Monotonic guards after extensible policy**: guards can only deny, so registration order can't re-open a denial (`core/tools/src/index.ts:704`).
- **Denial-marker + same-turn escalation protocol**: teach the model one verbatim marker vocabulary, put the retry hint at the decision point, make the approval prompt itself the consent UX — no chat detour (`sandbox/src/escalation.ts`).
- **Strict-widening checked at execution, not schema**: schemas are registry-global; effective mode is per-call truth (`escalation.ts:28`).
- **Audit pair enclosed in the turn boundary** so crash-tail events can't fake decisions (`user-approval/src/index.ts:127`).
- **References-not-values credential config** + per-operation re-resolution for restart-free rotation + `describe()` for UI without value exposure (`credentials/src/index.ts`).
- **Refuse world-readable secret files with a fix-it command**; never quote a secret-bearing line in parse errors (`credentials-local/src/index.ts:103, 135`).
- **Structural typing to break dependency cycles**: `EscalationApprover` mirrors `ApprovalService` shape so sandbox never imports approval (`escalation.ts:102`).
- **Invariant companion plugins** per package asserting cross-event contracts at runtime in dev (`*/src/invariant.ts`).
- **Cache-safe policy exposure**: policy text travels after retained history, not in the cached prompt prefix (`user-approval/src/index.ts:204`).
- **docs/defensive-patterns.md itself**: shipped-bug classes codified as rules (orthogonal outcome flags; dispose-to-quiescence; contained dispatcher callbacks; scrubbed child env; `lstat`+`unlink` for link-shaped paths).

## 5. MATURITY NOTES

- Strong test presence everywhere covered: credentials-local has 4 suites (~920 lines incl. dedicated `drain`, `watcher`, `review-fixes` regression suites), user-approval 514-line spec + invariant spec, repeat-tool-reminder 403 lines, tool-bash unit + integration.
- One FIXME: `timeout-policy` intends a rename to `dsh-timeout-guard` before first tagged release (`guard/timeout-policy/src/index.ts:6`).
- One TODO: `tool-bash` notes deployment permission policy belongs in `tools/pre-execute`/executors, implying current placement is transitional (`shell/tool-bash/src/index.ts:6`).
- No experimental flags in these packages (an `experimental/` package dir exists elsewhere); v8 coverage-ignore comments are justified per line; heavy `jscpd:ignore` blocks document *deliberate* symmetry with the settings-file provider rather than unreviewed duplication.
- Docs are generated-verified (`gen-cordis-catalog` + doc-sync freshness check), bilingual (en/zh with i18n manifests) — unusually high doc rigor.