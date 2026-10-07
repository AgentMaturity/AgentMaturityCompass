import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

/**
 * The native shell's process cap (P1-05): RLIMIT_NPROC set inside the sandbox
 * before the command starts.
 *
 * RLIMIT_NPROC counts every process of the user (on Linux, every thread), not
 * the command's own, so the cap is the user's count at launch plus the signed
 * allowance. It is never below what already runs, which would stop the command
 * from starting anything at all.
 */
export const DEFAULT_MAX_PROCESSES = 256;

export const PROCESS_LIMIT_LIMITATION = "The process cap is RLIMIT_NPROC: it counts every process of your user (threads on Linux), so it is your process count at launch plus the signed allowance, not a count of the command's own processes.";

/** Linux charges threads of the real user id; procfs is always there, `ps` is not in slim images. */
function linuxTaskCount(uid: number): number {
  let count = 0;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const status = readFileSync(`/proc/${entry}/status`, "utf8");
      if (Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]) === uid) count += Number(/^Threads:\s+(\d+)/m.exec(status)?.[1] ?? 1);
    } catch { /* The process exited while counting. */ }
  }
  return count;
}

export function processLimit(maxProcesses: number): number {
  const uid = process.getuid?.();
  if (uid === undefined || !Number.isSafeInteger(maxProcesses) || maxProcesses < 1) throw new Error("The process cap needs a POSIX user id and a positive allowance.");
  if (process.platform === "linux") return linuxTaskCount(uid) + maxProcesses;
  const listing = execFileSync("/bin/ps", ["-U", String(uid), "-o", "pid="], { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
  return listing.split("\n").filter(line => line.trim() !== "").length + maxProcesses;
}

/**
 * Prefix a command so it starts only under the limit. bash and zsh name the
 * limit `-u`, dash `-p`; when neither applies the command never runs.
 */
export function withProcessLimit(limit: number, command: readonly string[]): string[] {
  return ["/bin/sh", "-c", 'ulimit -u "$1" 2>/dev/null || ulimit -p "$1" 2>/dev/null || { echo "amc: the process limit could not be applied; the command did not run" >&2; exit 125; }; shift; exec "$@"',
    "amc-process-cap", String(limit), ...command];
}
