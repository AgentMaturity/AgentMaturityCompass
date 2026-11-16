import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../exec/runProcess.js";
import { EgressUnavailable, proxyEnvironment, startPolicyEgress, withRefusals } from "./egress/sessionEgress.js";
import type { ShellEgressProxy } from "./egress/shellEgressProxy.js";
import { SEATBELT_NO_OUTSIDE_HELPERS, seatbeltNetworkRules } from "./seatbeltRules.js";
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
 * NETWORK IS DENIED, as in the native shell profile (seatbeltNativeShell.ts):
 * `(deny network*)`, Unix sockets included, so DNS through mDNSResponder fails
 * too; and Mach lookups are limited to five system services with LaunchServices,
 * AppleEvents and launchd jobs denied, so the command cannot ask another
 * process to fetch something for it. With a signed `allowHosts` the only
 * exception is AMC's per-call egress proxy on `localhost:<port>`.
 *
 * WHAT IS NOT CONFINED. Reads. A coding agent has to load Node, libraries and
 * toolchains from all over the filesystem, and an allowlist wide enough for
 * that is not a meaningful read boundary. Nor a process count. A caller asking
 * for a read deny-list or a process cap is refused with nothing run.
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

export function buildSeatbeltProfile(writableRoots: readonly string[], proxyPort: number | null = null): string {
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
    ";; No network: only AMC's per-call egress proxy port, when the caller has a signed allow-list.",
    ...seatbeltNetworkRules(proxyPort),
    ...SEATBELT_NO_OUTSIDE_HELPERS,
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
      // This profile confines writes and the network. A requested read or process
      // boundary is refused with nothing launched, never silently left open (WP32).
      const unenforceable = (["readDeny", "maxProcesses"] as const).filter((field) => policy[field] !== undefined);
      const refuse = (kind: "unavailable" | "runner-failure", reason: string): SandboxOutcome =>
        ({ confined: false, backend: "seatbelt", exitCode: null, timedOut: false, stdout: "", stderr: "", writableRoots, failure: { kind, reason } });
      if (unenforceable.length > 0) return refuse("unavailable", `the Seatbelt backend cannot enforce ${unenforceable.join(", ")}; nothing was run`);
      let proxy: ShellEgressProxy | null = null;
      const profileDir = mkdtempSync(join(tmpdir(), "amc-sbpl-"));
      try {
        try { proxy = await startPolicyEgress(policy); }
        catch (error) { return refuse("runner-failure", error instanceof EgressUnavailable ? error.message : "AMC's network filter could not start; nothing was run."); }
        const profilePath = join(profileDir, "policy.sb");
        writeFileSync(profilePath, buildSeatbeltProfile(policy.writableRoots, proxy?.port ?? null), { mode: 0o600 });
        const outcome = await runProcess({
          argv: [SANDBOX_EXEC, "-f", profilePath, ...command],
          cwd,
          env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", ...(proxy?.url ? proxyEnvironment(proxy.url) : {}) },
          stdin: "ignore",
          stdout: "capture",
          stderr: "capture",
          maxCaptureBytes: 64_000,
          // Forwarded as bwrap does: dropping them returned unscrubbed output and skipped streaming without saying so.
          scrubValues: [...(policy.scrubValues ?? []), ...(proxy ? [proxy.token] : [])],
          ...(policy.onOutput ? { onOutput: policy.onOutput } : {}),
          graceMs: 2_000,
          timeoutMs: policy.timeoutMs,
          ...(policy.signal ? { signal: policy.signal } : {})
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
          cancelled: outcome.terminatedBy === "cancel",
          stdout: outcome.stdout.text,
          stderr: withRefusals(stderr, proxy),
          writableRoots
        };
      } finally {
        proxy?.close();
        rmSync(profileDir, { recursive: true, force: true });
      }
    }
  };
}
