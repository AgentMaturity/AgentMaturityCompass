/**
 * OS-level confinement (P4.4).
 *
 * AMC's most-confessed enforcement gap: every control up to here — the
 * firewall, budgets, the signed allowlist, read-before-edit — is AMC asking a
 * process to behave. This is the kernel refusing.
 *
 * THE HONESTY CONSTRAINT THAT SHAPES THIS FILE. Measured on darwin: a denied
 * write surfaces to the command as `EPERM`, and `sandbox-exec` itself reports
 * nothing. The write does not happen — confinement is real — but "was
 * something denied?" is not reliably observable, because a command that
 * swallows the error exits 0 and looks identical to one that never tried.
 *
 * So this contract reports what was ESTABLISHED, never a denial count it
 * cannot see. `confined` says a profile was applied and names the roots that
 * were writable. A `denied: boolean` here would be a field that reads false
 * for both "nothing was denied" and "we could not tell", which is the exact
 * shape of false-green this project keeps finding.
 */

/** Where confinement came from, or why there is none. */
export type SandboxBackendKind = "seatbelt" | "landlock" | "bwrap" | "none";

export interface SandboxPolicy {
  /**
   * Directories the command may write to. Everything else is read-only.
   *
   * Paths are resolved through symlinks before they reach the backend: on
   * darwin `/var` is a link to `/private/var`, and a profile naming the
   * unresolved path matches nothing at all — silently, with no error and no
   * confinement where the operator believed there was some.
   */
  readonly writableRoots: readonly string[];
  /** Wall-clock limit for the confined command. */
  readonly timeoutMs: number;
  /** Native shells deny direct networking; `allowHosts` is the only, proxied exception. */
  readonly network?: "deny";
  readonly signal?: AbortSignal;
  readonly scrubValues?: readonly string[];
  /** Digest of the signed tools configuration that supplied the write grant. */
  readonly sourcePolicySha256?: string;
  /** Exact paths the command may neither read nor write; real paths where they exist. */
  readonly readDeny?: readonly string[];
  /** Present only with a signed egress allowlist: hosts reachable through AMC's per-call proxy. */
  readonly allowHosts?: readonly string[];
  /** Processes the command may add to the user's count at launch (RLIMIT_NPROC); absent applies no cap. */
  readonly maxProcesses?: number;
  /** Receives every egress proxy decision before it takes effect; a throw denies that connection. */
  readonly onEgress?: (row: ShellEgressRow) => void;
}

/** One `NATIVE_SHELL_EGRESS` decision by the shell's egress proxy. */
export interface ShellEgressRow {
  readonly host: string;
  readonly port: number;
  readonly decision: "allow" | "deny";
  readonly reason: string;
}

/**
 * Why a confined run failed, when it was not the command's own fault.
 *
 * `runner-failure` exists so an unusable profile is never reported as a
 * command that misbehaved. Blaming the command for the harness's own broken
 * configuration sends a person to debug the wrong thing.
 */
export type SandboxFailure =
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "runner-failure"; readonly reason: string };

export interface SandboxOutcome {
  /** True only when a real backend applied a real profile. */
  readonly confined: boolean;
  readonly backend: SandboxBackendKind;
  /** Set when the run could not be attempted, or the runner itself broke. */
  readonly failure: SandboxFailure | null;
  /** The command's own result. Null when it never ran or no trustworthy exit receipt exists. */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** The writable roots that were in force, as the backend saw them. */
  readonly writableRoots: readonly string[];
  readonly treeExitProven?: boolean;
  readonly cancelled?: boolean;
  readonly droppedBytes?: number;
  readonly enforcement?: {
    readonly boundary: "linux-bwrap" | "macos-seatbelt";
    readonly hostWrites: "declared-roots-only";
    readonly reads: "workspace-ro-and-runtime" | "open-except-denylist";
    readonly network: "denied" | "proxy-allowlist";
    readonly allowHosts: readonly string[];
    readonly processLimit: { readonly mechanism: "rlimit-nproc"; readonly max: number } | null;
    readonly readonlyRoots: readonly string[];
    readonly privateWritableRoots: readonly string[];
    readonly launcherStatus: "command-exited";
    readonly sourcePolicySha256: string | null;
    readonly limitations: readonly string[];
  };
}

/**
 * A confinement backend.
 *
 * `available()` is separate from `run()` so a host can report what a machine
 * can do before it tries to do it — a first-run diagnostic that says "no
 * sandbox backend on this platform" is more useful than a failed command.
 */
export interface SandboxBackend {
  readonly kind: SandboxBackendKind;
  /** Whether backend prerequisites exist. Actual enforcement is established by run(), not this check. */
  available(): { ok: true } | { ok: false; reason: string };
  run(command: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome>;
}
