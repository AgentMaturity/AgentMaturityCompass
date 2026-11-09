# Native command hooks (`.amc/hooks.json`)

AMC's native loop runs operator-configured command hooks from `<workspace>/.amc/hooks.json` on every platform. The file uses Claude Code's `hooks.json` shape so a team can carry one file across harnesses, but the authority model is AMC's (decision D55): a hook observes, or denies on the two deny-capable events. It can never allow a call, rewrite arguments, add context, ask on the model's behalf, or reach past the signed approval gate. Signed executable extensions keep their own Linux-confined hook path (see [NATIVE_EXTENSIONS.md](NATIVE_EXTENSIONS.md)); the two run in the same pipeline and either can deny.

## File shape

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "fs.write|fs.edit|bash", "hooks": [{ "type": "command", "command": ["node", ".amc/hooks/guard.js"], "timeout": 5 }] }
    ],
    "PostToolUse": [{ "matcher": "mcp_github_*", "hooks": [{ "type": "command", "command": "node .amc/hooks/audit.js" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": ["node", ".amc/hooks/no-secrets.js"] }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": ["node", ".amc/hooks/notify.js"] }] }]
  }
}
```

- Events this build fires: `PreToolUse` (deny-capable), `PostToolUse`, `UserPromptSubmit` (deny-capable) and `Stop`. `SessionStart`, `SessionEnd`, `SubagentStop`, `PreCompact` and `Notification` are accepted only so that one file carried from another harness still loads (a file AMC could not load would deny every tool call); AMC never runs their handlers, and `hooks inspect` and `hooks test` mark them `not emitted by this build`.
- `type` is `command` only. `command` is an argv array, or a string split on whitespace. Nothing is shell-interpreted; there are no HTTP hooks.
- Matchers are exact AMC tool names (`fs.write`, `bash`, `skill.load`, `mcp_<server>_<hash>`), `|`-separated lists, or a trailing `*` prefix glob. Regular expressions are refused at load, so there is no pattern-matching surface. A Claude name such as `Write` loads but matches nothing; `hooks inspect` lists the built-in tools each matcher reaches and warns when a deny-capable matcher reaches none.
- `timeout` is in seconds, 1 to 60 (default 10). At most 32 handlers, 64 KiB per file.

## Trust: the file runs only after you accept its trust value on this machine

A hooks.json is workspace content that causes commands to run with your rights. A signature made with the workspace's own keyset would not do, because AMC adopts an unseen keyset on first use and a cloned repository could sign its own hooks. So the file runs only after `amc native-extension hooks trust --sha256 <value>` recorded its **trust value** in this machine's AMC home (`$AMC_HOME/state/high-water.json`, outside every workspace). Any byte change needs a new acceptance.

Until it is accepted, the file is not ignored: `PreToolUse` and `UserPromptSubmit` deny every call with the reason, `PostToolUse` and `Stop` record a `HOOKS_UNTRUSTED` report. A guard you configured must not switch itself off because someone edited the file, and it does not switch itself off because someone deleted or renamed the file either: while this machine holds an acceptance for the workspace and the file is missing, deny-capable events deny with `is missing but this machine trusts a hooks file` until you restore the file or retire the acceptance with `amc native-extension hooks untrust`.

The command must use one of two forms:

- An absolute path to an executable outside the workspace, with no arguments. Bare executables and wrapper commands such as `env`, `nice`, `timeout` and `sudo` are refused.
- An interpreter (`node`, `nodejs`, `python`, `pypy`, `ruby`, `perl`, `sh`, `bash`, `zsh`, `dash`, `ksh` or a versioned name) followed by one existing `.amc/hooks/` file. Use its exact workspace-relative spelling and forward slashes. The interpreter can use an absolute path outside the workspace or a bare name resolved on external `PATH`. Optional script arguments may contain letters, digits, underscores, dots and hyphens and must start with a letter, digit or underscore. Interpreter flags, assignments, and extra file paths are refused.

The trust value binds the hooks.json digest to the digest of every regular file under `.amc/hooks/`, including local imports. When the tree is empty the trust value is the hooks.json digest. Symlinks, hard links, special files and files over 4 MiB are refused. The tree may hold at most 256 files.

**Review before you accept.** `hooks inspect` shows the handlers, each bound file and its digest, and the trust value. Before each spawn, AMC checks the bound tree again. If a file changed, the refusal names it and gives the new value to review and accept. The acceptance record under `$AMC_HOME/state/hooks-trusted/` helps new processes name a changed file. The trust value determines acceptance.

Each hook starts in a private temporary directory. For an interpreter, AMC verifies and copies the accepted bytes into that directory before starting the process. The input's `cwd` and `AMC_WORKSPACE` still identify the actual workspace. The child `PATH` contains only absolute directories outside the workspace. Hooks run with your rights. External executables and code a hook explicitly loads outside the copied tree are the operator's responsibility.
```text
amc native-extension hooks inspect            # path, sha256, trust state, handlers, bound files and the trust value; runs nothing
amc native-extension hooks trust --sha256 …   # accept exactly that trust value on this machine
amc native-extension hooks untrust            # retire this machine's acceptance
amc native-extension hooks test PreToolUse --tool fs.write   # run the matching handlers with a synthetic input
```

## What a hook receives and may answer

JSON on stdin, with Claude Code's field names: `hook_event_name`, `session_id` (null before a session exists), `cwd`, and per event:

- `PreToolUse`: `tool_name`, `tool_use_id`, `action_class`, `requested_mode`, `tool_input` (the exact frozen arguments, so the guard decides on the bytes that run; not redacted), `tool_input_sha256`, `tool_input_bytes`. Arguments over 32 KiB are not sent: the call is denied unless the handler declares `"acceptTruncatedInput": true`, in which case it sees `tool_input: null` and `tool_input_truncated: true`.
- `PostToolUse`: `tool_name`, `tool_use_id`, `turn`, `step`, `tool_response: { ok, output_sha256, output_bytes }`. The result text never crosses.
- `UserPromptSubmit`: `prompt` (the line exactly as you typed it, `/deploy prod` included; for a multi-part prompt in a shared session, every text part joined by newlines; capped at 32 KiB with the same truncation rule), `prompt_sha256`, `prompt_bytes`, and `skill` (the resolved skill or command name, or null), so a hook can deny a command by name. The rendered skill text and media parts are not sent; `--audio-input` and `--steer` text on `agent-loop run` are not submitted to this hook.
- `Stop`: `turn`.

This widens the closed view executable-extension hooks get (metadata only) for `tool_input` and `prompt`. Both go to a local process you configured and accepted by digest.

The process environment is `PATH`, `HOME`, `AMC_HOOK_EVENT` and `AMC_WORKSPACE`: no provider keys, no lease, no credentials.

Answers, on a deny-capable event:

| Hook says | AMC does |
|---|---|
| exit 2 | deny; the first stderr line is the reason |
| exit 0 with `{"decision":"deny","reason":…}`, `{"decision":"block"}` or `{"hookSpecificOutput":{"permissionDecision":"deny",…}}` | deny |
| `permissionDecision: "allow"` or `"approve"` | nothing (an abstention; a hook grants nothing) |
| `permissionDecision: "ask"`, `updatedInput`, `additionalContext`, `updatedPermissions`, `systemMessage`, `continue: false` | deny: the hook asked for authority AMC does not hand a hook |
| exit 0 with plain text or no output | nothing |
| stdout over 64 KiB | deny: the answer could not be read in full (the capture keeps head and tail), so it is not read as an abstention |
| any other exit, a timeout, a spawn failure, a cancellation | deny (fail closed) |

On an observe event the same failures are reported as `HOOK_FAILED`, `HOOK_TIMEOUT` or `HOOK_SPAWN_FAILED` and never veto anything.

## Where it runs

Command hooks are composed inside `agentToolset`, so the CLI root, an in-process delegated child (`delegate`, `workflow`) and an ACP/SDK session all carry the same guard; a `PreToolUse` denial cannot be routed around through in-process delegation. A **foreign** delegate (`--delegate-provider claude-cli`) is Claude Code routed through AMC's gateway, and its tool calls never consult this file, so while a `.amc/hooks.json` is present in the workspace foreign delegation is refused up front. `PreToolUse` runs after the signed approval gate and before the tool effect, with the other guards; `PostToolUse` and `Stop` run from the loop's existing `tool-end` and `turn-end` observations. `UserPromptSubmit` runs in `amc agent-loop run` (and so in every chat turn, which is a run child) before the turn is composed, and in shared sessions (ACP `session/prompt`, the SDK and Studio) before the prompt is queued; a denial is printed or returned as the prompt's refusal reason, and the turn never opens, so there is no session row for it.

Evidence: a `PreToolUse` denial is the pipeline's guard denial (`guardLabel: native-extensions`, reason prefixed `hooks.json sha256 <digest> PreToolUse #<n>`), recorded exactly as every other guard denial. Handler failures during a turn are the same `metric` rows with `nativeExtensionHook` metadata that executable-extension hooks produce, with `extensionId: "hooks.json"` and the file digest as `manifestDigest` (`null`, never a placeholder, when the file could not be read).

## Limits and intentional differences

- No `allow`, `updatedInput`, `additionalContext`, `ask` or HTTP hooks: D55.
- No `~/.amc/hooks.json` user file yet: home config is an unreviewed input unless the operator opts in, and the opt-in is not wired for hooks.
- A `PostToolUse` handler sees the result digest, not its text; a hook that needs text reads the signed session with `amc` itself.
- Hooks in plugin bundles are not loaded (deferred: they would run publisher code unconfined).
