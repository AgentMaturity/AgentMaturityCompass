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
| macOS with a root-owned `/usr/bin/sandbox-exec` | Offered, enforced at `macos-seatbelt` | Same; the opt-in is ignored |
| macOS without a usable `sandbox-exec` | Refused | Offered **unconfined**, with your full user rights |
| Windows and other platforms | Refused | Still refused |

A refused shell is not registered at all, so a guessed `bash` call is denied as
an unknown tool. The other workspace tools are unaffected.

On macOS, AMC confines the shell with Seatbelt (see
[Native macOS shell](#native-macos-shell-seatbelt)). Only when
`/usr/bin/sandbox-exec` is missing, or is not a root-owned system binary, is
the shell refused, and only then does an opt-in apply. An unconfined shell runs
`/bin/sh` as you: it can read files outside the workspace, including `~/.ssh`,
and it can reach the network. AMC's policy guards still evaluate each call and
provider keys are stripped from its environment, but nothing confines the
process. To accept that risk, use one of these opt-ins:

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
`enforcementLevel: "none"` and `optInSource` before the command runs. Confined
receipts carry `enforcementLevel: "enforced"` and `boundary: "linux-bwrap"` or
`"macos-seatbelt"`. When the backend confirmed the confinement, `enforcement`
records `boundary`, `hostWrites`, `reads`, `network` (`denied` or
`proxy-allowlist`), `allowHosts`, `processLimit` and `limitations`.

| | Linux (`linux-bwrap`) | macOS (`macos-seatbelt`) |
|---|---|---|
| Writes | Signed `writableDirectories`; private `/tmp` and `/dev` | Signed `writableDirectories`, a private per-call `TMPDIR` (also `HOME`), `/dev/null` |
| Reads (`reads`) | Runtime roots and the workspace, read-only; `.amc` and workspace `readDeny` paths masked (`workspace-ro-and-runtime`) | Everything your user can read, except the deny-list below (`open-except-denylist`) |
| Network | Denied: separate network namespace and a seccomp socket filter | Denied, Unix sockets included; with a signed egress allowlist, only AMC's per-call proxy |
| Processes | RLIMIT_NPROC of your process count at launch plus `maxProcesses` (default 256) | Same |
| Escape | Process-group kill at the deadline or on cancel | Same |

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
  kind: os-native        # Bubblewrap on Linux, Seatbelt on macOS; linux-bwrap is Linux-only
  writableDirectories:
    - workspace/output
  readDeny:              # optional: exact paths the shell may neither read nor write
    - ~/.config/my-tool
  maxProcesses: 256      # optional: processes the shell may add to your count at launch
```

Each entry names an existing relative directory inside the selected workspace
that does not contain your home directory;
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
network tools for those operations. A signed `nativeSandbox.egress` is refused
on Linux: its in-namespace relay needs a seccomp change that waits for review of
[ADR-008](adr/008-native-shell-containment.md). `readDeny` paths inside the
workspace are masked; other host paths are not mounted at all, and a `readDeny`
path under the system runtime roots is refused.

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

## Native macOS shell (Seatbelt)

On macOS the native shell runs `/bin/sh` through `/usr/bin/sandbox-exec` with a
profile AMC writes per call. Writes are allowed only to the signed
`writableDirectories`, a private per-call temporary directory (the shell's
`TMPDIR` and `HOME`) and `/dev/null`. Reads and writes are denied for `~/.ssh`,
`~/.aws`, `~/.config/gcloud`, `~/.azure`, `~/.gnupg`, `~/.kube`, `~/.docker`,
`~/.netrc`, `~/.npmrc`, `~/Library/Keychains`, `~/.amc`, the workspace's `.amc`
and the signed `readDeny` paths. All networking is denied, including Unix
sockets such as an SSH agent; with a signed egress allowlist the only exception
is AMC's proxy port on localhost. Every path is resolved first, because Seatbelt
matches real paths only (`/var` is `/private/var`). Write grants that contain
preexisting hard links or special files are refused, as on Linux, and the shell
cannot create hard links. Mach lookups are limited to five system services (the
temporary-directory helper, logging, notifications, user and group lookups),
and opening apps (`open`), AppleEvents (`osascript`), launchd jobs
(`launchctl`, `at`), and signals to or inspection of processes outside the
shell's own process group are denied, so the shell cannot ask launchd,
LaunchServices or another app to start a process outside the profile. The
environment is `PATH`, `HOME`, `TMPDIR`, `LANG` and, with egress, the proxy
variables; AMC credentials are not passed.

`sandbox-exec` reports nothing when it applies a profile, so AMC measures it:
before the command starts, a wrapper inside the profile must fail to write a
probe in the launcher's own directory and succeed in writing a marker in the
private temporary directory. Without both, the command never ran and the
receipt says `confined: false`.

Limits. Reads outside the deny-list stay open: the shell can read any other
file your user can. POSIX shared memory and IOKit are not restricted. Tools
that need another system service, such as the keychain or certificate trust
through `trustd`, fail.
`sandbox-exec` is deprecated by Apple; the profile was checked by hand on macOS
26.6.2 (25G83, arm64) and no CI job runs it yet. RLIMIT_NPROC counts every
process of your user, so the process cap is relative to your count at launch.

## Shell egress allowlist

Without `egress`, the native shell has no network. To let it reach named hosts,
add a signed allowlist to the `bash` entry and run `amc tools sign`:

```yaml
nativeSandbox:
  kind: os-native
  writableDirectories: [workspace/output]
  egress:
    allowHosts:
      - registry.npmjs.org   # exactly this host
      - .github.com          # any subdomain of github.com, not github.com itself
      - 10.0.0.12            # an IP literal, required for a private address
```

Entries are lowercase host names, `.suffix` entries or IP literals; wildcards,
ports and URLs are refused at signing. Each shell call then starts its own HTTP
forward proxy (CONNECT and plain HTTP) on 127.0.0.1, protected by a per-call
token, and passes it as `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` (and their
lowercase forms); the token is scrubbed from output. The proxy refuses a host
that is not listed without a DNS query, resolves a listed host once, refuses it
if any address is loopback, link-local (including 169.254.169.254), private,
CGNAT, documentation, benchmarking, unique-local, multicast or reserved (IPv6
forms that carry such an IPv4 address included; 6to4 and Teredo always) unless
that exact IP literal is listed, and
connects only to an address it checked. Denials answer HTTP 403. Every decision
writes a `NATIVE_SHELL_EGRESS` audit row (`callId`, `host`, `port`, `decision`,
`reason`) before it takes effect; a row that cannot be written denies the
connection.

curl and git over HTTPS read `http_proxy`/`HTTPS_PROXY`, npm and pip read
`HTTPS_PROXY`, and Node's built-in `fetch` does not read them by default.
Check other tools' own proxy settings. A tool that ignores the variables, such as git over SSH, cannot
reach the network. The gateway forward proxy uses the same host decision
(`decideEgress`, through `resolveAndCheck`): it resolves a listed name for every
connection and connects only to an address it checked. This is available on macOS; on Linux a signed `egress` is
refused until the relay in ADR-008 is reviewed and built.

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
