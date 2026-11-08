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

The acceptance binds more than the file. `["node", ".amc/hooks/check.js"]` runs the script, the script is workspace content too, and so is anything it `require`s. So every workspace file a hook may load must live under **`.amc/hooks/`**, the directory AMC's own tools never write (`.amc/**` is protected), and the trust value is the file's sha256 bound to the sha256 of **every regular file in that tree**, local imports included. When the tree is empty the trust value is simply the file's sha256. Every argv item is checked at load, and so are its whitespace-separated words, the value parts of `NAME=value` and `--flag=value` (split on `,` and the `PATH` separator) and an attached short-option value (`-c./conf.js`): one that names a workspace path anywhere else (`scripts/guard.js`, `PYTHONPATH=./scripts`, an absolute path into the workspace, or an alias spelling of one such as macOS `/var` for `/private/var`), a workspace directory, or the workspace itself (`node .` runs its package entry point; the workspace path is in the hook input's `cwd` and in `AMC_WORKSPACE`) is refused. Paths are compared by canonical location, never as strings. The code-loading flags of common interpreters are refused too: inline programs, required modules, include paths and interactive modes (`node`/`bun`/`tsx -e|-p|-r|-i|--require|--import|--loader`, `python -c|-m|-i`, `sh|bash|zsh|fish -c|-s|-i`, `ruby -e|-r|-I`, `perl -e|-E|-M|-m|-I`, `php -r`, `lua -e|-l`, `deno eval`, PowerShell `-Command`/`-EncodedCommand` and their prefixes, `cmd /c|/k`, and others), wherever the interpreter appears in the command (`env node -e`, `nice python3 -c` and `env -S "node -e …"` count) and inside short-flag clusters (`-pe`, `-Bc`, `-xc`); options after the script are the script's own. An interpreter given `-`, `/dev/stdin` or no script at all is refused, because it would read its program from stdin, which is the hook input and carries model-influenced text. `/proc/*` and `/dev/fd/*` paths are refused. A symlink, a special file or a file over 4 MiB under `.amc/hooks/` cannot be bound and makes the file invalid; the tree holds at most 256 files.

**Review before you accept.** `hooks inspect` shows, for an untrusted file too, the parsed handlers, every `bound workspace file` with its digest, and `trust value (--sha256): …`. The value you type is that mark, so accepting commits you to the exact script digests you reviewed; a file digest alone is refused when the tree has files. The bound files are re-checked immediately before every hook spawn; editing one makes the file untrusted again and the refusal names the file that changed (`.amc/hooks/lib/policy.js changed since this machine trusted …`) together with the new value to accept. A `trust` that cannot be recorded (read-only AMC home) is an error, never a success message.

Not covered, so keep hook logic in self-contained scripts under `.amc/hooks/`: code a bound script loads from OUTSIDE `.amc/hooks/` (a `node_modules` or Python package found by walking up from the script, a path it computes at run time) is not bound; these argv checks are not a parser for every program, so inline programs (`awk`, `sed`, `jq`) and tools that read scripts or configuration from the working directory or its parents on their own (`npm run`, `make`, test runners, linters with JavaScript configs) run whatever those workspace files say at that moment; and a concurrent writer can still replace a bound script in the instant between the pre-spawn check and the interpreter opening it. Hooks run unconfined with your rights.

Programs: an absolute path runs as written (inside the workspace it must be under `.amc/hooks/`); a bare name (`node`, `python3`) is found in an absolute `PATH` entry, never in the working directory, on Windows too; a bare name whose canonical location is inside the workspace (including through a symlinked `PATH` entry) is refused, because the environment rather than the accepted file chose the code. A relative program path (`./scripts/hook.sh`, `scripts/hook.sh`) is refused at load. The hook process gets a `PATH` with only the absolute entries that lie outside the workspace, so a hook's own bare commands never resolve into it either (a workspace `node_modules/.bin` that `npm run` put on `PATH` is dropped).

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
