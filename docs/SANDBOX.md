# Sandbox Mode

Sandbox mode executes agent commands in Docker and writes explicit sandbox attestation evidence.

## Native Linux shell tools

Native `agentToolset` shell calls on Linux use the Bubblewrap backend. This is
a separate path from the Docker command below. The source implementation is
present; its real Linux acceptance run is pending. Binary discovery alone does
not qualify a machine or establish that a command was confined.

The backend requires a root-owned, non-setuid `/usr/bin/bwrap`, an x64 or arm64
Linux host, working unprivileged user namespaces, seccomp, and support for
`--disable-userns`, `--assert-userns-disabled`, and `--json-status-fd`. Missing or
unsupported prerequisites refuse the shell call. AMC does not install the
binary automatically and this native path never falls back to an unconfined
shell.

Write authority comes from the verified, signed `bash.allow.paths` definition
in the workspace tools configuration. Each grant must be an existing relative
directory followed by `/**`, for example `./workspace/output/**`. No grant means
no host writes. Permissions granted to `fs.write` or `fs.edit` do not also grant
shell writes. Wildcard ancestors, symlink directory grants, paths outside the
selected workspace, `.amc` grants, and path exceptions that intersect a write
mount are refused. Existing hard-link aliases and special files in a write
grant are also refused; admission is bounded to 20,000 entries per grant, so use
dedicated output directories. Narrow the signed grant instead of approximating
an unsupported pattern.

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
Those checks have not been run for this implementation. Bubblewrap's official
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
