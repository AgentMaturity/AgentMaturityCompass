# ADR 008: Native shell containment on macOS and Linux

Status: proposed. The macOS boundary, the shared egress allowlist, the process
cap and the receipts are implemented. The Linux egress relay below is
implemented as proposed (2026-11-16, lane sandbox) and unit-tested, but has not
been run on a Linux host.
Owner: P1-05. Date: 2026-10-07.

## Context

After P0-06 the native `bash` tool runs under Bubblewrap on Linux and is
refused on macOS unless an operator passes an unsafe opt-in, which gives an
unconfined shell. The Linux shell has no network at all, so a build that fetches
packages cannot run. The P0-11 threat model (`docs/security/THREAT_MODEL.md`,
channels `native-shell` and `network-egress`) lists these gaps for P1-05:

- Tampering: an opted-in macOS shell can write anywhere the user can.
- Information disclosure: the macOS shell can read `~/.ssh` and reach the
  network; shell egress is filtered nowhere, and allowed shell egress leaves no row.
- Elevation of privilege: no Seatbelt profile on macOS.
- Denial of service (added here): a fork loop can exhaust the user's processes.

## Decision

The shell is confined on both platforms. The signed `bash.nativeSandbox`
policy gains `kind: os-native` (Bubblewrap on Linux, Seatbelt on macOS;
`linux-bwrap` keeps its Linux-only meaning), `egress.allowHosts`, `readDeny`
and `maxProcesses` (default 256).

| | Linux (`linux-bwrap`) | macOS (`macos-seatbelt`) |
|---|---|---|
| Writes | Signed `writableDirectories`; private `/tmp` and `/dev` | Signed `writableDirectories`, a per-call private `TMPDIR`, `/dev/null` |
| Reads | Runtime roots and the workspace, read-only; `.amc` and `readDeny` masked | Open, except `~/.ssh`, `~/.aws`, `~/.config/gcloud`, `~/.azure`, `~/.gnupg`, `~/.kube`, `~/.docker`, `~/.netrc`, `~/.npmrc`, `~/Library/Keychains`, `~/.amc`, `<workspace>/.amc` and `readDeny` (reads and writes denied) |
| Network | Separate network namespace and a seccomp filter that denies sockets | `(deny network*)`, Unix sockets included; with `egress`, only AMC's proxy port on localhost |
| Processes | RLIMIT_NPROC of the user's count at launch plus `maxProcesses`; process-group kill at the deadline | Same |
| Proof | Bubblewrap's command-exit status on a private descriptor | Inside the profile, a wrapper must fail to write a launcher-owned probe and succeed in writing a marker before the command starts |

Both backends refuse write grants that contain preexisting hard links or
special files, or that contain the user's home directory (startup files and
launch agents there would run later, outside the sandbox). On macOS 26.6.2 a
preexisting hard link in a writable root wrote through to its target, so the
profile also denies creating hard links.

`(allow default)` alone would let the command ask launchd, LaunchServices or
another app to start a process outside the profile (`open`, `osascript`,
`launchctl submit`). The profile therefore denies `mach-lookup` except five
services that `/bin/sh`, git, node and curl need on macOS 26.6.2
(`com.apple.bsd.dirhelper`, `com.apple.logd`,
`com.apple.system.notification_center`,
`com.apple.system.opendirectoryd.libinfo` and `.membership`), and denies
`lsopen`, `appleevent-send`, `job-creation`, signals to and process inspection
of processes outside the shell's process group, and exec of `open`,
`osascript`, `launchctl` and `at`. Hand-run checks on 26.6.2 refused each of
these, including re-signed copies of the launchers. Every path in the Seatbelt profile is resolved first, because Seatbelt
matches real paths only.

The platform gate confines darwin when `/usr/bin/sandbox-exec` is a root-owned
system binary. The unsafe opt-in applies only when Seatbelt is unavailable.
Windows stays refused (P2-14).

**Shared allowlist.** `decideEgress` (`src/enforce/egressAllowlist.ts`) is the
one host decision. Entries are exact names, `.suffix` entries for subdomains,
or exact IP literals. Deny by default. A non-public address (loopback,
link-local including 169.254.169.254, private, CGNAT, documentation,
benchmarking, unique-local, multicast, reserved) is reachable only when that
exact IP literal is listed. IPv4-mapped, IPv4-compatible and NAT64
(`64:ff9b::/96`) addresses are judged by the IPv4 address they carry; 6to4,
Teredo and local-use NAT64 fail closed. The gateway's `hostAllowed` calls it and
keeps its semantics, except that an IP-literal host no longer matches an entry
by suffix. The gateway resolves nothing, so an allowed name there can still
resolve inward; making it resolve and connect to a checked address is proposed
follow-up P1-59. (Amended: done as P1-66, which re-keyed P1-59; the gateway
forward proxy now calls `resolveAndCheck` for every connection and connects
only to a checked address.)

**Shell egress proxy.** With `egress`, each shell call starts an HTTP forward
proxy (CONNECT and plain HTTP) for that call only, so every decision binds to a
`callId` and the proxy dies with the call. On macOS it listens on 127.0.0.1 at
an ephemeral port and requires a per-call token in `Proxy-Authorization`. A
name that is not listed is refused before any DNS query. A listed name is
resolved once, every address is checked, and the proxy connects to a checked
address. Each decision writes a `NATIVE_SHELL_EGRESS` row before it takes
effect; a row that cannot be written denies the connection.

**Receipts.** `NATIVE_SHELL_CONFINEMENT` rows carry `boundary`, `hostWrites`,
`reads`, `network` (`denied` or `proxy-allowlist`), `allowHosts`,
`processLimit` and `limitations`.

## Linux relay (implemented 2026-11-16; not yet run on Linux)

Only when `egress` is signed: refuse launch if a socket file exists in the
read-only workspace mount (a 20,000-entry walk; a larger workspace is refused);
listen on a Unix socket in the launcher's private temp directory (mode 0700)
and bind that directory read-only at `/amc-egress`; replace
`linuxSocketDenyFilter` with `linuxSocketEgressFilter(arch)`
(`src/sandbox/bwrapEgress.ts`), which allows `socket()` only for AF_UNIX,
AF_INET and AF_INET6, `socketpair()` only for AF_UNIX, and still denies io_uring;
run the relay script with a read-only copy of AMC's Node binary. The relay
listens on 127.0.0.1 inside the empty network namespace, forwards to the bound
socket and runs the command with the proxy variables set. Without `egress`, the
full socket deny filter and the old arguments stay, byte for byte
(`tests/sandbox/confinementNoLooser.test.ts`).

## Allow-list matching (2026-11-16)

An entry may carry `:port`; an entry without one covers only the default port
(443 for CONNECT, 80 for plain HTTP). Hosts are matched lowercased and without a
trailing dot. A request whose Host header names another site than its target is
refused; a Host header naming a loopback address (Node's client names its proxy
there) is ignored, since the proxy never connects to it. A session may narrow
its list (`narrowSessionEgress`): the effective list is the intersection. The
generic macOS Seatbelt profile now denies the network as the shell profile
does.

## Known limits

- macOS reads outside the deny-list stay open, by design. Named POSIX shared
  memory cannot be created or written, System V IPC cannot be attached and
  IOKit user clients cannot be opened (measured 2026-11-01); the kernel still
  lets a System V segment be created, empty and unattachable, and POSIX
  semaphores and IOKit registry reads stay open. Tools that need another
  system service fail closed: keychain lookups and Security.framework trust
  evaluation through trustd.
- `sandbox-exec` is deprecated. The profile was checked by hand on macOS 26.6.2
  (25G83, arm64); no CI job has run it yet.
- RLIMIT_NPROC counts every process of the user (threads on Linux), so the cap
  is relative to the count at launch.
- A host allowlist cannot stop domain fronting through a listed host. The proxy
  pins the `Host` header for plain HTTP only.
- Tools that ignore `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` (for example
  git over SSH) cannot reach the network.
- On Linux with egress, a socket file a host process creates in the workspace
  during the call could be connected to; the runtime roots (`/usr`, `/lib`) are
  not walked for socket files.
- The escape suite and the `contained-shell` CI job are not written yet.
