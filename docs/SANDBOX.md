# Sandbox Mode

Sandbox mode executes agent commands in Docker and writes explicit sandbox attestation evidence.

## Native shell by platform

The native `bash` tool is offered to an agent only when AMC can confine it, or
when an operator explicitly accepts an unconfined shell on macOS. AMC decides
this once when it composes the agent's tools, on every surface: `amc agent-loop
run` and `chat`, `amc acp`, the TypeScript SDK, Studio native tasks and
delegated children.

| Platform | Default | With an explicit opt-in |
|---|---|---|
| Linux with a usable `/usr/bin/bwrap` | Offered, enforced at `linux-bwrap` | Same; the opt-in is ignored |
| Linux without Bubblewrap | Refused; the message names `/usr/bin/bwrap` | Still refused; AMC never falls back to an unconfined Linux shell |
| macOS | Refused | Offered **unconfined**, with your full user rights |
| Windows and other platforms | Refused | Still refused |

A refused shell is not registered at all, so a guessed `bash` call is denied as
an unknown tool. The other workspace tools are unaffected.

On macOS, AMC cannot confine the shell yet (Seatbelt confinement arrives with
P1-05). An unconfined shell runs `/bin/sh` as you: it can read files outside the
workspace, including `~/.ssh`, and it can reach the network. AMC's policy
guards still evaluate each call and provider keys are stripped from its
environment, but nothing confines the process. To accept that risk, use one of
these opt-ins:

- `--unsafe-unconfined-shell` on `amc agent-loop run`, `amc agent-loop chat` or
  `amc acp`.
- `allowUnconfinedShell: true` in `AMCNativeClient.start()` options, which passes
  that flag to the spawned `amc acp`, or `unconfinedShell: "sdk-option"` for
  `openAgentSession()`.
- `AMC_UNSAFE_UNCONFINED_SHELL=1` in the environment of `amc studio start` or
  `amc up`. Studio reads it once, from its own process environment, when it
  starts, and starts each native task's `amc acp` with
  `--unsafe-unconfined-shell`, so the task's warning and receipts record
  `cli-flag`; only the exact value `1` counts. This is the only opt-in Studio's
  native tasks accept. The browser and the HTTP API cannot enable the shell:
  Studio's CLI bridge (`POST /cli/exec` and `/cli/batch`) refuses any request
  that carries `--unsafe-unconfined-shell`. The CLI, ACP and SDK never read this
  variable, because they can load project dotenv files and configured
  environment.

No workspace file can opt in. A `runtime.shell.allowUnconfined` key in
`.amc/amc.config.yaml` is not honoured, even when the file is signed, because a
workspace can sign its own config with keys a repository ships; a macOS refusal
then says so. Delegated children inherit the parent's decision and can never widen
it: a child of a refused parent is refused.

Every opted-in session prints this warning on stderr (never on the ACP protocol
stream). Studio returns the same text as `shell.reason` in the native-task
options and shows it as a banner in task setup. `AMCNativeClient` discards the
spawned `amc acp` process's stderr, so an SDK caller that opts in does not see
the warning; the receipts below still record it.

```text
WARNING: the native shell is UNCONFINED on darwin (opt-in: cli-flag). Commands run with your full user rights: files outside the workspace, ~/.ssh and the network are reachable. Receipts record enforcement: none.
```

The session also records one `NATIVE_SHELL_UNCONFINED_ENABLED` audit row
(`platform`, `optInSource`, `sessionId`). Each unconfined shell call records a
`NATIVE_SHELL_CONFINEMENT` row with `backend: "none"`, `confined: false`,
`enforcementLevel: "none"` and `optInSource` before the command runs. Linux
receipts carry `enforcementLevel: "enforced"` and `boundary: "linux-bwrap"` when
Bubblewrap confirmed the confinement.

## Native Linux shell tools

Native `agentToolset` shell calls on Linux use the Bubblewrap backend. This is
a separate path from the Docker command below. The constrained Ubuntu backend
and corrected signed native CLI path have separate dated acceptance receipts.
The installed CLI at `9d963469` passed on Ubuntu 24.04 ARM64. Binary discovery alone does
not qualify a machine or establish that a command was confined.

The backend requires a root-owned, non-setuid `/usr/bin/bwrap`, an x64 or arm64
Linux host, working unprivileged user namespaces, seccomp, and support for
`--disable-userns`, `--assert-userns-disabled`, and `--json-status-fd`. Missing or
unsupported prerequisites refuse the shell call. AMC does not install the
binary automatically and this native path never falls back to an unconfined
shell.

Write authority comes from the verified, signed `bash.nativeSandbox` definition
in the workspace tools configuration. Add this object to the existing reviewed
`bash` tool definition, then sign the policy with `amc tools sign`:

```yaml
nativeSandbox:
  kind: linux-bwrap
  writableDirectories:
    - workspace/output
```

Each entry names an existing relative directory inside the selected workspace;
it is not a glob and has no `/**` suffix. An empty list permits no host writes.
The explicit requirement refuses use by legacy ToolHub, non-Linux composition
or a replacement tool body that cannot supply the bound native implementation.
Without the field, the native Linux shell remains confined with no writable
host directories; it does not impose that new requirement on other runtimes.

The old `bash.allow.paths` mount recipe was incompatible with the command-only
shell interface. Those `allow.paths` and `deny.paths` fields remain ordinary
per-call argument checks; they are never interpreted as shell mounts or
silently migrated. Review any old shell path rules when adopting the new
object. Permissions granted to `fs.write` or `fs.edit` do not also grant shell
writes. Wildcards, symlink directory grants, paths outside the selected
workspace, `.amc` grants, existing hard-link aliases and special files are
refused. Admission is bounded to 20,000 entries per grant, so use dedicated
output directories. A policy change between admission and execution refuses
the call rather than changing its authorized write scope.

The shell sees read-only system runtime files and the selected workspace, with
`.amc` masked. Explicit host write grants are mounted separately. Scratch space
at `/tmp` and the private `/dev` is not a host write grant. The process receives
a minimal environment without AMC credentials or the host home directory.
Network and IPC namespaces are separate, capabilities are dropped, nested user
namespaces are disabled, and a seccomp filter denies socket creation/connection
and io_uring entry points, including alternate syscall ABIs. Socket egress is
denied even if other network tools have a signed host allowlist; use the governed
network tools for those operations.

Procfs is intentionally absent so the command cannot reopen launcher-owned
status descriptors. Programs that depend on process introspection, `/dev/fd`,
host user configuration, or an exposed network may fail. Host processes that
concurrently alter the workspace are outside this subprocess boundary. This
backend does not establish confidentiality between project files or count
attempted denied operations.

`NATIVE_SHELL_CONFINEMENT` audit evidence records the backend/platform, actual
write mounts, signed policy digest, enforcement scope, exit/cancellation/timeout,
output truncation, and whether process-group cleanup was confirmed. For native
sessions, that receipt uses the session's own signed, enveloped writer. Only a
complete Bubblewrap command-exit message on the private status descriptor can
set `confined: true`; stdout text or an exit status alone cannot. Interrupted or
incomplete status reporting remains unconfirmed. An absent receipt, failed
launcher, nonzero command, or unconfirmed cleanup cannot produce a successful
native shell tool outcome.

This confines the shell subprocess. AMC itself and worker-thread Code Mode are
not thereby confined; Code Mode continues to refuse execution until the whole
process has a real enforcement boundary. macOS Seatbelt and the Docker command
retain their separate scopes.

The final Linux qualification must exercise successful granted writes, outside
and symlink write denial, TCP and pathname Unix-socket denial, cancellation and
escaped-descendant cleanup, missing/broken launchers, and signed native receipts.
The earlier 36-case Ubuntu backend receipt covers that component boundary;
the installed corrected native CLI path passed 41 assertions covering six
actual shell calls, signed confinement outcomes and independent cold verification. See the
[Ubuntu setup guide](NATIVE_SANDBOX_UBUNTU.md) for the exact profile and scope.
Bubblewrap's official
[project](https://github.com/containers/bubblewrap) and
[option reference](https://github.com/containers/bubblewrap/blob/main/bwrap.xml)
describe the namespace, seccomp, and launcher-status interfaces used here.

## Command

```bash
amc sandbox run --agent salesbot --route http://127.0.0.1:3210/openai -- node agent.js
```

Optional proxy:

```bash
amc sandbox run --agent salesbot \
  --route http://127.0.0.1:3210/openai \
  --proxy http://127.0.0.1:3211 \
  -- python app.py
```

## What It Records

`SANDBOX_EXECUTION_ENABLED` audit evidence includes:

- agentId
- image name/hash (best effort)
- command and args

## Network Behavior

- Sandbox creates a per-run Docker `--internal` bridge network (internet egress blocked by Docker network policy).
- The agent container is attached only to that internal network and receives gateway route env vars.
- When `--route`/`--proxy` points to localhost, AMC rewrites to `host.docker.internal` for container access.
- Direct internet egress is blocked; network intent outside policy is captured as audit evidence when proxy mode is used.
- With gateway proxy allowlist enabled, blocked outbound attempts produce `NETWORK_EGRESS_BLOCKED` audits.

## Why It Matters for Scoring

For high-risk agents/questions, level 5 support requires sandbox attestation evidence in the selected window (otherwise capped).
