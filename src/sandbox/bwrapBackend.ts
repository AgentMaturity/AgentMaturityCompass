import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, opendirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { runProcess } from "../exec/runProcess.js";
import type { SandboxBackend, SandboxOutcome, SandboxPolicy } from "./sandboxTypes.js";

const BWRAP = "/usr/bin/bwrap";
const RUNTIME_ROOTS = ["/usr", "/bin", "/lib", "/lib64"] as const;
const RUNTIME_FILES = ["/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/nsswitch.conf", "/etc/passwd", "/etc/group", "/etc/localtime"] as const;

function within(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

function admitWritableDirectory(root: string): void {
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

function prerequisites(): { ok: true } | { ok: false; reason: string } {
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

/** Original classic-BPF filter: reject other syscall ABIs and socket creation/connection. */
export function linuxSocketDenyFilter(arch: "x64" | "arm64"): Buffer {
  const instructions: [number, number, number, number][] = [
    [0x20, 0, 0, 4], // seccomp_data.arch
    [0x15, 1, 0, arch === "x64" ? 0xc000003e : 0xc00000b7],
    [0x06, 0, 0, 0x80000000], // SECCOMP_RET_KILL_PROCESS
    [0x20, 0, 0, 0] // seccomp_data.nr
  ];
  // x32 uses the x86-64 audit architecture with a different syscall table.
  if (arch === "x64") instructions.push([0x35, 0, 1, 0x40000000], [0x06, 0, 0, 0x00050001]);
  // io_uring can perform socket operations without invoking the corresponding
  // syscall, so deny its entry points too (same numbers on both supported ABIs).
  for (const syscall of [...(arch === "x64" ? [41, 53, 42] : [198, 199, 203]), 425, 426, 427]) {
    instructions.push([0x15, 0, 1, syscall], [0x06, 0, 0, 0x00050001]);
  }
  instructions.push([0x06, 0, 0, 0x7fff0000]); // SECCOMP_RET_ALLOW
  const bytes = Buffer.alloc(instructions.length * 8);
  instructions.forEach(([code, jt, jf, value], index) => {
    bytes.writeUInt16LE(code, index * 8);
    bytes.writeUInt8(jt, index * 8 + 2);
    bytes.writeUInt8(jf, index * 8 + 3);
    bytes.writeUInt32LE(value, index * 8 + 4);
  });
  return bytes;
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
    // A prerequisite check, not proof that the kernel accepts the namespace policy.
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
        // All native shell networking is denied, including pathname Unix sockets.
        // An omitted network field does not grant an exception to this backend.
        const taskParent = realpathSync(tmpdir());
        if (within(workspace, taskParent)) return declined("Launcher state must be outside the exposed workspace.");
        temporary = mkdtempSync(join(taskParent, "amc-bwrap-"));
        const statusPath = join(temporary, "status.jsonl");
        const filterPath = join(temporary, "sockets.bpf");
        writeFileSync(filterPath, linuxSocketDenyFilter(process.arch as "x64" | "arm64"), { mode: 0o600 });
        descriptors.push(openSync(statusPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600));
        descriptors.push(openSync(filterPath, constants.O_RDONLY));
        const args: string[] = [BWRAP, "--unshare-user", "--unshare-pid", "--unshare-net", "--unshare-ipc", "--unshare-uts",
          "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--disable-userns", "--assert-userns-disabled",
          "--json-status-fd", "3", "--seccomp", "4",
          // Create scratch mounts first so a workspace beneath /tmp is not hidden later.
          "--dev", "/dev", "--tmpfs", "/tmp", "--chmod", "1777", "/tmp"];
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
          args.push(writable ? "--bind" : "--ro-bind", `/proc/self/fd/${descriptors.length + 2}`, destination);
          if (!writable) readonlyRoots.push(destination);
        };
        for (const root of RUNTIME_ROOTS) if (existsSync(root)) bind(root, root, false);
        for (const file of RUNTIME_FILES) if (existsSync(file)) bind(file, file, false);
        bind(workspace, workspace, false);
        // Nested writable binds are applied from outermost to innermost.
        for (const root of writableRoots.sort((a, b) => a.length - b.length)) bind(root, root, true);
        args.push("--tmpfs", join(workspace, ".amc"), "--chmod", "000", join(workspace, ".amc"), "--remount-ro", join(workspace, ".amc"),
          // Do not expose procfs: it could reopen a launcher-owned descriptor via PID 1.
          "--tmpfs", "/proc", "--remount-ro", "/proc", "--remount-ro", "/",
          "--chdir", workspace, "--", ...command);
        launched = true;
        const outcome = await runProcess({ argv: args, cwd: workspace,
          env: { PATH: "/usr/bin:/bin", HOME: "/tmp", TMPDIR: "/tmp", LANG: "C.UTF-8" },
          stdin: "ignore", stdout: "capture", stderr: "capture", maxCaptureBytes: 64_000,
          scrubValues: policy.scrubValues ?? [], graceMs: 2_000, timeoutMs: policy.timeoutMs,
          ...(policy.signal ? { signal: policy.signal } : {}), extraFds: descriptors }).done;
        const status = statSync(statusPath).size <= 64_000 ? bwrapCommandExit(readFileSync(statusPath, "utf8")) : null;
        const applied = status !== null && status === outcome.exitCode;
        return {
          confined: applied, backend: "bwrap",
          failure: !applied ? { kind: "runner-failure", reason: "Bubblewrap did not provide a complete command-exit receipt; execution and confinement are unconfirmed." }
            : !outcome.treeExitProven ? { kind: "runner-failure", reason: "The launcher exited but process-group cleanup could not be confirmed." } : null,
          exitCode: applied ? status : null, timedOut: outcome.terminatedBy === "timeout", cancelled: outcome.terminatedBy === "cancel",
          stdout: outcome.stdout.text, stderr: outcome.stderr.text, writableRoots: applied ? writableRoots : [],
          treeExitProven: outcome.treeExitProven, droppedBytes: outcome.stdout.droppedBytes + outcome.stderr.droppedBytes,
          ...(applied ? { enforcement: {
            hostWrites: "declared-roots-only" as const, network: "socket-syscalls-denied" as const,
            readonlyRoots, privateWritableRoots: ["/tmp", "/dev"], launcherStatus: "command-exited" as const,
            sourcePolicySha256: policy.sourcePolicySha256 ?? null,
            limitations: ["No procfs or host environment is exposed; process-introspection tools may fail.",
              "This confines a shell subprocess, not AMC or worker-thread Code Mode.",
              "Existing hard-link aliases and special files in write grants are refused; concurrent trusted host writers are outside this subprocess boundary.",
              "A successful command does not establish a count of denied operations."]
          } } : {})
        };
      } catch {
        // Do not put arbitrary host paths, command text or launcher exceptions into an audit reason.
        return { ...declined("Linux shell admission or launcher execution failed; no unconfined fallback was attempted."), treeExitProven: !launched };
      } finally {
        for (const fd of descriptors) { try { closeSync(fd); } catch { /* close every owned descriptor */ } }
        if (temporary) rmSync(temporary, { recursive: true, force: true });
      }
    }
  };
}
