# Native command hooks (`.amc/hooks.json`)

AMC's native loop runs operator-configured command hooks from `<workspace>/.amc/hooks.json` on every platform. The file uses Claude Code's `hooks.json` shape so a team can carry one file across harnesses, but the authority model is AMC's (decision D55): a hook observes, or denies on the two deny-capable events. It can never allow a call, rewrite arguments, add context, ask on the model's behalf, or reach past the signed approval gate. Signed executable extensions keep their own Linux-confined hook path (see [NATIVE_EXTENSIONS.md](NATIVE_EXTENSIONS.md)); the two run in the same pipeline and either can deny.

## File shape

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "fs.write|fs.edit|bash", "hooks": [{ "type": "command", "command": ["node", "scripts/guard.js"], "timeout": 5 }] }
    ],
    "PostToolUse": [{ "matcher": "mcp_github_*", "hooks": [{ "type": "command", "command": "node scripts/audit.js" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": ["node", "scripts/no-secrets.js"] }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": ["node", "scripts/notify.js"] }] }]
  }
}
```

- Events this build fires: `PreToolUse` (deny-capable), `PostToolUse`, `UserPromptSubmit` (deny-capable) and `Stop`. `SessionStart`, `SessionEnd`, `SubagentStop`, `PreCompact` and `Notification` parse, so one carried file loads, but nothing fires them yet; `hooks inspect` marks them `not emitted by this build`.
- `type` is `command` only. `command` is an argv array, or a string split on whitespace. Nothing is shell-interpreted; there are no HTTP hooks.
- Matchers are exact AMC tool names (`fs.write`, `bash`, `skill.load`, `mcp_<server>_<hash>`), `|`-separated lists, or a trailing `*` prefix glob. Regular expressions are refused at load, so there is no pattern-matching surface. A Claude name such as `Write` loads but matches nothing; `hooks inspect` lists the built-in tools each matcher reaches and warns when a deny-capable matcher reaches none.
- `timeout` is in seconds, 1 to 60 (default 10). At most 32 handlers, 64 KiB per file.

## Trust: the file runs only after you accept its exact bytes on this machine

A hooks.json is workspace content that causes commands to run with your rights. A signature made with the workspace's own keyset would not do, because AMC adopts an unseen keyset on first use and a cloned repository could sign its own hooks. So the file runs only after `amc native-extension hooks trust --sha256 <digest>` recorded its exact sha256 in this machine's AMC home (`$AMC_HOME/state/high-water.json`, outside every workspace). Any byte change needs a new acceptance.

Until it is accepted, the file is not ignored: `PreToolUse` and `UserPromptSubmit` deny every call with the reason, `PostToolUse` and `Stop` record a `HOOKS_UNTRUSTED` report. A guard you configured must not switch itself off because someone edited the file.

The acceptance binds more than the file. `["node", ".amc/hooks/check.js"]` runs the script, and the script is workspace content too, so the recorded mark is the file digest bound to the digest of every workspace file the argv names: the program when it sits inside the workspace, and any argument that names a regular workspace file. `hooks inspect` and `hooks trust` list them as `bound workspace file`. They are re-checked before every run; editing one makes the file untrusted again until you run `hooks trust` with the same `--sha256` (the file did not change; its bound scripts did). A symlink or a file over 4 MiB cannot be bound and makes the file invalid.

Programs: an absolute path runs as written; a bare name (`node`, `python3`) is found in an absolute `PATH` entry, never in the working directory, on Windows too; a bare name that lands inside the workspace is refused, because the environment rather than the accepted file chose the code. A relative program path (`./scripts/hook.sh`, `scripts/hook.sh`) is refused at load.

```text
amc native-extension hooks inspect            # path, sha256, trust state, resolved handlers; runs nothing
amc native-extension hooks trust --sha256 …   # accept these exact bytes on this machine
amc native-extension hooks test PreToolUse --tool fs.write   # run the matching handlers with a synthetic input
```

## What a hook receives and may answer

JSON on stdin, with Claude Code's field names: `hook_event_name`, `session_id` (null before a session exists), `cwd`, and per event:

- `PreToolUse`: `tool_name`, `tool_use_id`, `action_class`, `requested_mode`, `tool_input` (the exact frozen arguments, so the guard decides on the bytes that run; not redacted), `tool_input_sha256`, `tool_input_bytes`. Arguments over 32 KiB are not sent: the call is denied unless the handler declares `"acceptTruncatedInput": true`, in which case it sees `tool_input: null` and `tool_input_truncated: true`.
- `PostToolUse`: `tool_name`, `tool_use_id`, `turn`, `step`, `tool_response: { ok, output_sha256, output_bytes }`. The result text never crosses.
- `UserPromptSubmit`: `prompt` (your own prompt, capped at 32 KiB with the same truncation rule), `prompt_sha256`, `prompt_bytes`.
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
| any other exit, a timeout, a spawn failure, a cancellation | deny (fail closed) |

On an observe event the same failures are reported as `HOOK_FAILED`, `HOOK_TIMEOUT` or `HOOK_SPAWN_FAILED` and never veto anything.

## Where it runs

Command hooks are composed inside `agentToolset`, so the CLI root, a delegated child (`delegate`, `workflow`) and an ACP/SDK session all carry the same guard; a `PreToolUse` denial cannot be routed around through delegation. `PreToolUse` runs after the signed approval gate and before the tool effect, with the other guards; `PostToolUse` and `Stop` run from the loop's existing `tool-end` and `turn-end` observations. `UserPromptSubmit` runs in `amc agent-loop run` (and so in every chat turn, which is a run child) before the turn is composed; a denial is printed and the turn never opens, so there is no session row for it. ACP `session/prompt` does not fire `UserPromptSubmit` yet.

Evidence: a `PreToolUse` denial is the pipeline's guard denial (`guardLabel: native-extensions`, reason prefixed `hooks.json sha256 <digest> PreToolUse #<n>`), recorded exactly as every other guard denial. Handler failures during a turn are the same `metric` rows with `nativeExtensionHook` metadata that executable-extension hooks produce, with `extensionId: "hooks.json"` and the file digest as `manifestDigest`.

## Limits and intentional differences

- No `allow`, `updatedInput`, `additionalContext`, `ask` or HTTP hooks: D55.
- No `~/.amc/hooks.json` user file yet: home config is an unreviewed input unless the operator opts in, and the opt-in is not wired for hooks.
- A `PostToolUse` handler sees the result digest, not its text; a hook that needs text reads the signed session with `amc` itself.
- Hooks in plugin bundles are not loaded (deferred: they would run publisher code unconfined).
