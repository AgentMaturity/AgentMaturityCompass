# P2-17 - Codex hooks: the pinned contract and why AMC claims no enforcement

- Plan item: `P2-17` part B
- Pinned release: `@openai/codex@0.165.0` (npm `latest`, published 2026-10-27 20:14 UTC), integrity
  `sha512-aiwtQVp2KBhJld966CuU5bVfQ46VNB4mNTl6giX3WGZdt4euI3tv2RUqJpnupPNA8DXHg2z+RoQ0Zfw87dy8Lw==`
- Source reviewed: tag `rust-v0.165.0` of `github.com/openai/codex` (tag object `e374836b2728d9b7aa981c2902649e640a2edaa8`), commit
  `360319d8dee62d87e2d59fc0c21805d79519cfed` (2026-10-27). The npm package carries no `gitHead`; the tag is the link
  between the two, and it is not verified that the published binary was built from that commit.
- Retrieval: 2026-10-28, source files read from `raw.githubusercontent.com` at that commit.
- Binary: **not run**. No Codex binary was installed or executed for this review, so no payload was recorded from it.

## Verdict

At 0.165.0 Codex has a blocking `PreToolUse` hook, but it **fails open**. When AMC's handler cannot answer, the tool
call runs. Under the adapter conformance class an enforced hook must block on failure, so AMC claims **no
enforcement** for Codex at this version. AMC ships no Codex provider or installer: an AMC control hook on a harness that
proceeds when the hook fails would read as governance it cannot deliver. The manifest
(`docs/adapters/manifests/codex.json`) says "unsupported" with this reason.

Re-review when a Codex release lets an operator make `PreToolUse` failures block (for example a per-handler
`onFailure` or a fail-closed setting), and record payloads from that binary before any claim.

## Contract at the pin

### Events and payload

Hook events (generated schemas under `codex-rs/hooks/schema/generated/`): `PreToolUse`, `PostToolUse`,
`PermissionRequest`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`,
`PreCompact`, `PostCompact`, `Interrupt`, `ModelRequest`.

`PreToolUse` stdin (`pre-tool-use.command.input.schema.json`, `additionalProperties: false`): `session_id`, `turn_id`,
`transcript_path` (nullable), `cwd`, `hook_event_name` (`"PreToolUse"`), `model`, `permission_mode` (`default`,
`acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`), `tool_name`, `tool_use_id`, `tool_input` (any JSON); optional
`agent_id`, `agent_type` for subagents.

Tool names (`core/src/tools/hook_names.rs`): shell-like tools serialize as `Bash` with `tool_input` `{ "command": … }`;
file edits as `apply_patch` (matcher aliases `Write`, `Edit`); sub-agent creation as `spawn_agent` (alias `Agent`); MCP
tools pass their resolved JSON arguments.

### Blocking semantics

From `hooks/src/events/pre_tool_use.rs` (`parse_completed`) and `hooks/src/engine/output_parser.rs`
(`parse_pre_tool_use`):

- Exit 0 with JSON `hookSpecificOutput.permissionDecision: "deny"` and a non-empty `permissionDecisionReason`, or legacy
  `decision: "block"` with a non-empty `reason`, blocks.
- Exit 2 with a non-empty stderr blocks.
- Exit 0 with empty stdout, or `permissionDecision: "allow"`/`"ask"`, does not block.

### Failure behaviour (fails open)

Each of these leaves `should_block = false`, so the call proceeds:

- the handler cannot start, or times out (`hook timed out after <n>s`, `engine/command_runner.rs`);
- any exit code other than 0 or 2, or no exit code;
- exit 2 with empty stderr;
- stdout that looks like JSON but does not parse, or JSON with an unsupported field (`continue: false`, `stopReason`,
  `suppressOutput`): the run is marked `Failed`, not blocked;
- a `deny` whose reason is empty or whitespace;
- the hook input cannot be serialized (`serialization_failure_outcome`).

### Timeouts

`PreToolUse` handlers default to 600 seconds, minimum 1 (`normalize_command_hook` in `engine/discovery.rs`). A timeout
is a failure, so the call proceeds.

### Configuration and trust

- Hooks come from `hooks.json` in a config folder and from `[hooks]` in `config.toml` layers (user, project
  `.codex/`, session flags), and from managed `requirements.toml` layers (`engine/discovery.rs`).
- A non-managed, non-built-in hook runs only when its normalized identity hash equals a `trusted_hash` the user has
  recorded; otherwise it is `Untrusted` or `Modified` and is **not run** (`hook_trust_status`), so the call proceeds
  ungoverned.
- `allow_managed_hooks_only = true` in `requirements.toml` ignores user, project and session hooks (`docs/config.md`).
- Several handlers can match. `updatedInput` from an allowing handler rewrites the tool input; the rewrite from the
  handler that finished last wins. Another hook can therefore change a call after AMC allows it.

### Coverage

`PreToolUse` runs only for tools whose handler returns a `pre_tool_use_payload` (`core/src/tools/registry.rs`); the
default returns one only for function-call payloads. Not verified: which non-function payloads (custom or freeform
tools) skip `PreToolUse`. To check, review each `pre_tool_use_payload` override under `core/src/tools/handlers/`.

## Files reviewed (SHA-256 of the retrieved bytes)

| File at `360319d8` | SHA-256 |
| --- | --- |
| `docs/config.md` | `745768b4da6cd73e414fc49c5c6ef3d6bf8a0c08289fab23a7dd79776ab31d9d` |
| `codex-rs/config/src/hook_config.rs` | `4770495c0005de296cb86ebbaa6ab8c9486c4fa336d3d748ed7389901dab7e5d` |
| `codex-rs/core/src/hook_runtime.rs` | `d0544d1f180a1f33e59af86aadcb89e207031276d9644a1f6e9a3711cf0797c7` |
| `codex-rs/core/src/tools/hook_names.rs` | `ab0f235f27bc063feb6468d8d0d57201a08538798cfe45dd8008eab60d991553` |
| `codex-rs/core/src/tools/registry.rs` | `fa928f78a1c2b06778d97138c195f46c574072e4538a9cb99bdec33ecd171a15` |
| `codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json` | `fabed428f0fe75767c5700208b166da5faef4e031d601dfc8bff2f96d340c682` |
| `codex-rs/hooks/schema/generated/pre-tool-use.command.output.schema.json` | `e684f81c63fbb5972892f6a848b49fec68c8ce137931651093d2dd1da56a1dd6` |
| `codex-rs/hooks/src/engine/command_runner.rs` | `8f30ad4d5f31633822b3718dd3e967df98a17b1b0fd42c9a12f8cb52973c3166` |
| `codex-rs/hooks/src/engine/discovery.rs` | `b813f8c14d796dd1553d00453b343b2a90e555e98f1d48e8d5749d69c24a5efd` |
| `codex-rs/hooks/src/engine/dispatcher.rs` | `3c99e738c62679598ba66f41d528d98fbf19920b419fa611d6786086671ea882` |
| `codex-rs/hooks/src/engine/output_parser.rs` | `ae4b2a80569025e97d3ca39d5f4b7383c1c836ca29fe3980f18029ac4e00336f` |
| `codex-rs/hooks/src/events/pre_tool_use.rs` | `a65a5303590ac362d7824519ab6282ba1d8ecbf1ba2fbc9010d6da252d66744f` |
| `codex-rs/hooks/src/events/post_tool_use.rs` | `ed747205106036a354351707a7b5124cdf9929a6dc5cfa774f58648cb40bec67` |

## Pending

- Recording payloads from the pinned binary (needs an approved install of `@openai/codex@0.165.0` into a scratch
  prefix and a loopback scripted model provider). Not needed for the current verdict, which rests on source.
- Observe mode through `PostToolUse` is not built: it would need a Codex ingestion path, and `hookIngress.ts` must not
  grow under P2-17. Proposed as a follow-up item.
