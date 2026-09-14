<!-- Written by the integrating root session on 2026-09-14 from the impl:gap-register fleet agent's report
     (run wf_550bf7a2-670, 59 tool uses, REPORT_ONLY; record AMC_OS/RESEARCH/2026-09-14-fleet-sequential/impl-gap-register/).
     Root verified the two evidence-boundary findings below before writing this file; nothing else in the
     register was re-measured by root. Status stays DRAFT until §4's next steps run. -->

> **Root verification of the evidence boundary (2026-09-14, root checkout at `6062bd6d`).**
> `/tmp/amc-competitor-20260908/deepseek-harness/.git/HEAD` is absent; `.git/index` is dated 2026-09-08 12:31 (the
> original shallow clone) while `.git/{hooks,info,logs,objects,refs}` are dated 2026-09-13 00:02–00:03, i.e. the
> clone was altered during the 2026-09-12/13 all-at-once fleet runs. `packages/{session,llm,sandbox,shell}` hold
> 0 `.ts` files, `guard` 4, `client` 679, `api` 138, `core` 87, `extensions` 54 (1,975 `.ts` in 54 package
> groups). The 2026-09-08 analysis `AMC_OS/RESEARCH/2026-09-08-dsh-pi/deepseek-harness.md` cites GitHub blob
> URLs at `c389f96` for every upstream reference (U01–U05, session/sandbox/mcp/terminal/sdk/llm READMEs), so
> that receipt does not depend on the damaged clone and is not withdrawn. Re-cloning the comparator downloads
> a third-party repository and is left for Sid's go-ahead; until then the rows below that rest on the local
> clone are labelled as the agent labelled them.

# AMC Gap Register — 2026-09 (comparator edition)

**Status:** DRAFT · produced 2026-09-14 by track IMPL-6 (REPORT_ONLY) · no repo writes · supersedes nothing yet
**AMC source:** `d635a5e29241931551082b293ce9a7ebcd9ba612` (branch `amc/gap-register-execution`), `package.json` version `1.2.0`, 1,909 `src/**/*.ts` files, 1,483 `*.test.ts` files under `src/`+`tests/`
**Environment:** Darwin 25.6.0 arm64 · Node v25.5.0 · pnpm 10.33.0
**Exercised:** static reads and greps only. **Not exercised:** no `pnpm install`, no build, no test, no CLI run; nothing in this register is a runtime result.
**Comparators (pinned, brief §1):** DeepSeek Harness `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` / `0.1.3-alpha.2`; pi `b2602be77cb7b0de45dd616407fd210daa48aa75` / `0.85.1`.
**Companions:** `plans/amc-gap-register.md` (internal-defect register, 290 rows — untouched), `plans/amc-superharness.md` §5 (D1–D16) and §5b (G1–G12, A1–A15).

---

## 0. Evidence boundary — read before any row

1. **AMC was read from the pinned object, not a checkout.** This worktree's HEAD is `3d6b8d4a` (`main`) and does not descend from `d635a5e2`. The pinned tree was exported with `git archive` into the scratchpad and every AMC path/line below is from that copy. No branch was checked out.
2. **The local dsh clone cannot be pinned and is incomplete.** `/tmp/amc-competitor-20260908/deepseek-harness/.git/HEAD` does not exist (`git rev-parse` fails "not a git repository"; `.git/` holds only `hooks index info logs objects refs`). The tree has 2,090 files / 1,770 `.ts` / 320 `.md`, but these package groups have **zero source files**: `session`, `llm`, `sandbox`, `guard`, `shell`, `web`, `terminal`, `subagent`, `schedule`, `workflow`, `webhook`, `spill`, `settings`, `identity`, `storage`, `skill`, `mcp`, `sdk`, `boot`, `bundle`, `plan`, `todo`, `runtime-diagnostics`, `feedback` (directory names exist; e.g. `packages/session/session-format-v1-to-v2/src/` contains only `testing/`). Present with sources: `client` (495 `.ts`), `experimental` (265), `api` (71), `extensions` (38), `core` (37), `fs` (29), `host` (27), `context` (24), `goal` (16), `compaction` (16), `interaction` (15), `lsp` (14), `attachment` (14), `preset` (13), `hooks` (13), `e2b` (9), `code-runtime` (9), `credentials` (7), `acp` (7), `jobs` (6). The only local version corroboration is `apps/desktop/package.json` → `"version": "0.1.3-alpha.2"`. **Consequence:** a grep-absence over this clone proves nothing for the missing groups. Every load-bearing "dsh lacks X" row below is therefore verified against GitHub at `c389f96` (file named), and local greps are labelled *present-subset only*.
3. **pi has no local clone.** Seven files were fetched at `b2602be7` via `raw.githubusercontent.com`/tree pages and are cited by path. Anything else from §5b (`853a80d2`) is labelled **carried** and is *not* claimed verified at `b2602be7`. `AMC_OS/RESEARCH/2026-09-08-dsh-pi/pi.md` is not tracked at `d635a5e2` (only `2026-09-09-*` research dirs are) and the root checkout was not read.
4. **Retired claims (brief §1) were not reintroduced.** Confirmations that the retirement stands: dsh `packages/session` at `c389f96` lists `session-format-v0-to-v1` and `session-format-v1-to-v2`; `apps/desktop/package.json` declares `"electron": "^44.0.0"`; `packages/client/connection/src/browser-auth.ts` and `rpc-host.ts` match `launch.?token` (local present subset). pi `.github/workflows` at `b2602be7` lists `publish-model-catalog.yml`, `npm-audit.yml`, `build-binaries.yml` — telemetry/v4 claims are simply not made here.
5. **Severity vocabulary** (from the previous register): CRITICAL = attacks the product thesis or ships broken; HIGH = major product gap; MEDIUM = parity gap; LOW = polish. **Gap class:** missing / partial / parity / AMC-ahead. "AMC-ahead" is a statement about presence of a mechanism, never about quality or superiority (§2 rule 9).

---

## 1. Register

Columns: ID · Capability · Comparator evidence (file @ commit) · AMC state @ `d635a5e2` (file evidence) · Class · Sev.

### 1.1 Shipping and distribution

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| S-01 | Published release matches source | pi: `build-binaries.yml` @ b2602be7 builds 6 targets and stages release assets; `npm-audit.yml`, `publish-model-catalog.yml` present. dsh: `ci.yml` @ c389f96 has no publish step (Python SDK build only). | **Measured 2026-09-14:** `npm view agent-maturity-compass version` → `1.1.1`, `time.modified` `2026-07-15T09:48:15Z`, `dist-tags {latest: 1.1.1}`; `package.json` at d635a5e2 → `1.2.0`. Workflows exist: `.github/workflows/release.yml`, `npm-publish.yml` (`NPM_CONFIG_PROVENANCE: true` at npm-publish.yml:126, `npm publish --provenance` at release.yml:236). | missing (unshipped) | CRITICAL |
| S-02 | Multi-platform binaries | pi `build-binaries.yml` @ b2602be7: darwin-arm64/x64, linux-x64/arm64, windows-x64/arm64; `sha256sum … > SHA256SUMS`; **no** cosign/gpg/sigstore/notarization/attestation step (fetched, none found). | `scripts/build-sea.mjs` (Node SEA, `dist/sea/amc`); `release.yml:218-219` copies only `amc-linux-x64-sea-${VERSION}` + manifest; `release.yml:79` `runs-on: ubuntu-latest` only; `release.yml:70,142` SHA256SUMS written and `sha256sum -c`; `release.yml:211,287` `provenance.json`. | partial (1 SEA target vs 6) | HIGH |
| S-03 | Signed release manifests (the "beat checksums" item) | pi: checksums only (S-02). dsh `ci.yml` @ c389f96: no signing step (fetched, none found). | `scripts/prepare-public-release-assets.mjs:99` writes SHA256SUMS; grep `sign` in that script → 0; grep `cosign\|gpg\|attest\|sigstore` in `release.yml`/`npm-publish.yml` → 0. `amc-release-manifest.json` is mentioned (release.yml:246) but no signing of it was found. | missing | HIGH |
| S-04 | Supply-chain hygiene (pins, min-release-age, ignore-scripts, audit CI) | pi: `npm-audit.yml` workflow present @ b2602be7; README @ b2602be7 documents `npm install --ignore-scripts`; min-release-age/shrinkwrap **carried**. dsh `ci.yml` @ c389f96: no `npm audit`, no registry-signature step (fetched). | Not measured this run. | CANNOT_VERIFY — next: inspect `package.json` engines/pins, `.npmrc`, `.github/workflows/ci.yml` for audit/provenance verification | MEDIUM |
| S-05 | Windows CI leg | dsh `ci.yml` @ c389f96: runners `ubuntu-24.04`, `ubuntu-latest`, `dsh-windows-2025-16core`, self-hosted `dsh-win-ci`; no macOS, no Wine (fetched). pi: Windows binaries (S-02). | `.github/workflows/ci.yml`: every job `runs-on: ubuntu-latest` (lines 16, 38, 142, 176, 195, 212). | missing | MEDIUM |

### 1.2 Interactive surface and sessions

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| I-01 | Interactive agent session (REPL/TUI) | pi README @ b2602be7: `pi-coding-agent` "Interactive coding agent CLI", `pi-tui` "Terminal UI library with differential rendering". dsh: `packages/client/*` SPA (495 `.ts` present locally), `apps/cli`. | `src/cli-agent-commands.ts:129-131` `amc agent chat` — "Interactive native tasks over the existing governed run/resume path"; `:168-170` `amc agent run` — "Run one agent turn". Implementation `src/setup/nativeInteractiveSession.ts`: `node:readline` (:2), SIGINT → cancel (:105, :111), per-command `stream` and `interactiveApprovals` flags (:115), skill catalog wired (:13-14, :65-67). No `ink`/`blessed` (package.json: `inquirer` only). `src/repl/amcRepl.ts` is an operator command REPL that spawns `amc` subprocesses, not the agent loop. | partial — readline chat exists; no full-screen TUI, no in-chat session picker | HIGH |
| I-02 | Session tree: branch / fork / labels / picker | pi `packages/coding-agent/src/core/session-manager.ts` @ b2602be7 (fetched): `CURRENT_SESSION_VERSION = 3`, JSONL under `~/.pi/agent/sessions/<encoded-cwd>/`, `branch()`, `branchWithSummary()`, `createBranchedSession()`, `forkFrom()` (sets `parentSession`), `appendLabelChange()`. dsh `session-format` README @ c389f96: event-sourced, append-only, `session[.vN].jsonl`. | `src/session/sessionResume.ts:2` "Resume and fork signed native sessions across processes (AMC-1511)"; `:83 ForkSessionParams`; `:142` sealed session → "fork it to continue"; `sessionApiTypes.ts:71` fork records parent's verified final row; `jsonlContinuation.ts:160`. No label, tree or list/picker command found in `cli-session-commands.ts`/`cli-agent-commands.ts` (grep `command("(list|ls|tree|fork)` → 0). | partial | MEDIUM |
| I-03 | Crash / interrupt recovery | dsh `session-format` README @ c389f96: recoverable decoder returns accepted logical prefix, may drop one malformed/gapped row + uncommitted suffix; later `turn/end` makes it fatal. pi session-manager @ b2602be7: `parseSessionEntryLine()` returns `null` and malformed lines are skipped. | `amc agent session recover`, `replay-request`, `verify-proof` commands registered (`cli-agent-commands.ts`); `sessionOwnership.ts:48` refuses unsupported writer ownership. Not exercised. | parity-unverified | MEDIUM |
| I-04 | Steering / follow-up / cancellation inside a turn | pi `agent-loop.ts` @ b2602be7 (fetched): `getSteeringMessages()` injected before next assistant response, `getFollowUpMessages()` continues when the agent would stop; `stopReason:"length"` → `failToolCallsFromTruncatedMessage`. | `src/agent/inbox.ts`, `toolSeam.ts`, `loopTypes.ts`, `agentDriver.ts`, `toolCalls.ts` match `steer`; SIGINT cancel in chat (I-01). Truncated-toolcall handling not checked. | partial-unverified | MEDIUM |
| I-05 | Session integrity (tamper evidence) | pi session-manager @ b2602be7: "No hashing, HMAC, signing, or cryptographic verification" (fetched). dsh: `packages/session` listing @ c389f96 has no sign/integrity/ledger/hash/hmac/verify package; `session-format` README describes none (fetched). | `src/ledger/ledger.ts:547` `eventHash = sha256Hex(prevHash + canonicalMetadata + payloadSha256)`; `src/crypto/signing/`, `keyHistoryEnvelope.ts`, `keyRotationReceipt.ts`; signed writer ownership (`sessionOwnership.ts`). Caveat: previous register's AMC-1525 key-admission defect was **not** re-tested here. | AMC-ahead | — |
| I-06 | Secret redaction of persisted history | pi: **carried** (sessions persist verbatim). dsh present subset: `redact` hits only in `api/settings-controller`, `api/gateway` README, `extensions/tool-cordis/src/api-catalog.ts` — settings-secret redaction, not history; `packages/session` sources absent locally. | `src/session/surfaceProjection.ts`, `sessionTypes.ts` match `redact`. Engines not exercised. | AMC-ahead (pi carried; dsh CANNOT_VERIFY) | — |

### 1.3 LLM plane

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| L-01 | Provider breadth | pi `packages/ai/src/providers` @ b2602be7 (tree fetched): 86 files incl. **39 `*.models.ts` provider catalogs** (amazon-bedrock, anthropic, azure-openai-responses, cerebras, cloudflare-*, deepseek, fireworks, github-copilot, google, google-vertex, groq, huggingface, kimi-coding, minimax(-cn), mistral, moonshotai(-cn), nvidia, openai, openai-codex, opencode(-go), openrouter, qwen-token-plan*, together, vercel-ai-gateway, xai, xiaomi*, zai*) plus `radius.ts`, `faux.ts`. dsh `packages/llm` @ c389f96 (tree fetched): `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `token-meter`, … — non-DeepSeek breadth is pi-ai's. | `src/llm/providers/`: 8 adapter modules over **6 providers** — `anthropicAdapter`, `deepseekAdapter`, `gatewayAdapter`, `geminiAdapter` + `geminiAudioAdapter`, `ollamaAdapter`, `openaiAdapter` + `openaiResponsesAdapter`; route registry `src/llm/adapter/adapterRegistry.ts`. | partial (6 vs 39; up from 3 in §5b) | HIGH |
| L-02 | Prompt-cache marker emission | pi: per-protocol `cacheRetention` → `cache_control` / `prompt_cache_key` / `cachePoint` — **carried**. | grep `cache_control\|ephemeral\|prompt_cache_key\|cachePoint` in `src/llm` → **0 hits**. | missing | HIGH |
| L-03 | Cache-read/write accounting | pi unified `Usage` with cacheRead/cacheWrite — **carried**. | Present: `anthropicAdapter.ts:202-203` (`cache_read_input_tokens`, `cache_creation_input_tokens`), `openaiResponsesAdapter.ts:40-46` (`cached_tokens`), `openaiAdapter.ts:110`, `deepseekUsage.ts:34`, `geminiUsage.ts:37`, `ollamaUsage.ts:22`; `streamChunk.ts:221` `cacheReadTokens`. | parity (accounting only) | — |
| L-04 | Subscription OAuth (Claude/Codex/Copilot) | pi providers @ b2602be7 include `openai-codex.ts`, `github-copilot.ts`, `cloudflare-auth.ts` (listing); PKCE flow **carried**. | grep `pkce\|oauth` in `src/llm`, `src/credentials` → 0. | missing | MEDIUM |
| L-05 | Model/price catalog | pi `publish-model-catalog.yml` @ b2602be7 + per-provider `*.models.ts`. | `src/budgets/nativeBudgetAdmission.ts:21` "not a tokenizer or pricing oracle"; :55-56 "Never invent prices". No catalog found (`pricePer\|pricing` → only that file). | partial (AMC enforces on known cost; comparators price) | MEDIUM |
| L-06 | Budget/spend enforcement | pi: cost is telemetry only — **carried**. dsh present subset: `costLimit\|spendLimit\|maxCost\|budgetUsd` → 0 `.ts` hits; `llm/token-meter` sources absent → CANNOT_VERIFY. | `nativeBudgetAdmission.ts:54` throws `NativeBudgetRefusal` when "known model cost subtotal exhausted the signed budget". | AMC-ahead (pi carried; dsh unverified) | — |

### 1.4 Tools, execution substrate, sandbox

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| T-01 | Built-in tool breadth | dsh package names @ local clone (dirs only for most): `shell/{tool-bash,tool-bash-persistent,tool-pwsh,tool-pwsh-persistent}`, `fs/{tool-fs,tool-fs-search,tool-str-replace-editor}`, `web/{web-fetch-http,web-search-deepseek,web-search-exa,web-search-perplexity}`, `terminal/tool-terminal`, `lsp/tool-lsp`, `todo/tool-todo`, `plan/plan-mode`, `interaction/{tool-ask-user,user-questions}`, `skill/tool-skill`, `subagent/tool-subagent*`, `jobs/tool-jobs`, `goal/tool-goal`, `workflow/{tool-ralph,tool-workflow}`, `extensions/tool-cordis`. | `src/tools/builtin/`: `bashTool.ts` (`name: "bash"`), `searchTools.ts` (`glob`, `grep`), `fsTools.ts`, `readBeforeEdit.ts`, `workspaceWalk.ts`; `src/agent/delegateTool.ts:125` `name: "delegate"`; `src/workflow/workflowTool.ts`; `src/codemode/runCodeTool.ts`. grep `web_fetch\|web_search\|ask_user\|todo\|plan` tool names in `src/tools`, `src/agent`, `src/toolhub` → 0. | partial | HIGH |
| T-02 | Kernel sandbox backends | dsh: dirs `sandbox/{sandbox,sandbox-local,sandbox-policy,sandbox-windows-acl}`, `native/landlock-run` (sources absent locally; §5 D8 carried). pi SECURITY.md @ b2602be7: "the Pi coding agent intentionally does not have a sandbox" (fetched). | `src/sandbox/`: `bwrapBackend.ts`, `seatbeltBackend.ts`, `nativeSandboxBinding.ts`, `nativeSandboxPolicy.ts`, `processConfinement.ts`, `sandboxRunner.ts`. No Landlock or Windows-ACL backend identified by file name. | partial vs dsh; ahead vs pi | HIGH |
| T-03 | PTY / persistent shell | dsh: `terminal/{terminal,terminal-bash,tool-terminal}` dirs; node-pty **carried**. | `src/terminal/nativePtyHelper.ts` — confined helper; `:40` "requires Linux and Python 3.11+"; no `node-pty` in package.json. | partial | MEDIUM |
| T-04 | LSP tool | dsh `packages/lsp` (14 `.ts` present locally: `lsp`, `lsp-stdio`, `tool-lsp`). | grep `lsp` → only unrelated hits (`cli-native-schedule-commands.ts`, `cli-credentials-commands.ts`, `cli.ts`). | missing | MEDIUM |
| T-05 | Background jobs | dsh `packages/jobs` (6 `.ts` present). | `src/jobs/jobRegistry.ts`, `jobTypes.ts`; agent-tool exposure not verified. | partial | LOW |
| T-06 | Code Mode | dsh `code-runtime` (9 `.ts` present) + `experimental/code-runtime-python`. | `src/codemode/{codeModeRunner,runCodeTool,workerBootstrap}.ts`. | parity-unverified | LOW |
| T-07 | Remote execution world (E2B) | dsh `packages/e2b` (9 `.ts` present: `e2b`, `fs-e2b`, `subprocess-e2b`). | grep `e2b` → only `src/benchmarks/replayBenchmarkCorpus.ts`. | missing | LOW |
| T-08 | Windows shell tool | dsh `shell/tool-pwsh*` dirs. | grep `powershell\|pwsh` → `src/shield/attachmentDetonation.ts`, `src/api/enforceRouter.ts` (not tools). | missing | MEDIUM |

### 1.5 Governance seams

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| G-01 | Tool-call approval model | dsh `packages/interaction/user-approval/README.md` @ c389f96 (fetched): outcomes `allowed-once|rejected|cancelled|unavailable`; "a grant applies only to the requested action"; **confessed**: "Only one-shot grants exist — the outcome vocabulary has `allowed-once` but no `allow-always`, remembered rule, revocation, or grant store"; single terminal answerer, no quorum. pi `agent-loop.ts` @ b2602be7: optional `config.beforeToolCall` may return `block`; README: "Pi does not include a built-in permission system". | `src/approvals/` (engine, chain store, inbox, delivery, policy engine); `approvalCliCommands.ts:53` statuses `pending|quorum-met|approved|denied|consumed|expired|cancelled`; `approvalAskCommand.ts:8` "quorum-capable engine"; chat passes `interactiveApprovals` (I-01). Whether every model tool call is gated in production was not exercised. | AMC-ahead on model; wiring unverified | HIGH (verify) |
| G-02 | Permission presets | dsh `interaction/permission-presets` — names `danger-full-access`, `workspace-write`, `/permission` command (local present subset). | `src/presets/agentPresets.ts` (`.amc/agents.yaml`, signed — memory 2026-08-27 says `approveTools` not yet fed into composition; not re-verified). | partial | MEDIUM |
| G-03 | Prompt-injection detection / runtime firewall | pi SECURITY.md @ b2602be7: prompt injection "cannot be protected against", out of scope (fetched). dsh present subset: `prompt.?injection\|firewall` → 0 (guard/session sources absent → CANNOT_VERIFY for those). | `src/shield/policyFirewall.ts`, `sessionFirewall.ts`, `src/shield/injection/`; `amc firewall enable` (`cli.ts:2147` comment, `.command("enable")` at :4296/:8774). | AMC-ahead (dsh partial-unverified) | — |
| G-04 | Egress control | dsh: no egress package; `egress` hits only in `experimental/code-runtime-python` docs/tests (present subset). pi: containers by design (README/SECURITY.md). | `egress` referenced in `src/cli.ts`, `cli-observability-commands.ts`, `cliUx.ts`; module directory not located in this run. | AMC-ahead (module location to confirm) | — |
| G-05 | Hooks consumption (Claude Code / Codex `hooks.json`) | dsh `packages/hooks/{hook-protocol,hooks-claude-code,hooks-codex}` (13 `.ts` present). | Producer only: `src/bridge/hookControl.ts`, `src/adapters/hookIntegration.ts` (match `PreToolUse`); no `hooks.json` consumer. | missing (producer direction is AMC-ahead, A14) | MEDIUM |
| G-06 | MCP client | dsh `mcp/mcp-client` (dir; sources absent). pi: no MCP (README philosophy — **carried**; README @ b2602be7 fetch did not restate it). | `src/mcp/nativeMcpClient.ts` (`toolNames` catalog :167, :277), `nativeMcpHttpTransport.ts`, `nativeMcpReconnect*.ts`; **no importer** in `src/agent`, `src/tools`, `src/loop` by grep. | partial (client exists, loop wiring not found) | MEDIUM |
| G-06-root | *Root check 2026-09-14 (`6062bd6d`)* | Grep scope was too narrow: `nativeMcpClient` is imported by `src/cli-agent-commands.ts`, `src/cli-agent-guide-commands.ts`, `src/setup/nativeMcpConfig.ts`, `src/sdk/index.ts` and `src/acp/acpNativeSession.ts` (the P03 lane integrated 2026-09-12). Class should read parity-unverified (wired; conformance not exercised here), not "loop wiring not found". | | | |
| G-07 | Signed code extensions / hot reload | pi: jiti TS extensions, `/reload`, `pi install` — **carried**; extensions unsigned (**carried**). dsh `packages/extensions` (38 `.ts` present: cordis runners, `tool-cordis`); plugin signature verification grep → 0 in `bundle`/`boot`/`core` (present subset). | `src/extensions/nativeExtensionStore.ts:120-121` refuses `SIGNATURE_INVALID` unless `requireSignature === false`; that escape is passed at `src/cli-native-extension-commands.ts:32`; `nativeExecutableExtension.ts`, `nativeExtensionRuntime.ts`; `src/plugins/pluginLoader.ts` has no dynamic `import()`; no `fs.watch`/`chokidar` in `src/extensions`, `src/plugins`. | partial — signature gate AMC-ahead; in-process code + hot reload not established | HIGH |
| G-07-root | *Root check 2026-09-14 (`6062bd6d`)* | The one `requireSignature: false` site is `amc native-extension inspect` (`src/cli-native-extension-commands.ts:32`), which reads and reports signature status without loading or writing; the load/install path keeps `SIGNATURE_INVALID` fail-closed. The "escape" is therefore not a bypass. In-process code extensions and hot reload remain not established, as stated. | | | |
| G-08 | Enterprise authn/authz | dsh: local launch-token/cookie auth (`packages/client/connection/src/browser-auth.ts`, present subset); `oidc\|saml\|scim` → 0 in present subset. pi: trust boundary = local user account (SECURITY.md fetched). | `src/auth/enterpriseIam.ts`, `src/auth/ssoConfig.ts` match `oidc\|saml\|scim`. | AMC-ahead (not exercised) | — |
| G-09 | Compliance / maturity surfaces | dsh present subset: `eu ai act\|iso 42001\|nist ai rmf\|soc 2\|maturity score` → 0. pi: none (**carried**). | `src/compliance/{complianceEngine,complianceMatrix,complianceReport}.ts`, root `compliance-*.json`; `src/score/`, `src/diagnostic/`. | AMC-ahead (dsh partial-unverified) | — |
| G-10 | Foreign-agent governance | pi/dsh: consume other agents' skills/hooks; govern nothing (**carried**). | `src/adapters/` — 17 entries; `src/bridge/hookControl.ts`. | AMC-ahead | — |
| G-11 | SIEM export / drift monitors | — | grep `siem` in `src/observability`, `src/drift` → 0 in this run. | CANNOT_VERIFY — next: grep `siem` repo-wide, cite module | LOW |

### 1.6 Context, orchestration, product surfaces

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| C-01 | Instruction files (AGENTS.md/CLAUDE.md) consumed | dsh `context/agent-instructions` (24 `.ts` present). | `src/prompt/context/instructionFiles.ts`, `instructionPrecedence.ts`, `instructionsContext.ts`; `agentPromptProfile.ts`. Closes §5 D5 "writes, never reads". | parity | — |
| C-02 | Skills | dsh `skill/*` dirs; pi skills **carried**. | `src/skills/{skillCatalog,skillPrompt,skillTurn}.ts`, wired into chat (I-01). | parity | — |
| C-03 | Compaction | dsh `compaction/*` (16 `.ts` present, incl. `command-compact`, `compaction-tool-result-pruner`). | `src/session/sessionCompactionWorkflow.ts`, `src/cli-session-compaction-commands.ts`. Pressure-triggered in-loop compaction not verified. | parity-unverified | LOW |
| C-04 | Spill | dsh `spill/*` dirs. | `src/cli-spill-commands.ts`, `cli-session-spill-read-command.ts`; receipts `AMC_OS/RESEARCH/2026-09-09-spill-*` tracked at d635a5e2. | parity | — |
| C-05 | Attachments | dsh `attachment/*` (14 `.ts` present). | `src/attachments/{attachmentIngest,nativeImage*,nativeAudio*}.ts`. | parity-unverified | LOW |
| C-06 | Subagents / delegation | dsh: 10 `subagent/*` packages (dirs; sources absent). pi: none by design (**carried**). | `src/agent/delegateTool.ts`, `delegationScope.ts`, `delegationEvidenceWriter.ts`, `nativeToolCapabilities.ts:22`. | partial vs dsh | MEDIUM |
| C-07 | Workflow / goal rounds / schedules / webhooks | dsh: `workflow/{tool-ralph,tool-workflow,workflow-worker-thread}`, `goal/*` (16 `.ts` present), `schedule`, `webhook-github`. | `src/workflow/{workflowPlan,workflowRunner,workflowTool}.ts`; `src/autonomy/{goalRounds,scheduleRunner,scheduleService,scheduleStore}.ts`; `webhook` in `cli.ts`, `cli-late-stage-commands.ts`, `cli-trace-commands.ts`. No ralph loop found. | partial | LOW |
| C-08 | Web UI | dsh `packages/client/*` (495 `.ts` present; `ui-chat`, `ui-approval`, `ui-trajectory`, …), `host/webserver`. | No `react` in package.json; `src/studio` (server-rendered). | missing/partial | MEDIUM |
| C-09 | ACP / wire / SDKs | dsh `acp` (7 `.ts` present), `sdk/{client,protocol,server}` dirs, Python SDK built in `ci.yml` @ c389f96 (fetched). | `src/acp/` (16 files incl. `acpStdioMain.ts`, `acpSchema.ts`), `src/sdk/`, `sdk/python/`. Conformance not exercised. | partial | MEDIUM |
| C-10 | First-run diagnostic | — (no comparator equivalent claimed) | `src/doctor/{doctorCli,doctorFix,doctorLiveProbe,doctorReport,doctorRules,firstRunPlan,nativeModuleProbe}.ts`; `amc init` (`cli.ts:2195`), `amc doctor` (:2302), `doctor-fix` (:2366). Not exercised. | present | — |
| C-11 | i18n | dsh: zh/en READMEs throughout (`README.zh.md` present in most packages). | `src/i18n/i18nFramework.ts` only. | partial | LOW |

### 1.7 Evidence honesty (thesis rows)

| ID | Capability | Comparator evidence | AMC @ d635a5e2 | Class | Sev |
|---|---|---|---|---|---|
| E-01 | Assurance/red-team scores come from real runs | pi: evals drive a real `AgentSession` — **carried**. | `src/assurance/agentResponder.ts:1-16`: "There is deliberately NO synthetic implementation"; unreachable target → `AgentResponderUnavailableError`, scan recorded inconclusive; `assuranceRunner.ts:366-481` threads `sessionId` from `startAssuranceSession`. `syntheticResponse` → only the historical comment remains; `llmJudgeEngine.ts:353` comment says the hardcoded `{score: 0.8}` was removed; `buildMockReportForUx` → 0 hits in `cli.ts`; `cli.ts` still has **1** `Math.random` (site not inspected); `src/score/gamingResistance.ts` still has **17** `existsSync` calls (targets not inspected); `continuousRedTeam.ts:191-197` uses `Math.random` for strategy/template *selection*, not scoring. | partial | CRITICAL |
| E-01-root | *Root check 2026-09-14 (`6062bd6d`)* | `src/cli.ts` has no live `Math.random`: the single hit (line 20215) is the comment recording the removed `< 0.2` evaluator. `src/score/gamingResistance.ts` still scores by 17 `existsSync(join(root, "src/..."))` checks (lines 64–119) and is wired into `src/ci/redteamGate.ts:99` and `src/cli.ts:10672/22780`; it now carries an `applicable` gate (`detectControlSurfaceScope`) that marks a non-AMC directory not applicable, which removes the "customer scores 0" failure but leaves the self-scan (empty directories still earn points). Already registered as G1-16/G1-17 (CRITICAL, REPLACE-WITH-REAL) in `plans/amc-gap-register.md`; not duplicated here. | | | |
| E-02 | Gate refuses a score with no session-id provenance link | — | Not found by grep (`provenance` appears in `src/assurance/indices.ts` and three packs; no refusal path located). | CANNOT_VERIFY — next: read `assuranceRunner.ts:360-490` + tests; mutation-test the refusal | CRITICAL |

---

## 2. The five pi-deciding items (brief §7 item 6) — status at d635a5e2

| # | Item | Finding | Status |
|---|---|---|---|
| 1 | **Ship** — npm 1.1.1 vs local 1.2.0, then signed binaries | Measured 2026-09-14: npm `latest` = `1.1.1` (modified 2026-07-15); source = `1.2.0`. Release pipeline exists (`release.yml`, `npm-publish.yml`, provenance, SHA256SUMS) but the SEA binary is linux-x64 only (`release.yml:218`) and no signing of binaries/manifests was found (S-03). pi at b2602be7 ships 6 platforms with SHA256SUMS and no signing (verified). | **OPEN** (unchanged on publish; partial on binaries) |
| 2 | **Honest evidence** — session-id provenance on every pack/red-team score; gate refuses without | Real responder with no synthetic fallback and session ids threaded (E-01). Explicit refusal of unlinked scores not located (E-02). Residual `existsSync` in `gamingResistance.ts` and one `Math.random` in `cli.ts` need inspection. | **PARTIAL** |
| 3 | **Provider breadth + prompt caching** | 6 providers / 8 adapters (was 3); cache read/write *accounting* in every adapter; cache *marker emission* absent (0 hits); no OAuth; no price catalog. pi: 39 catalogued providers at b2602be7 (verified). "Native prompt caching now exists" is **not** supported by this grep — only usage parsing exists. | **OPEN** (breadth partial, caching missing) |
| 4 | **`amc agent` REPL/TUI** | `amc agent chat` exists: readline, streaming flag, SIGINT cancel, interactive approvals, slash skills; session fork/resume via CLI. No full-screen TUI, no session picker/tree, no in-chat fork. | **PARTIAL** (moved from missing) |
| 5 | **Signed code plugins** | `nativeExtensionStore.ts:120-121` refuses unsigned extensions (with a `requireSignature:false` escape used by one CLI command). Whether extensions run as in-process code with hot reload (pi's strength) is not established; no watcher, no dynamic import in `pluginLoader.ts`. | **PARTIAL** |

---

## 3. §7a — daily-use interactions with no AMC equivalent

Comparator interactions (source given). AMC column is what exists at d635a5e2 by grep; "none found" is a grep result, not a runtime test.

| Interaction | Comparator source | AMC equivalent |
|---|---|---|
| `/compact` in-session | dsh `packages/compaction/command-compact` (`name: 'compact'`, present subset) | CLI `amc … session compaction` commands only; none found in chat |
| `/goal` autonomy rounds from the prompt line | dsh `goal/command-goal` (`name: 'goal'`) | `src/autonomy/goalRounds.ts`; no chat command found |
| `/permission` + named presets (`danger-full-access`, `workspace-write`) switched live | dsh `interaction/commands`, `permission-presets` | `.amc/agents.yaml` presets at process start; no live switch found |
| `/feedback` | dsh `feedback/command-feedback` | none found |
| Approval panel / composer takeover, question cards | dsh `client/ui-approval`, `ui-user-questions`, `interaction/tool-ask-user` | `interactiveApprovals` in chat (I-01); no `ask_user` tool |
| Model selection in-session | dsh `client/ui-model-selection`, `ui-settings-models` | none found in chat |
| Plan mode | dsh `plan/plan-mode`, `client/ui-plan` | none found |
| Jobs / schedule / subagent / workflow-run panels, trajectory view | dsh `client/ui-jobs`, `ui-schedule`, `ui-subagent`, `ui-workflow-run`, `ui-trajectory` | CLI commands exist for schedule/workflow; no UI |
| `/fork`, `/tree`, `/resume` picker, labels | pi session-manager @ b2602be7 (`branch`, `forkFrom`, `appendLabelChange`); TUI commands **carried** | fork/resume via CLI (`sessionResume.ts`); no picker, no labels |
| `/reload` hot-reload extensions, `pi install npm:/git:` | pi — **carried** | none (G-07) |
| `/share` session to gist | pi — **carried** | none found (AMC would need a signed export; not present) |
| `!` routes a command into the sandbox environment | pi README @ b2602be7 (fetched) | none found |
| Themes | pi `pi-tui` — **carried** | none |
| Cache hit rate shown to the user | pi usage — **carried**; dsh `session/session-stats` (dir) | cache tokens recorded (L-03); no display found |

AMC interactions with no comparator equivalent (for symmetry, not superiority): signed session verification (`amc agent session verify/proof/verify-proof`), `amc doctor`/`doctor-fix`, `amc firewall enable`, approval quorum CLI.

---

## 4. Not exercised in this run — and the exact next step

1. Re-clone dsh at `c389f96` into a fresh directory (the `/tmp` clone has no `.git/HEAD` and lacks ~25 package groups' sources) and re-run: `grep -rlE 'hmac|ed25519|signature' packages/session`, `grep -rlE 'costLimit|spendLimit|budget' packages/llm`, `grep -rlE 'prompt.?injection|firewall' packages/guard packages/session`, `ls packages/sandbox/*/src`, `grep -rl node-pty packages/terminal`.
2. Fetch at pi `b2602be7`: `packages/ai/src/providers/anthropic.ts` (cache_control), `openai-codex.ts` (OAuth), `packages/coding-agent/src/core/extensions/*` (jiti/reload) — to convert L-02, L-04, G-07 pi cells from carried to verified.
3. Run (after `pnpm install --frozen-lockfile --prefer-offline` + `pnpm build`): `amc agent chat` and `amc agent run` to record streaming/cancel/approval behaviour; `amc doctor` on a clean workspace for the §7a first-run protocol.
4. Inspect `src/cli.ts` remaining `Math.random` site and `src/score/gamingResistance.ts` `existsSync` targets; if any still read AMC's own repo, that is a G1-class facade and belongs in `plans/amc-gap-register.md` too.
5. Locate the assurance score refusal (E-02) and mutation-test it (break the session-id link, confirm RED).
6. Measure S-04 (pins, audit CI) and G-11 (SIEM) before claiming either direction.

## 5. What this register does not say

No row claims AMC is better than, 10x, or the standard against dsh or pi. "AMC-ahead" marks presence of a mechanism at d635a5e2 with the cited file; it says nothing about quality, and several AMC-ahead rows carry unresolved caveats from the previous register (AMC-1525 key admission; `AMC_NO_SIGN`; approval wiring to model tool calls). Market-breadth comparison (Claude Code, Codex CLI, Gemini CLI, OpenCode, Cursor CLI, Aider, Hermes) was **not evaluated** here.
