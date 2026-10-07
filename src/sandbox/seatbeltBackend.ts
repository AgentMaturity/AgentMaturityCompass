import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../exec/runProcess.js";
import type { SandboxBackend, SandboxOutcome, SandboxPolicy } from "./sandboxTypes.js";

/**
 * The macOS Seatbelt backend (P4.4b).
 *
 * Everything here was measured on darwin rather than read, because the
 * behaviour is not what the profile language suggests:
 *
 * 1. PATHS MUST BE REAL. `(subpath "/var/folders/…")` matches nothing,
 *    because `/var` is a symlink to `/private/var` and Seatbelt matches the
 *    resolved path. It fails SILENTLY — no error, no confinement, and an
 *    operator who believed the workspace was writable finds it is not.
 *
 * 2. `(deny default)` IS TOO TIGHT TO START A SHELL. A profile denying
 *    everything and re-allowing reads of /usr, /bin and /System still aborts
 *    `/bin/sh` at load with SIGABRT (exit 134), because dyld needs more than
 *    file reads. The workable shape is `(allow default)` then `(deny
 *    file-write*)` with the workspace re-allowed: write confinement, which is
 *    the property P4.4 actually names.
 *
 * 3. A DENIAL IS EPERM TO THE COMMAND, and invisible to us. `sandbox-exec`
 *    reports nothing; the command sees `Operation not permitted` and decides
 *    what to do. So this backend never claims to have counted denials.
 *
 * 4. RUNNER FAILURE IS EXIT 65 with a legible `sandbox-exec:` message on
 *    stderr — a bad profile, a missing profile. That is cleanly separable from
 *    anything the command itself can produce, which is what makes honest
 *    attribution possible at all.
 *
 * WHAT IS NOT CONFINED. Reads. A coding agent has to load Node, libraries and
 * toolchains from all over the filesystem, and an allowlist wide enough for
 * that is not a meaningful read boundary. Network is not confined here either
 * — AMC's egress allowlist is the orthogonal layer for that, by design. This
 * backend confines WRITES, and says so rather than implying more.
 */

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** `sandbox-exec` uses this for its own failures: bad profile, missing file. */
const RUNNER_FAILURE_EXIT = 65;

/**
 * Was this the RUNNER failing, rather than the command?
 *
 * `sandbox-exec` exits 65 and prefixes its own message when it cannot apply a
 * profile. Both halves are required: a command may legitimately exit 65
 * (`EX_DATAERR` is a normal choice for a linter), and a command may print the
 * string "sandbox-exec:" for any reason at all. Only the pair is the runner
 * speaking.
 *
 * Exported because this is the whole attribution decision, and it should be
 * checkable on its own rather than only through a run that is hard to break
 * deliberately.
 */
export function isRunnerFailure(exitCode: number | null, stderr: string): boolean {
  return exitCode === RUNNER_FAILURE_EXIT && stderr.includes("sandbox-exec:");
}

/**
 * Resolve through symlinks, or fall back to the literal path.
 *
 * A path that does not exist cannot be resolved, and naming it in the profile
 * anyway is harmless — nothing can be written to a directory that is not
 * there.
 */
export function realOrLiteral(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** SBPL string literals: only backslash and quote need escaping. */
export function sbplString(value: string): string {
  return value.split("\\").join("\\\\").split("\"").join("\\\"");
}

export function buildSeatbeltProfile(writableRoots: readonly string[]): string {
  const roots = writableRoots.map((root) => `(subpath "${sbplString(realOrLiteral(root))}")`);
  return [
    "(version 1)",
    ";; Reads stay open: a toolchain loads from all over the filesystem, and an",
    ";; allowlist wide enough to run Node is not a read boundary worth claiming.",
    "(allow default)",
    ";; Writes are the boundary.",
    "(deny file-write*)",
    ";; /dev is required for a process to have stdio at all.",
    `(allow file-write* (literal "/dev/null") (literal "/dev/dtracehelper") (literal "/dev/tty"))`,
    roots.length > 0 ? `(allow file-write* ${roots.join(" ")})` : ";; no writable roots",
    ""
  ].join("\n");
}

export function seatbeltBackend(): SandboxBackend {
  return {
    kind: "seatbelt",

    available(): { ok: true } | { ok: false; reason: string } {
      if (process.platform !== "darwin") {
        return { ok: false, reason: `Seatbelt is macOS-only; this is ${process.platform}` };
      }
      if (!existsSync(SANDBOX_EXEC)) {
        return { ok: false, reason: `${SANDBOX_EXEC} is not present` };
      }
      return { ok: true };
    },

    async run(command: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> {
      const writableRoots = policy.writableRoots.map(realOrLiteral);
      const profileDir = mkdtempSync(join(tmpdir(), "amc-sbpl-"));
      const profilePath = join(profileDir, "policy.sb");
      writeFileSync(profilePath, buildSeatbeltProfile(policy.writableRoots), { mode: 0o600 });

      try {
        const outcome = await runProcess({
          argv: [SANDBOX_EXEC, "-f", profilePath, ...command],
          cwd,
          env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" },
          stdin: "ignore",
          stdout: "capture",
          stderr: "capture",
          maxCaptureBytes: 64_000,
          scrubValues: [],
          graceMs: 2_000,
          timeoutMs: policy.timeoutMs
        }).done;

        const stderr = outcome.stderr.text;
        // The runner saying it could not apply the profile. Reporting that as
        // a command failure sends a person to debug the wrong program.
        const runnerFailed = isRunnerFailure(outcome.exitCode, stderr);

        return {
          confined: !runnerFailed,
          backend: "seatbelt",
          failure: runnerFailed
            ? { kind: "runner-failure", reason: stderr.split("\n")[0] ?? "sandbox-exec refused the profile" }
            : null,
          // A run that never started has no exit status of its own.
          exitCode: runnerFailed ? null : outcome.exitCode,
          timedOut: outcome.terminatedBy === "timeout",
          stdout: outcome.stdout.text,
          stderr,
          writableRoots
        };
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }
    }
  };
}
