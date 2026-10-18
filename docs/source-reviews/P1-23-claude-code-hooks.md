# P1-23 - Claude Code hooks: the pinned contract AMC relies on

- Plan item: `P1-23` (builds on AMC-1463, AMC-1464 and P0-42)
- Pinned release: `@anthropic-ai/claude-code@2.1.296` (npm, published 2026-10-09)
- Retrieval: documentation and package retrieved 2026-10-11 23:26 UTC; payloads recorded the same day from the binary
- Status: the contract below is what AMC's code uses; a field or behaviour not listed here is not used

## Pinned release

| Artifact | Value |
| --- | --- |
| Wrapper package | `@anthropic-ai/claude-code@2.1.296`, integrity `sha512-OX/k/rpcthMqnFKOWcpNcbiLsMKtAjLOpQNJHlYiDCFUznWCIwdRTyl/p9SdHVrsrzZuPMCNqZjnpakIni6upw==` |
| Native package (macOS arm64) | `@anthropic-ai/claude-code-darwin-arm64@2.1.296`, integrity `sha512-vqtx3kS3r1hNLMk+N8JMG5J4kcLHIbI3t/NSIdcFQZrRVCFA6NtcxJyn/B+Sf3GxJaFJOCEfoBQXsFo10+Oj9A==` |
| Native binary | `claude`, SHA-256 `c9b5341637becbd423ddffc5b254afb645682a3868cb708bbc6cc0e7bb419937`; `claude --version` prints `2.1.296 (Claude Code)` |
| Linux packages (same version) | `claude-code-linux-x64` `sha512-+m01urgelnI+VJxPaKPEK0wixgq42uZ8PeCaUk5tX/8YoDBvSmC/REVQG2jQfJAr8dxunpjJ600FvLrcj1WWTw==`, `claude-code-linux-arm64` `sha512-Q6Qh6qFmwuBG9rQFiDR6bY3XkFnwTN9AAPrnnDgBvr9sbg1Ql5wrf0lfoCDiV369EUHOzxI4i5OdHW9Vf2/oeA==` (not run) |

The npm wrapper's `bin/claude.exe` is a placeholder until its `install.cjs` copies or hard-links the platform package's `claude` over it; AMC's conformance test runs the platform binary directly. Only darwin-arm64 was run.

## Documents (pinned by SHA-256 of the retrieved bytes)

| Page | URL | SHA-256 |
| --- | --- | --- |
| Hooks reference | `https://code.claude.com/docs/en/hooks.md` | `31754d5adce5052af35acf85dc2ed207bb082b7dbf87f25218047b10a024a073` (now `CLAUDE_CODE_HOOK_SOURCE.reference`) |
| Hooks guide | `https://code.claude.com/docs/en/hooks-guide.md` | `23c91d7cbe6086c6bd5c789554cfef6649785fafe71f1fadc510f3572994a083` |
| Settings | `https://code.claude.com/docs/en/settings.md` | `a8cc395af5e0938659ddfd38a703bdc8a5151640216c5230098408e30625e380` |
| Settings reference | `https://code.claude.com/docs/en/settings-reference.md` | `4bec5505c7f33da3284848047b7e0c90148d777daf90b4cfda9da0a64878de08` |
| Managed settings | `https://code.claude.com/docs/en/managed-settings.md` | `6bfb4f806ac254c5562baa28422c7c329ebc57353d95b9106e2a354390e5443c` |
| Server-managed settings | `https://code.claude.com/docs/en/server-managed-settings.md` | `13159513774345f8c44ac838e1f4e849752298d9bd7ecb4c936120bf6b5b8e05` |
| Identity and access (cited by the strategy) | `https://code.claude.com/docs/en/iam.md` | `c43ef3e8ddcb34ff6ba8b8d9e72276326ba7b672cd99f1252d5167c111ce67ac` |
| Environment variables | `https://code.claude.com/docs/en/env-vars.md` | `8097c27c0a5dd4b3428a61a9d3a79eb33b57c8eb30a3e5422d471d64c98f515f` |
| Changelog | `https://code.claude.com/docs/en/changelog.md` | `ec94562ba87d7910b82cfb83223ba14bf3b39e9901b69b4487c907b661023e3a` |

The previous pin (`sha256:e94e7218…32e1`, July 2026) is superseded; installations made under it are refused until reinstalled.

## Every hook event (hooks reference, "Hook lifecycle" and "Exit code 2 behavior per event")

| Event | Fires | Can block | Exit 2 | AMC installs |
| --- | --- | --- | --- | --- |
| `SessionStart` | session begins, resumes, `/clear`, compaction, fork | no | stderr shown to the user only | control mode |
| `Setup` | `--init-only`, or `--init`/`--maintenance` with `-p` | no | ignored | no |
| `UserPromptSubmit` | a prompt is submitted (also scheduled tasks, subagent reports, cross-session messages) | yes | blocks the prompt | control mode |
| `UserPromptExpansion` | a typed command expands into a prompt | yes | blocks the expansion | no |
| `PreToolUse` | before a tool call executes (not `EndConversation`) | yes | blocks the tool call | both modes |
| `PermissionRequest` | a tool call needs a permission decision | via JSON only | not honoured | no |
| `PermissionDenied` | auto mode denies a call | no | ignored | no |
| `PostToolUse` | a tool call succeeded | no | stderr shown to Claude | both modes |
| `PostToolUseFailure` | a tool call failed after it started | no | stderr shown to Claude | both modes |
| `PostToolBatch` | a batch of parallel calls resolved | yes | stops the loop before the next model call | no |
| `Notification` | Claude Code sends a notification | no | ignored | no |
| `MessageDisplay` | assistant text is displayed | no | original text shown | no |
| `SubagentStart` | a subagent is spawned | no | stderr shown to the user | no |
| `SubagentStop` | a subagent finishes | yes | keeps the subagent working | no |
| `TaskCreated` | `TaskCreate` creates a task | yes | rolls the task back | no |
| `TaskCompleted` | a task is marked completed | yes | keeps it open | no |
| `Stop` | the main agent finishes responding | yes | keeps Claude working | control mode (never exits 2) |
| `StopFailure` | the turn ends on an API error | no | ignored | no |
| `TeammateIdle` | a teammate is about to go idle | yes | keeps it working | no |
| `InstructionsLoaded` | a CLAUDE.md or rules file is loaded | no | ignored | no |
| `ConfigChange` | a configuration file changes mid-session | yes (not `policy_settings`) | blocks the change | no (follow-up) |
| `CwdChanged` | the working directory changes | no | stderr shown to the user | no |
| `DirectoryAdded` | a directory is added mid-session | no | debug log | no |
| `FileChanged` | a watched file changes | no | stderr shown to the user | no |
| `WorktreeCreate` | a worktree is created | yes | creation fails on any non-zero exit | no |
| `WorktreeRemove` | a created worktree is removed | yes | removal fails | no |
| `PreCompact` | before compaction | yes | blocks compaction | no |
| `PostCompact` | after compaction | no | stderr shown to the user | no |
| `PreModelSwitch` | before a requested model switch | yes | blocks the switch | no |
| `PostModelSwitch` | after the model changed | no | stderr shown to the user | no |
| `Elicitation` | an MCP server requests input | yes | declines | no |
| `ElicitationResult` | after the user answers an elicitation | yes | blocks the response | no |
| `SessionEnd` | the session terminates | no | stderr shown to the user | no |

## The six events AMC installs

Input fields come from the reference and from the payloads recorded from 2.1.296 (`tests/fixtures/harness-hooks/claude-code/2.1.296/`). Common fields: `session_id`, `transcript_path`, `cwd`, `prompt_id` (absent before the first prompt), `permission_mode` (`default`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`; not on every event), `hook_event_name`; optional `scratchpad_dir`, `effort.level`, `agent_id`, `agent_type`.

| Event | Event fields | Blocking output AMC uses | Notes |
| --- | --- | --- | --- |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id`; `mcp_server { name, source }` for MCP tools | `hookSpecificOutput.permissionDecision` `allow` or `deny` with `permissionDecisionReason`; every deny also exits 2 | `deny > defer > ask > allow` across hooks; `updatedInput` replaces the whole input; for `Write`, `Edit` and `Read`, `file_path` is always absolute (Claude Code expands `~` and relative paths before hooks run) |
| `PostToolUse` | the above plus `tool_response`, `duration_ms` | none (AMC returns `{}`) | `tool_input` is the input that ran |
| `PostToolUseFailure` | the above plus `error`, `is_interrupt`, `duration_ms` | none | does not fire for calls rejected before execution |
| `SessionStart` | `source` (`startup`, `resume`, `clear`, `compact`, `fork`); optional `model`, `agent_type`, `session_title`, resume-cost fields | none (cannot block) | runs again on resume and fork; the hook gets `CLAUDE_ENV_FILE` |
| `UserPromptSubmit` | `prompt`; optional `session_title` | `decision: "block"` with `reason`, `hookSpecificOutput.suppressOriginalPrompt: true`; also exit 2 | default timeout 30 s; a blocked prompt can still sit in local transcripts |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` | none: exit 2 or `decision: "block"` keeps Claude working, so AMC always exits 0 | 8-continuation cap applies to other Stop hooks |

The input of every tool AMC maps is pinned from the release's own `sdk-tools.d.ts`: `BashInput { command, timeout?, description?, run_in_background?, dangerouslyDisableSandbox? }`, `FileReadInput { file_path, offset?, limit?, pages?, allow_large? }`, `FileWriteInput { file_path, content }`, `FileEditInput { file_path, old_string, new_string, replace_all? }`, `GlobInput { pattern, path? }`, `GrepInput { pattern, path?, glob?, output_mode?, -B?, -A?, -C?, context?, -n?, -i?, -o?, type?, head_limit?, offset?, multiline? }`, `WebFetchInput { url, prompt, offset? }`. In a `-p` run of 2.1.296 the tool list offered to the model was `Agent, Bash, Cron*, Edit, EnterWorktree, ExitWorktree, ListAgents, NotebookEdit, Read, ReportFindings, ScheduleWakeup, SendMessage, Skill, Task*, WebFetch, WebSearch, Workflow, Write` and the configured MCP tools; `Glob` and `Grep` are documented but were not offered in that run, and `MultiEdit` is not a 2.1.296 tool.

## Handler fields, exit codes and timeouts

- Command handler fields used: `type`, `command`, `args` (exec form: no shell; `command` resolved as an executable, `args` passed as the argument vector), `timeout` (seconds), `statusMessage` (common field: "custom spinner message"), `onFailure` (`continue` default or `block`; "Requires Claude Code v2.1.295 or later").
- Exit 0 with a JSON object that passes validation: the fields decide. Exit 2: a blocking error on blockable events, even if the JSON says allow. Any other exit, a hook that cannot start, invalid JSON or a timeout: a non-blocking error and the action proceeds, unless `onFailure: "block"`, which makes each of these do what exit 2 does (except on `Stop`, `SubagentStop`, `TaskCompleted`, `TeammateIdle` and background hooks, where it has no effect).
- Default timeout 600 s for command hooks, 30 s for `UserPromptSubmit`; a timed-out `PreToolUse` command hook does not block unless `onFailure: "block"`.
- Recorded against the binary (harness runs, outbound network denied by `sandbox-exec`): with `onFailure: "block"` a missing script, a 2 s timeout and an exit 1 each blocked a Bash call (no marker file); without it, a missing script let the call run. A foreign `PreToolUse` hook returning `allow` with `updatedInput` rewrote a Bash command after another hook's decision, and `PostToolUse` reported the rewritten input.
- Hooks run in the current directory with Claude Code's environment; the recorded environment included `CLAUDE_PROJECT_DIR`, `CLAUDE_PID` (Claude Code's process), `CLAUDE_CODE_SESSION_ID` and `CLAUDECODE=1`, and no version variable.

## Configuration changes mid-session

"Direct edits to hooks in settings files are normally picked up automatically by the file watcher." Claude Code runs `ConfigChange` hooks for settings-file changes, not for managed settings from MDM or the console. File-based managed settings are "read at startup and reloaded when a file changes"; MDM policy is checked every 30 minutes; server-managed settings are fetched at startup and polled hourly, and a delivered hook waits for the developer to accept a security approval dialog in an interactive session.

## Managed settings

- File-based: `managed-settings.json` plus `managed-settings.d/*.json` (merged in name order) in `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux, WSL) and `C:\Program Files\ClaudeCode\` (Windows). An unparseable managed file stops Claude Code from starting.
- Other managed sources: the macOS `com.anthropic.claudecode` profile, Windows `HKLM` (and `HKCU`) registry values, and server-managed settings from the claude.ai console or a Claude apps gateway. By default (`managedSourcesBehavior: "first-wins"`) the highest-ranked source with a policy key is used and the rest ignored. Server-managed settings are skipped when `ANTHROPIC_BASE_URL` is non-default or a third-party provider is selected.
- `allowManagedHooksOnly: true` (managed scope only): managed hooks, Agent SDK hooks and hooks of plugins force-enabled in managed `enabledPlugins` run; user, project, local and other plugin hooks and agent-frontmatter hooks are blocked.
- `disableAllHooks`: in managed settings it disables every hook; elsewhere it disables user, project, local and plugin hooks but not managed ones. `--settings '{"disableAllHooks": true}'` turns off non-managed hooks for one run.
- Workspace trust: interactive sessions hold back hooks from every settings file until the folder's trust dialog is accepted; `-p` and SDK sessions treat the folder as trusted.

## What AMC uses, and what it deliberately does not

- Used: exactly the fields above, `args` exec form, `onFailure: "block"` on control handlers, `statusMessage` to find AMC's handlers, exit 2 on every PreToolUse and UserPromptSubmit refusal, `suppressOriginalPrompt`.
- Not used: `ask` (a provider-local ask is not AMC approval), `defer`, `updatedInput`, `additionalContext` except the existing corrective steer, `PermissionRequest`, HTTP, MCP-tool, prompt and agent hooks, `async`.
- Not covered by AMC's settings scan: MDM profiles, registry policy, server-managed settings, plugin and mod hooks, skill and agent frontmatter hooks, `--settings` and Agent SDK callbacks.
