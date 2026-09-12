import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, opendirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { bwrapBackend, bwrapCommandExit, linuxSocketDenyFilter } from "../sandbox/bwrapBackend.js";
import type { SandboxPolicy } from "../sandbox/sandboxTypes.js";
import { assertTerminalDimensions } from "./terminalTypes.js";
import { NATIVE_PTY_HELPER } from "./nativePtyHelper.js";

const PYTHON = "/usr/bin/python3";
const RUNTIME_ROOTS = ["/usr", "/bin", "/lib", "/lib64"] as const;
const RUNTIME_FILES = ["/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/nsswitch.conf", "/etc/passwd", "/etc/group", "/etc/localtime"] as const;

function within(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

export interface NativePtySupport {
  readonly platform: string;
  readonly arch: string;
  readonly implementation: "linux-bwrap-python-pty";
  readonly prerequisitesAvailable: boolean;
  /** A source/prerequisite inspection cannot qualify an operating system. */
  readonly executionVerified: false;
  readonly reason: string;
}

/** No subprocess probes. Even a positive result is NOT namespace/PTY evidence. */
export function nativePtySupport(): NativePtySupport {
  const base = { platform: process.platform, arch: process.arch, implementation: "linux-bwrap-python-pty" as const, executionVerified: false as const };
  const bwrap = bwrapBackend().available();
  if (!bwrap.ok) return { ...base, prerequisitesAvailable: false, reason: bwrap.reason };
  try {
    const binary = realpathSync(PYTHON);
    const info = statSync(binary);
    if (!info.isFile() || info.uid !== 0 || (info.mode & 0o6022) !== 0 || (info.mode & 0o111) === 0) throw new Error("untrusted Python");
    for (let path = dirname(binary); ; path = dirname(path)) {
      const parent = lstatSync(path);
      if (!parent.isDirectory() || parent.uid !== 0 || (parent.mode & 0o022) !== 0) throw new Error("untrusted installation");
      if (path === "/") break;
    }
    return { ...base, prerequisitesAvailable: true, reason: "System Bubblewrap and Python exist; Python 3.11+, devpts and namespace execution remain unverified until launch." };
  } catch {
    return { ...base, prerequisitesAvailable: false, reason: "A root-owned, non-setuid system Python 3.11+ at /usr/bin/python3 is required. No host-shell fallback is available." };
  }
}

function admitWritableDirectory(root: string): void {
  const pending = [root];
  let remaining = 20_000;
  while (pending.length) {
    if (--remaining < 0) throw new Error("Use a narrower terminal directory grant.");
    const path = pending.pop()!;
    const info = lstatSync(path);
    if (info.isSymbolicLink()) continue;
    if (info.isFile()) {
      if (info.nlink !== 1) throw new Error("Terminal write grants cannot contain hard-link aliases.");
    } else if (info.isDirectory()) {
      const directory = opendirSync(path);
      try {
        for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
          if (pending.length >= remaining) throw new Error("Terminal directory admission budget exceeded.");
          pending.push(join(path, entry.name));
        }
      } finally { directory.closeSync(); }
    } else throw new Error("Terminal write grants cannot contain devices, sockets or named pipes.");
  }
}

export interface NativePtyLaunch {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly extraFds: readonly number[];
  commandExit(): number | null;
  dispose(): void;
}

/**
 * PTY variant of bwrapBackend's pinned-mount launch, with the same network,
 * writable-root, authority-mask and status-FD controls. This is a transport,
 * NOT a permission grant: nativeTerminal.ts owns host admission. The separate
 * bash binding remains unchanged and cannot be exchanged for this launcher.
 */
export function prepareNativePtyLaunch(cwd: string, policy: SandboxPolicy, cols: number, rows: number): NativePtyLaunch {
  assertTerminalDimensions(cols, rows);
  const support = nativePtySupport();
  if (!support.prerequisitesAvailable) throw new Error(support.reason);
  if (policy.network !== "deny") throw new Error("A native PTY requires an explicit network-deny policy.");
  if (!Number.isSafeInteger(policy.timeoutMs) || policy.timeoutMs <= 0 || policy.timeoutMs > 86_400_000) throw new RangeError("A native PTY requires a bounded positive lifetime of at most 24 hours.");
  if (policy.signal?.aborted) throw new Error("The terminal was cancelled before launch.");
  const workspace = realpathSync(cwd);
  if (!statSync(workspace).isDirectory() || workspace === "/" || [...RUNTIME_ROOTS, "/etc", "/proc", "/dev"].some(root => within(root, workspace) || within(workspace, root))) {
    throw new Error("The terminal workspace must be separate from system runtime and device roots.");
  }
  const writableRoots = [...new Set(policy.writableRoots.map(path => {
    const logical = resolve(path);
    const real = realpathSync(logical);
    if (real !== logical || !within(workspace, real) || !statSync(real).isDirectory() || within(join(workspace, ".amc"), real)) {
      throw new Error("Invalid terminal directory grant.");
    }
    return real;
  }))];
  const temporaryRoot = realpathSync(tmpdir());
  if (within(workspace, temporaryRoot)) throw new Error("Terminal launcher state must be outside the workspace.");
  const temporary = mkdtempSync(join(temporaryRoot, "amc-pty-"));
  const descriptors: number[] = [];
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const fd of descriptors) { try { closeSync(fd); } catch { /* Release every owned descriptor. */ } }
    rmSync(temporary, { recursive: true, force: true });
  };
  try {
    const statusPath = join(temporary, "status.jsonl");
    const filterPath = join(temporary, "sockets.bpf");
    writeFileSync(filterPath, linuxSocketDenyFilter(process.arch as "x64" | "arm64"), { mode: 0o600 });
    descriptors.push(openSync(statusPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600));
    descriptors.push(openSync(filterPath, constants.O_RDONLY));
    const argv = ["/usr/bin/bwrap", "--unshare-user", "--unshare-pid", "--unshare-net", "--unshare-ipc", "--unshare-uts",
      "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--disable-userns", "--assert-userns-disabled",
      "--json-status-fd", "3", "--seccomp", "4", "--dev", "/dev", "--tmpfs", "/tmp", "--chmod", "1777", "/tmp"];
    const bind = (path: string, writable: boolean): void => {
      const canonical = realpathSync(path);
      const fd = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
      descriptors.push(fd);
      if (readlinkSync(`/proc/self/fd/${fd}`) !== canonical) throw new Error("Terminal mount source changed during admission.");
      const info = fstatSync(fd);
      if (!info.isFile() && !info.isDirectory()) throw new Error("Invalid terminal mount source.");
      if (writable) admitWritableDirectory(`/proc/self/fd/${fd}/.`);
      argv.push(writable ? "--bind" : "--ro-bind", `/proc/self/fd/${descriptors.length + 2}`, path);
    };
    for (const root of RUNTIME_ROOTS) if (existsSync(root)) bind(root, false);
    for (const file of RUNTIME_FILES) if (existsSync(file)) bind(file, false);
    bind(workspace, false);
    for (const root of writableRoots.sort((a, b) => a.length - b.length)) bind(root, true);
    argv.push("--tmpfs", join(workspace, ".amc"), "--chmod", "000", join(workspace, ".amc"), "--remount-ro", join(workspace, ".amc"),
      "--tmpfs", "/proc", "--remount-ro", "/proc", "--remount-ro", "/", "--chdir", workspace, "--",
      PYTHON, "-I", "-S", "-u", "-c", NATIVE_PTY_HELPER, String(cols), String(rows));
    return {
      argv: Object.freeze(argv), cwd: workspace,
      env: Object.freeze({ PATH: "/usr/bin:/bin", HOME: "/tmp", TMPDIR: "/tmp", LANG: "C.UTF-8" }),
      extraFds: Object.freeze(descriptors),
      commandExit(): number | null {
        try { return statSync(statusPath).size <= 64_000 ? bwrapCommandExit(readFileSync(statusPath, "utf8")) : null; }
        catch { return null; }
      },
      dispose
    };
  } catch (error) { dispose(); throw error; }
}
