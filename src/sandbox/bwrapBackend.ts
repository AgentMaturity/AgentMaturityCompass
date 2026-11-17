import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, opendirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { runProcess } from "../exec/runProcess.js";
import { PROCESS_LIMIT_LIMITATION, ROOT_PROCESS_LIMIT_LIMITATION, processLimit, withProcessLimit } from "./processCap.js";
import type { SandboxBackend, SandboxOutcome, SandboxPolicy } from "./sandboxTypes.js";
import { shellSecretPaths } from "./shellSecretPaths.js";
import { EGRESS_MOUNT, RELAY_NODE, encodeBpf, linuxSocketEgressFilter, prepareRelayDirectory, refuseSocketFiles, relayCommand, socketDenyList, socketFilterHead } from "./bwrapEgress.js";
import type { ShellEgressProxy } from "./egress/shellEgressProxy.js";

const BWRAP = "/usr/bin/bwrap";
const RUNTIME_ROOTS = ["/usr", "/bin", "/lib", "/lib64"] as const;
const RUNTIME_FILES = ["/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/nsswitch.conf", "/etc/passwd", "/etc/group", "/etc/localtime"] as const;

/** Shared by the shell and the PTY launcher, so the launch probe tests what both use. */
export const NAMESPACE_FLAGS = ["--unshare-user", "--unshare-pid", "--unshare-net", "--unshare-ipc", "--unshare-uts",
  "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--disable-userns", "--assert-userns-disabled"] as const;
/** `installed` marks a refusal where Bubblewrap is present, so remediation does not say to install it. */
type Check = { ok: true } | { ok: false; reason: string; installed?: true };
/** Options whose fd Bubblewrap consumes and closes itself; any other passed fd would reach the command. */
const FD_CONSUMING = new Set(["--json-status-fd", "--seccomp", "--bind-fd", "--ro-bind-fd"]);
let launchProbe: Check | undefined;

export function within(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

/** Launcher fds 3..count+2 that no Bubblewrap option consumes, i.e. that the confined command would inherit. */
export function unconsumedFds(argv: readonly string[], count: number): number[] {
  const end = argv.indexOf("--");
  const consumed = new Set(argv.slice(0, end < 0 ? argv.length : end).flatMap((arg, i, all) => FD_CONSUMING.has(arg) ? [all[i + 1]] : []));
  return Array.from({ length: count }, (_, i) => i + 3).filter(fd => !consumed.has(String(fd)));
}

export function admitWritableDirectory(root: string): void {
  const pending = [root];
  let remaining = 20_000;
  while (pending.length) {
    const path = pending.pop()!;
    if (--remaining < 0) throw new Error("The shell write grant exceeds its admission budget; use a narrower directory.");
    const info = lstatSync(path);
    if (info.isSymbolicLink()) continue; // Links resolve inside the new mount namespace at use time.
    if (info.isFile()) {
      if (info.nlink !== 1) throw new Error("Shell write grants cannot contain preexisting hard-link aliases.");
    } else if (info.isDirectory()) {
      const directory = opendirSync(path);
      try {
        for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
          if (pending.length >= remaining) throw new Error("The shell write grant exceeds its admission budget.");
          pending.push(join(path, entry.name));
        }
      } finally { directory.closeSync(); }
    } else throw new Error("Shell write grants cannot contain devices, sockets or named pipes.");
  }
}

/**
 * Binary presence is not confinement: Ubuntu 24.04's AppArmor userns restriction
 * lets bwrap start and then fail namespace setup. Launch the same namespaces once
 * per process; a host that refuses them reports the backend unavailable.
 * ponytail: cached for the process lifetime; a host policy change needs a restart.
 */
function namespaceLaunch(): Check {
  launchProbe ??= (() => {
    // --ro-bind-fd (Bubblewrap 0.8+) is how launches pin mounts without the command inheriting the fd.
    const root = openSync("/", constants.O_RDONLY);
    let probe;
    try {
      probe = spawnSync(BWRAP, [...NAMESPACE_FLAGS, "--ro-bind-fd", "3", "/", "--", "/bin/true"],
        { stdio: ["ignore", "ignore", "pipe", root], encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
    } finally { closeSync(root); }
    if (probe.status === 0) return { ok: true } as const;
    const detail = (probe.stderr ?? "").split("\n")[0]!.replace(/[^\x20-\x7e]/g, "").slice(0, 160) || "no diagnostic";
    return { ok: false, installed: true, reason: /unknown option/i.test(detail)
      ? `Bubblewrap at /usr/bin/bwrap is older than 0.8.0 and lacks --ro-bind-fd (${detail}); upgrade the bubblewrap package (Debian 12 and Ubuntu 24.04 ship a supported one)`
      : `Bubblewrap is installed but this host's kernel or AppArmor policy refuses unprivileged user namespaces (${detail}); see docs/NATIVE_SANDBOX_UBUNTU.md` };
  })();
  return launchProbe;
}

function installation(): { ok: true } | { ok: false; reason: string } {
  if (process.platform !== "linux") return { ok: false, reason: "Bubblewrap requires Linux." };
  if (process.arch !== "x64" && process.arch !== "arm64") return { ok: false, reason: "The Linux socket filter supports x64 and arm64 only." };
  try {
    const binary = realpathSync(BWRAP);
    const info = statSync(binary);
    if (!info.isFile() || info.uid !== 0 || (info.mode & 0o6022) !== 0 || (info.mode & 0o111) === 0) {
      return { ok: false, reason: "Bubblewrap must be a root-owned, non-setuid, executable system binary without group/other write permissions." };
    }
    for (let path = dirname(binary); ; path = dirname(path)) {
      const parent = lstatSync(path);
      if (!parent.isDirectory() || parent.uid !== 0 || (parent.mode & 0o022) !== 0) return { ok: false, reason: "Bubblewrap's system installation directories must be root-owned and not writable by other users." };
      if (path === "/") break;
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap; AMC does not fall back to an unconfined Linux shell." };
  }
}

/** Replaceable only so tests can drive the fail-closed decision on any OS. */
export const bwrapHostChecks = { installation, namespaceLaunch };

/** Installation checks first, then one real namespace launch. */
function prerequisites(): Check {
  const installed = bwrapHostChecks.installation();
  return installed.ok ? bwrapHostChecks.namespaceLaunch() : installed;
}

/** Original classic-BPF filter: reject other syscall ABIs and socket creation/connection. */
export function linuxSocketDenyFilter(arch: "x64" | "arm64"): Buffer {
  // io_uring can perform socket operations without invoking the corresponding
  // syscall, so its entry points are denied too.
  return encodeBpf([...socketFilterHead(arch, socketDenyList(arch)), [0x06, 0, 0, 0x7fff0000]]); // SECCOMP_RET_ALLOW
}

const EGRESS_RELAY_LIMITATION = "Network goes only through AMC's proxy, by a relay inside the sandbox; the relay's filter allows Unix and IP sockets, so launch is refused when the workspace holds a socket file, and a socket file a host process creates there during the call is outside this boundary. Tools that ignore HTTP_PROXY, HTTPS_PROXY and ALL_PROXY have no network.";

/** One mount the launcher pinned by descriptor; bind i is passed as fd 5 + i (3 is status, 4 the filter). */
export interface BwrapBind { readonly destination: string; readonly writable: boolean }

/** The Bubblewrap argv for a pinned layout. Pure, so the generated arguments can be checked on any OS. */
export function bwrapArgv(layout: { readonly binds: readonly BwrapBind[]; readonly masks: readonly string[];
  readonly workspace: string; readonly command: readonly string[] }): string[] {
  const amc = join(layout.workspace, ".amc");
  return [BWRAP, ...NAMESPACE_FLAGS, "--json-status-fd", "3", "--seccomp", "4",
    // Create scratch mounts first so a workspace beneath /tmp is not hidden later.
    "--dev", "/dev", "--tmpfs", "/tmp", "--chmod", "1777", "/tmp",
    ...layout.binds.flatMap((bind, index) => [bind.writable ? "--bind-fd" : "--ro-bind-fd", String(index + 5), bind.destination]),
    ...layout.masks,
    "--tmpfs", amc, "--chmod", "000", amc, "--remount-ro", amc,
    // Do not expose procfs: it could reopen a launcher-owned descriptor via PID 1.
    "--tmpfs", "/proc", "--remount-ro", "/proc", "--remount-ro", "/",
    "--chdir", layout.workspace, "--", ...layout.command];
}

/**
 * Masks for what the Linux shell must not read: the signed `readDeny` and the secret paths every confined shell is
 * denied (src/sandbox/shellSecretPaths.ts: home credential stores, AMC's own home and secret files). Host paths outside
 * the workspace are not mounted at all; one inside it (a workspace in the home directory, an AMC home or a passphrase
 * file kept in the project) is masked, a directory by a read-only tmpfs and a file by /dev/null. A path under the
 * runtime roots is refused rather than masked: /bin and /lib can alias /usr.
 */
export function bwrapReadMasks(workspace: string, readDeny: readonly string[], env: NodeJS.ProcessEnv = process.env): { ok: true; args: string[] } | { ok: false; reason: string } {
  const masked = new Map<string, boolean>(); // real path -> is a directory
  for (const literal of new Set([...readDeny, ...shellSecretPaths(env)])) {
    const path = existsSync(literal) ? realpathSync(literal) : literal;
    if ([...RUNTIME_ROOTS, ...RUNTIME_FILES].some(root => within(root, path))) return { ok: false, reason: "Linux shell readDeny and AMC's secret paths cannot be under system runtime paths." };
    if (within(workspace, path) && existsSync(path)) masked.set(path, statSync(path).isDirectory());
  }
  // A path under a masked directory is hidden with it. Masking it as well would ask Bubblewrap for a mount point inside
  // the read-only tmpfs, which fails the launch (measured: an AMC home and its credentials file both inside the workspace).
  const outer = [...masked].filter(([path]) => ![...masked].some(([other, directory]) => directory && other !== path && within(other, path)));
  return { ok: true, args: outer.flatMap(([path, directory]) => directory ? ["--tmpfs", path, "--remount-ro", path] : ["--ro-bind", "/dev/null", path]) };
}

/** Only the launcher's separate status descriptor can establish successful setup. */
export function bwrapCommandExit(status: string): number | null {
  let child: number | null = null;
  let exit: number | null = null;
  try {
    for (const line of status.split("\n").filter(line => line.trim() !== "")) {
      const row: unknown = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const object = row as Record<string, unknown>;
      if ("child-pid" in object) {
        if (child !== null || !Number.isSafeInteger(object["child-pid"]) || Number(object["child-pid"]) <= 0) return null;
        child = Number(object["child-pid"]);
      }
      if ("exit-code" in object) {
        if (child === null || exit !== null || !Number.isInteger(object["exit-code"]) || Number(object["exit-code"]) < 0 || Number(object["exit-code"]) > 255) return null;
        exit = Number(object["exit-code"]);
      }
    }
  } catch { return null; }
  return child === null ? null : exit;
}

export function bwrapBackend(): SandboxBackend {
  return {
    kind: "bwrap",
    // A real namespace launch, but still not a command-exit receipt: run() requires its own.
    available: prerequisites,
    async run(command: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> {
      const declined = (reason: string, kind: "unavailable" | "runner-failure" = "runner-failure"): SandboxOutcome => ({
        confined: false, backend: "bwrap", failure: { kind, reason }, exitCode: null,
        timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: true
      });
      const available = prerequisites();
      if (!available.ok) return declined(available.reason, "unavailable");
      if (!command.length || command.some(argument => argument.includes("\0"))) return declined("Invalid confined command.");
      if (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0) return declined("A positive finite shell deadline is required.");
      if (policy.signal?.aborted) return { ...declined("The shell was cancelled before launch."), cancelled: true };
      let temporary: string | undefined;
      let proxy: ShellEgressProxy | null = null;
      let refusals = (stderr: string, _proxy: ShellEgressProxy | null): string => stderr;
      let launched = false;
      const descriptors: number[] = [];
      try {
        const workspace = realpathSync(cwd);
        if (!statSync(workspace).isDirectory() || workspace === "/" || [...RUNTIME_ROOTS, "/etc", "/proc", "/dev"].some(root => within(root, workspace) || within(workspace, root))) {
          return declined("The Linux shell workspace must be separate from system runtime and device roots.");
        }
        const writableRoots = [...new Set(policy.writableRoots.map(path => {
          const logical = resolve(path);
          const real = realpathSync(logical);
          if (logical !== real || !within(workspace, real) || !statSync(real).isDirectory() || within(join(workspace, ".amc"), real)) {
            throw new Error("Invalid Linux shell directory grant.");
          }
          return real;
        }))];
        // All native shell networking is denied, including pathname Unix sockets, unless a signed allow-list
        // routes it through AMC's proxy (bwrapEgress.ts). An omitted network field grants nothing.
        const taskParent = realpathSync(tmpdir());
        if (within(workspace, taskParent)) return declined("Launcher state must be outside the exposed workspace.");
        temporary = mkdtempSync(join(taskParent, "amc-bwrap-"));
        const statusPath = join(temporary, "status.jsonl");
        const filterPath = join(temporary, "sockets.bpf");
        const egressDirectory = join(temporary, "egress");
        if (policy.allowHosts) {
          try { refuseSocketFiles(workspace); } catch (error) { return declined(`${error instanceof Error ? error.message : "The workspace could not be checked for socket files."} Nothing was run.`); }
          mkdirSync(egressDirectory, { mode: 0o700 });
          // Loaded only here: its import chain reaches back to this module through the native binding.
          const egress = await import("./egress/sessionEgress.js");
          try { proxy = await egress.startPolicyEgress(policy, join(egressDirectory, "proxy.sock")); }
          catch (error) { return declined(error instanceof egress.EgressUnavailable ? error.message : "AMC's network filter could not start; nothing was run."); }
          refusals = egress.withRefusals;
          prepareRelayDirectory(egressDirectory);
        }
        const arch = process.arch as "x64" | "arm64";
        writeFileSync(filterPath, proxy ? linuxSocketEgressFilter(arch) : linuxSocketDenyFilter(arch), { mode: 0o600 });
        descriptors.push(openSync(statusPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600));
        descriptors.push(openSync(filterPath, constants.O_RDONLY));
        const binds: BwrapBind[] = [];
        const readonlyRoots: string[] = [];
        const bind = (path: string, destination: string, writable: boolean): void => {
          const canonical = realpathSync(path);
          const fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
          descriptors.push(fd);
          // Pin the source inode before launch; a renamed path cannot swap the mount source.
          if (readlinkSync(`/proc/self/fd/${fd}`) !== canonical) throw new Error("A mount source changed during admission.");
          const info = fstatSync(fd);
          if (!info.isFile() && !info.isDirectory()) throw new Error("A Linux shell mount source is not a regular file or directory.");
          if (writable) admitWritableDirectory(`/proc/self/fd/${fd}/.`);
          binds.push({ destination, writable });
          if (!writable) readonlyRoots.push(destination);
        };
        for (const root of RUNTIME_ROOTS) if (existsSync(root)) bind(root, root, false);
        for (const file of RUNTIME_FILES) if (existsSync(file)) bind(file, file, false);
        bind(workspace, workspace, false);
        // Nested writable binds are applied from outermost to innermost.
        for (const root of writableRoots.sort((a, b) => a.length - b.length)) bind(root, root, true);
        if (proxy) {
          bind(egressDirectory, EGRESS_MOUNT, false);
          // AMC's own Node, pinned by descriptor over the empty file prepareRelayDirectory left; nothing is copied.
          bind(process.execPath, RELAY_NODE, false);
        }
        const masks = bwrapReadMasks(workspace, policy.readDeny ?? []);
        if (!masks.ok) return declined(masks.reason);
        const limit = policy.maxProcesses === undefined ? null : processLimit(policy.maxProcesses);
        const capped = limit !== null && process.geteuid?.() !== 0 ? limit : null; // the kernel exempts root from RLIMIT_NPROC
        const args = bwrapArgv({ binds, masks: masks.args, workspace, command: proxy ? relayCommand(command) : command });
        if (unconsumedFds(args, descriptors.length).length) throw new Error("A launcher fd would reach the command.");
        launched = true;
        // The limit goes on the launcher, before it creates the user namespace: the kernel then holds this user's
        // host-wide count to it. Set inside, a fresh namespace counts from zero and the cap never binds.
        const outcome = await runProcess({ argv: limit === null ? args : withProcessLimit(limit, args), cwd: workspace,
          // /usr/local is already mounted read-only under /usr; without it on PATH a system Node or Python installed
          // there (official tarballs, the node Docker images, GitHub runners) is not found and the launch has no exit.
          env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp", TMPDIR: "/tmp", LANG: "C.UTF-8", ...(proxy ? { AMC_EGRESS_TOKEN: proxy.token } : {}) },
          stdin: "ignore", stdout: "capture", stderr: "capture", maxCaptureBytes: 64_000,
          scrubValues: [...(policy.scrubValues ?? []), ...(proxy ? [proxy.token] : [])], graceMs: 2_000, timeoutMs: policy.timeoutMs,
          ...(policy.onOutput ? { onOutput: policy.onOutput } : {}),
          ...(policy.signal ? { signal: policy.signal } : {}), extraFds: descriptors }).done;
        const status = statSync(statusPath).size <= 64_000 ? bwrapCommandExit(readFileSync(statusPath, "utf8")) : null;
        const applied = status !== null && status === outcome.exitCode;
        return {
          confined: applied, backend: "bwrap",
          failure: !applied ? { kind: "runner-failure", reason: "Bubblewrap did not provide a complete command-exit receipt; execution and confinement are unconfirmed." }
            : !outcome.treeExitProven ? { kind: "runner-failure", reason: "The launcher exited but process-group cleanup could not be confirmed." } : null,
          exitCode: applied ? status : null, timedOut: outcome.terminatedBy === "timeout", cancelled: outcome.terminatedBy === "cancel",
          stdout: outcome.stdout.text, stderr: refusals(outcome.stderr.text, proxy), writableRoots: applied ? writableRoots : [],
          treeExitProven: outcome.treeExitProven, droppedBytes: outcome.stdout.droppedBytes + outcome.stderr.droppedBytes,
          ...(applied ? { enforcement: {
            boundary: "linux-bwrap" as const, hostWrites: "declared-roots-only" as const, reads: "workspace-ro-and-runtime" as const,
            network: proxy ? "proxy-allowlist" as const : "denied" as const, allowHosts: proxy ? [...(policy.allowHosts ?? [])] : [],
            processLimit: capped === null ? null : { mechanism: "rlimit-nproc" as const, max: capped },
            readonlyRoots, privateWritableRoots: ["/tmp", "/dev"], launcherStatus: "command-exited" as const,
            sourcePolicySha256: policy.sourcePolicySha256 ?? null,
            limitations: ["No procfs or host environment is exposed; process-introspection tools may fail.",
              "This confines a shell subprocess, not AMC or worker-thread Code Mode.",
              "Existing hard-link aliases and special files in write grants are refused; concurrent trusted host writers are outside this subprocess boundary.",
              "A successful command does not establish a count of denied operations.",
              ...(proxy ? [EGRESS_RELAY_LIMITATION] : []),
              ...(limit === null ? [] : [capped !== null ? PROCESS_LIMIT_LIMITATION : ROOT_PROCESS_LIMIT_LIMITATION])]
          } } : {})
        };
      } catch {
        // Do not put arbitrary host paths, command text or launcher exceptions into an audit reason.
        return { ...declined("Linux shell admission or launcher execution failed; no unconfined fallback was attempted."), treeExitProven: !launched };
      } finally {
        proxy?.close();
        for (const fd of descriptors) { try { closeSync(fd); } catch { /* close every owned descriptor */ } }
        if (temporary) rmSync(temporary, { recursive: true, force: true });
      }
    }
  };
}
