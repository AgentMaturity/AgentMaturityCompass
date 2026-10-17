# Claude Code hooks: what AMC enforces and records

This page states what AMC claims for each Claude Code hook in control mode, how to install and deliver the hooks, and
where the claim stops. The Claude Code contract it relies on is pinned in
`docs/source-reviews/P1-23-claude-code-hooks.md` in the repository.

- Qualified Claude Code release: **2.1.296** (macOS arm64 run against AMC; Linux packages pinned, not run; Windows not verified).
- Any other release is refused at registration, so its sessions are not governed.

## The claim, per hook

| Hook | What AMC claims | Can it stop the call? | When AMC cannot answer |
| --- | --- | --- | --- |
| `PreToolUse` | **Enforced, as a restriction.** AMC only restricts: a call runs only when AMC does not deny it and Claude Code's own permissions allow it. Only one function in AMC's forwarder lets a call through (exit 0 with an empty answer, no permission decision): it needs AMC's signed, sealed decision for these exact payload bytes and a fresh nonce, for the action derived from this `session_id` and `tool_use_id`, under a qualified session registration. Everything else is denied with exit 2. | Yes | Deny, exit 2 (`onFailure: "block"` also covers a hook that cannot start or times out) |
| `UserPromptSubmit` | **Admission.** The prompt proceeds only on AMC's signed admission row for its digest and session (lease valid, signed policies intact, no active freeze). Only the prompt's length and SHA-256 reach AMC; the text is never stored. | Yes | The prompt is blocked |
| `SessionStart` | **Registration (lease-holder attestation).** AMC measures its forwarder, the bound Claude Code binary, the executable of the session's process, the settings Claude Code merges, skill and agent frontmatter and the process's arguments, and records a signed registration. A foreign PreToolUse hook, an enabled plugin, a skill or agent that declares hooks, or `--settings`/`--plugin-dir` refuse it, unless managed settings deliver AMC's hooks with `allowManagedHooksOnly` (then only a plugin managed settings force-enable refuses it). | No | The session is not governed: its tool calls are denied |
| `PostToolUse`, `PostToolUseFailure` | **Observed.** AMC compares the input that ran with the input it authorized (`authorizationMismatch`). A mismatch is observed, not prevented: the tool already ran. | No | A message to Claude; the outcome is not recorded |
| `Stop` | **Observed.** The end of the turn. AMC never asks Claude Code to keep working. | No (AMC never blocks it) | A message only |
| Every other hook | Not installed, so nothing is claimed. | | |

A session without a registration under the current installation is **not governed**: its calls are denied, and
`amc connect hooks status` does not report "enforced" for it. AMC cannot see a session in which Claude Code ran none of
its hooks.

## Install

```bash
amc up                      # the loopback Bridge
amc connect hooks install --provider claude-code --mode control --agent my-agent --dry-run --json
amc connect hooks install --provider claude-code --mode control --agent my-agent
amc connect hooks status --provider claude-code
```

Install with the `claude` you will run on `PATH`: the installation binds that binary's path, version and SHA-256, and a
session running any other binary is not registered. Re-install after upgrading AMC, Node or Claude Code.

The `hooks` block below is the `hooks` field of `--dry-run --json` output. Only two paths are machine-specific and were
replaced: the absolute Node binary that ran the install (`/usr/local/bin/node`) and AMC's forwarder entry (an install
under `/usr/local/lib/node_modules/agent-maturity-compass`). Each handler runs in exec form (`args`, no shell).

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "PostToolUse"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "PostToolUseFailure"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "PreToolUse"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "SessionStart"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "Stop"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/node",
            "args": [
              "/usr/local/lib/node_modules/agent-maturity-compass/dist/adapters/hookForwarder.js",
              "--provider",
              "claude-code",
              "--mode",
              "control",
              "--agent",
              "my-agent",
              "--bridge-url",
              "http://127.0.0.1:3212",
              "--token-file",
              ".amc/hooks/claude-code.lease",
              "--event",
              "UserPromptSubmit"
            ],
            "timeout": 10,
            "statusMessage": "AMC Control [amc-control-v1]",
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

## How an allow is made

1. Claude Code runs AMC's PreToolUse handler. The forwarder reads the payload bytes (at most 256 KiB), reads them the one
   way they can be read (strict UTF-8, no byte-order mark, no repeated key, no lone surrogate) and checks them against the
   bound release's own payload schema.
2. It sends the Bridge those exact bytes with a fresh nonce. The Bridge hashes the bytes, derives the action id from
   `session_id` and `tool_use_id`, checks the session's registration, the audit latch and intake backpressure, and
   evaluates AMC's signed policies on the mapped tool. It records the decision as a signed, sealed ledger row bound to the
   bytes' digest, the targets it resolved and the authorization record.
3. The forwarder lets a call through only through `claudeAllow`, after verifying that row and its receipt, and then
   answers exit 0 with `{}`: no permission decision, so Claude Code's own permission settings and prompts still decide.
   A permission mode (`bypassPermissions`, `dontAsk`, …) never weakens a deny, and a Claude Code `ask` is never AMC
   approval: AMC has no approval path for hook calls, so a call that needs approval is denied.

What is mapped: `Read`, `Glob`, `Grep` (`fs.read`), `Write`, `Edit` (`fs.write`), `WebFetch` (`http.fetch`, canonical
URLs only) and `Bash` in its pure form only: single-quoted words, the first the absolute path of the binary, no shell
syntax (`'/bin/echo' 'hello'`). MCP tools and every other tool are denied as unmapped (mapping MCP tools is a follow-up).

AMC refuses the calls that name or search its own files ("AMC protects its hook configuration."): `Write` or `Edit` of
any `.claude/settings*.json` or of `.amc/**`; `Read` of `.amc/**`; a `Grep` or `Glob` whose search root is in, or holds,
the workspace's `.amc` or `.claude` or the user's `~/.claude` (Claude Code 2.1.296 searches hidden directories, so a
search of the workspace root, its default, is denied: name a subdirectory); and a `Bash` command any of whose words
names `.amc`, a `.claude/settings*.json` file, or a path that resolves into them. This is not containment: a Bash
command can still reach these files through a path it does not name (`'/usr/bin/find' '.'`), and users can edit them
outside Claude Code (`.claude/settings.local.json` stays user-editable).

What AMC re-reads: every decision re-reads the settings files Claude Code merges (managed, user, project, local),
plugins enabled there included, and stops governing a session whose hooks changed. Skill and agent frontmatter and the
process's arguments are read at registration only. Foreign hooks on events that cannot change a call's input (for
example PostToolUse, Stop or Notification) are not refused: they run workspace code outside AMC's decisions.

**Residual window.** AMC resolves each path through symlinks when it decides and binds the decision to the resolved
targets. Claude Code opens the file afterwards; a symlink swapped between AMC's decision and Claude Code's open is outside
what AMC can see.

## When AMC cannot record evidence

- **Audit latch.** If AMC's own writer fails (a disk, signing or chain fault) while recording for a registered session,
  the Bridge latches the workspace's hooks: every hook request of that workspace, any session, event or provider, is
  refused until the owner runs `amc connect hooks health --provider claude-code --recover-latch` (owner mode, vault passphrase), which records the recovery as
  verified evidence first. Restart the Bridge afterwards. The latch is kept in `<AMC home>/state/hook-audit-latch/`, so a
  restart, a new session or a later successful write does not clear it. Malformed, duplicate, oversized, replayed or
  unauthenticated requests are refused and never latch.
- **Intake caps.** Post-tool and Stop observations are capped per session (120 a minute), per lease (360) and per
  workspace (1,200); session registrations per lease (30) and per workspace (60). An observation over a cap is listed in
  a signed summary row (an episode's first refusal at once, then rows of up to 50 ids with their digest), the calls it belongs to read `observationNotRecorded:
  "rate-limited"` in `hooks lifecycle`, and the capped scope's tool calls are denied until its minute passes. Decision rows
  and admission are never capped.

## Managed and server-managed delivery

Project-local settings can be edited by the user. To deliver AMC's handlers where users cannot change them, put the same
`hooks` block in managed settings:

- file-based: `managed-settings.json` or a file in `managed-settings.d/` under `/Library/Application Support/ClaudeCode/`
  (macOS), `/etc/claude-code/` (Linux, WSL) or `C:\Program Files\ClaudeCode\` (Windows);
- or through an MDM profile, registry policy, or server-managed settings from the Claude.ai admin console.

Add `"allowManagedHooksOnly": true` to managed settings to block user, project and local hooks; AMC's status accepts it
when managed settings deliver AMC's exact PreToolUse control handler. Managed `disableAllHooks` stops every hook, and AMC
then refuses to register sessions, so none is governed. AMC reads the file-based managed settings only: MDM, registry and
server-managed settings are not checked, and a server-managed hook waits for the user to accept Claude Code's approval
dialog.

## Latency

The installed PreToolUse handler, spawned against a loopback Bridge, 200 allowed calls (Node 22.23.3):

| Platform | p50 | p95 | Notes |
| --- | --- | --- | --- |
| macOS arm64 (local, 12 cores, load 15) | 566 ms | 680 ms | 200/200 allowed |
| Linux arm64 (colima VM, 4 vCPU, no network) | 670 ms | 768 ms | 200/200 allowed |

Both are far above the 50 ms authorization target. Most of it is starting Node and AMC's modules for each call, then
recording the observation and the decision; the forwarder entry already skips the CLI's start-up.

## Limits

- Registration is a lease-holder attestation: a process holding the installation's hook lease can register a session
  without Claude Code running, and AMC cannot prove Claude Code ran a hook. A session's first registration binds its
  Claude Code configuration directory; a later registration naming another is refused.
- Observations are authenticated by the lease, not by the session: a lease holder can push another session of the same
  lease into backpressure for a minute.
- The hook lease allows 120 requests a minute per Bridge route by default (`--rpm` at install); past it, calls are denied.
- A call whose payload is larger than about 190 KiB is denied: the control request carries it base64-encoded within 256 KiB.
- Windows is not verified; only macOS arm64 ran against Claude Code 2.1.296.
