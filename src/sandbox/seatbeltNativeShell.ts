import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runProcess } from "../exec/runProcess.js";
import { admitWritableDirectory, within } from "./bwrapBackend.js";
import { startShellEgressProxy, type ShellEgressProxy } from "./egress/shellEgressProxy.js";
import { PROCESS_LIMIT_LIMITATION, processLimit, withProcessLimit } from "./processCap.js";
import { realOrLiteral, sbplString } from "./seatbeltBackend.js";
import type { SandboxBackend, SandboxOutcome, SandboxPolicy } from "./sandboxTypes.js";

/**
 * The macOS native shell (P1-05): `/bin/sh` under a Seatbelt profile.
 *
 * Writes are confined to the signed roots, a per-call private TMPDIR and
 * /dev/null. Reads stay open except a deny-list of credential stores, AMC's
 * authority directories and the signed `readDeny`; a toolchain loads from all
 * over the filesystem, so a read allowlist is not a boundary worth claiming.
 * All networking is denied, Unix sockets included; with a signed egress
 * allowlist the only exception is AMC's per-call proxy port on localhost.
 *
 * Seatbelt matches resolved paths only (`/var` is `/private/var`), so every
 * path is resolved first. `sandbox-exec` reports nothing when it applies a
 * profile, so confinement is measured: before the command starts, a wrapper
 * inside the profile must fail to write a launcher-owned probe and succeed in
 * writing a marker to its private TMPDIR. Without both, the command never ran
 * and the outcome is not confined.
 */
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** Home-relative secrets every macOS shell is denied, before the signed `readDeny`. */
export const MACOS_SECRET_PATHS = [".ssh", ".aws", ".config/gcloud", ".azure", ".gnupg", ".kube", ".docker",
  ".netrc", ".npmrc", "Library/Keychains", ".amc"] as const;

// `true`, not `:`: a failed redirection on a special builtin ends a POSIX shell such as dash.
const PROBE_WRAPPER = '{ true >"$1"; } 2>/dev/null && exit 125; true >"$2" || exit 125; shift 2; exec "$@"';
const MARKER = ".amc-seatbelt-applied";

export function seatbeltPrerequisites(): { ok: true } | { ok: false; reason: string } {
  if (process.platform !== "darwin") return { ok: false, reason: "Seatbelt requires macOS." };
  try {
    const info = statSync(SANDBOX_EXEC);
    return info.isFile() && info.uid === 0 && (info.mode & 0o6022) === 0 && (info.mode & 0o111) !== 0 ? { ok: true }
      : { ok: false, reason: `${SANDBOX_EXEC} must be a root-owned, non-setuid executable without group or other write permission.` };
  } catch {
    return { ok: false, reason: `${SANDBOX_EXEC} is missing.` };
  }
}

export interface SeatbeltShellProfileInput {
  /** All paths real (resolved). */
  readonly workspace: string;
  readonly writableRoots: readonly string[];
  readonly privateTmp: string;
  readonly denied: readonly string[];
  readonly proxyPort: number | null;
}

export function buildSeatbeltShellProfile(input: SeatbeltShellProfileInput): string {
  const subpaths = (paths: readonly string[]): string => paths.map(path => `(subpath "${sbplString(path)}")`).join(" ");
  return [
    "(version 1)",
    ";; Reads stay open except the deny-list below. Mach services are not restricted.",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${subpaths([...input.writableRoots, input.privateTmp])} (literal "/dev/null"))`,
    `(deny file-read* file-write* ${subpaths([join(input.workspace, ".amc"), ...input.denied])})`,
    "(deny network*)",
    ...(input.proxyPort === null ? [] : [`(allow network-outbound (remote ip "localhost:${input.proxyPort}"))`]),
    ""
  ].join("\n");
}

const LIMITATIONS = [
  "Reads outside the deny-list stay open: the command can read any other file your user can.",
  "Mach and XPC services are not restricted; a system service reached that way acts outside this profile, including on the network.",
  "sandbox-exec is deprecated by Apple; the profile is checked on the macOS versions AMC's CI runs, not on every release.",
  "This confines a shell subprocess, not AMC or worker-thread Code Mode.",
  "Existing hard-link aliases and special files in write grants are refused; concurrent trusted host writers are outside this subprocess boundary.",
  "A successful command does not establish a count of denied operations."
];

export function seatbeltNativeShell(): SandboxBackend {
  return {
    kind: "seatbelt",
    // A prerequisite check, not proof that the kernel applied a profile.
    available: seatbeltPrerequisites,
    async run(command: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> {
      const declined = (reason: string, kind: "unavailable" | "runner-failure" = "runner-failure"): SandboxOutcome => ({
        confined: false, backend: "seatbelt", failure: { kind, reason }, exitCode: null,
        timedOut: false, stdout: "", stderr: "", writableRoots: [], treeExitProven: true
      });
      const available = seatbeltPrerequisites();
      if (!available.ok) return declined(available.reason, "unavailable");
      if (!command.length || command.some(argument => argument.includes("\0"))) return declined("Invalid confined command.");
      if (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0) return declined("A positive finite shell deadline is required.");
      if (policy.allowHosts && !policy.onEgress) return declined("A shell egress allowlist requires an egress audit recorder.");
      if (policy.signal?.aborted) return { ...declined("The shell was cancelled before launch."), cancelled: true };
      let launcher: string | undefined;
      let proxy: ShellEgressProxy | undefined;
      let launched = false;
      try {
        const workspace = realpathSync(cwd);
        if (!statSync(workspace).isDirectory() || workspace === "/") return declined("The macOS shell workspace must be a directory other than /.");
        const writableRoots = [...new Set(policy.writableRoots.map(path => {
          const real = realpathSync(path);
          if (resolve(path) !== real || !within(workspace, real) || !statSync(real).isDirectory() || within(join(workspace, ".amc"), real)) {
            throw new Error("Invalid macOS shell directory grant.");
          }
          // A preexisting hard link in a grant writes through to its target outside it.
          admitWritableDirectory(real);
          return real;
        }))];
        const taskParent = realpathSync(tmpdir());
        if (within(workspace, taskParent)) return declined("Launcher state must be outside the exposed workspace.");
        launcher = mkdtempSync(join(taskParent, "amc-seatbelt-"));
        const privateTmp = join(launcher, "tmp");
        mkdirSync(privateTmp, { mode: 0o700 });
        const home = realOrLiteral(homedir());
        const denied = [...MACOS_SECRET_PATHS.map(path => realOrLiteral(join(home, path))), ...(policy.readDeny ?? []).map(realOrLiteral)];
        const env: Record<string, string> = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: privateTmp, TMPDIR: privateTmp, LANG: "en_US.UTF-8" };
        if (policy.allowHosts && policy.onEgress) {
          proxy = await startShellEgressProxy({ allowHosts: policy.allowHosts, record: policy.onEgress });
          for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]) env[name] = env[name.toLowerCase()] = proxy.url;
        }
        const profilePath = join(launcher, "profile.sb");
        writeFileSync(profilePath, buildSeatbeltShellProfile({ workspace, writableRoots, privateTmp, denied, proxyPort: proxy?.port ?? null }), { mode: 0o600 });
        const limit = policy.maxProcesses === undefined ? null : processLimit(policy.maxProcesses);
        const probe = join(launcher, "probe");
        const marker = join(privateTmp, MARKER);
        launched = true;
        const outcome = await runProcess({
          argv: [SANDBOX_EXEC, "-f", profilePath, "/bin/sh", "-c", PROBE_WRAPPER, "amc-seatbelt-probe", probe, marker,
            ...(limit === null ? command : withProcessLimit(limit, command))],
          cwd: workspace, env, stdin: "ignore", stdout: "capture", stderr: "capture", maxCaptureBytes: 64_000,
          scrubValues: [...(policy.scrubValues ?? []), ...(proxy ? [proxy.token] : [])], graceMs: 2_000, timeoutMs: policy.timeoutMs,
          ...(policy.signal ? { signal: policy.signal } : {})
        }).done;
        // A profile sandbox-exec refused never reaches the wrapper, so no marker covers that case too.
        const applied = existsSync(marker) && !existsSync(probe);
        return {
          confined: applied, backend: "seatbelt",
          failure: !applied ? { kind: "runner-failure", reason: "Seatbelt did not confirm the profile before the command; the command did not run under it and no unconfined fallback was attempted." }
            : !outcome.treeExitProven ? { kind: "runner-failure", reason: "The launcher exited but process-group cleanup could not be confirmed." } : null,
          exitCode: applied ? outcome.exitCode : null, timedOut: outcome.terminatedBy === "timeout", cancelled: outcome.terminatedBy === "cancel",
          stdout: outcome.stdout.text, stderr: outcome.stderr.text, writableRoots: applied ? writableRoots : [],
          treeExitProven: outcome.treeExitProven, droppedBytes: outcome.stdout.droppedBytes + outcome.stderr.droppedBytes,
          ...(applied ? { enforcement: {
            boundary: "macos-seatbelt" as const, hostWrites: "declared-roots-only" as const, reads: "open-except-denylist" as const,
            network: proxy ? "proxy-allowlist" as const : "denied" as const, allowHosts: [...(policy.allowHosts ?? [])],
            processLimit: limit === null ? null : { mechanism: "rlimit-nproc" as const, max: limit },
            readonlyRoots: ["/"], privateWritableRoots: [privateTmp, "/dev/null"], launcherStatus: "command-exited" as const,
            sourcePolicySha256: policy.sourcePolicySha256 ?? null, limitations: [...LIMITATIONS, ...(limit === null ? [] : [PROCESS_LIMIT_LIMITATION])]
          } } : {})
        };
      } catch {
        // Do not put arbitrary host paths, command text or launcher exceptions into an audit reason.
        return { ...declined("macOS shell admission or launcher execution failed; no unconfined fallback was attempted."), treeExitProven: !launched };
      } finally {
        proxy?.close();
        if (launcher) rmSync(launcher, { recursive: true, force: true });
      }
    }
  };
}
