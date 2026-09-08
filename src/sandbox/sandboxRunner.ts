import { seatbeltBackend } from "./seatbeltBackend.js";
import { bwrapBackend } from "./bwrapBackend.js";
import type { SandboxBackend, SandboxOutcome, SandboxPolicy } from "./sandboxTypes.js";

/**
 * The sandbox seam (P4.4).
 *
 * FAILS CLOSED, WHICH IS THE WHOLE POINT. When no backend can enforce on this
 * machine, a confined run is REFUSED — it does not quietly become an
 * unconfined one. Silent passthrough is the failure mode that makes a sandbox
 * worse than none: the operator believes there is a boundary, the evidence
 * says a command ran, and nothing anywhere records that the boundary was
 * absent.
 *
 * An explicit escape hatch exists (`allowUnconfined`) because a developer on a
 * platform with no backend still needs to run the thing. It is a parameter a
 * caller must pass, not a default, and the outcome it produces says
 * `confined: false` — so a run without a boundary is legible as such
 * afterwards rather than indistinguishable from a confined one.
 */

export interface SandboxRunnerInit {
  /** Ordered by preference. The first available one is used. */
  readonly backends?: readonly SandboxBackend[];
  /**
   * Permit running WITHOUT confinement when no backend is available.
   *
   * Off by default. A caller that turns it on is choosing to run unconfined,
   * and the outcome records that choice.
   */
  readonly allowUnconfined?: boolean;
}

/** The backends AMC ships, in preference order. */
export function defaultBackends(): readonly SandboxBackend[] {
  // Availability is a prerequisite only. Linux execution requires a separate
  // launcher status receipt; the backend never promotes binary presence to
  // evidence that a namespace/profile was actually applied.
  return [seatbeltBackend(), bwrapBackend()];
}

export class SandboxRunner {
  private readonly backends: readonly SandboxBackend[];
  private readonly allowUnconfined: boolean;

  constructor(init: SandboxRunnerInit = {}) {
    this.backends = init.backends ?? defaultBackends();
    this.allowUnconfined = init.allowUnconfined ?? false;
  }

  /** The first backend that can enforce here, or null. */
  select(): SandboxBackend | null {
    for (const backend of this.backends) {
      if (backend.available().ok) return backend;
    }
    return null;
  }

  /** Why there is no backend, for a diagnostic that names the reason. */
  unavailableReasons(): string[] {
    return this.backends.map((backend) => {
      const verdict = backend.available();
      return verdict.ok ? `${backend.kind}: available` : `${backend.kind}: ${verdict.reason}`;
    });
  }

  async run(command: readonly string[], cwd: string, policy: SandboxPolicy): Promise<SandboxOutcome> {
    const backend = this.select();
    if (backend) return backend.run(command, cwd, policy);

    const reason = `no sandbox backend is available on ${process.platform} (${this.unavailableReasons().join("; ")})`;
    if (!this.allowUnconfined) {
      return {
        confined: false,
        backend: "none",
        failure: { kind: "unavailable", reason },
        // Nothing ran, so there is no exit status to report. A zero here would
        // read as a command that succeeded.
        exitCode: null,
        timedOut: false,
        stdout: "",
        stderr: "",
        writableRoots: policy.writableRoots
      };
    }

    const { runProcess } = await import("../exec/runProcess.js");
    const outcome = await runProcess({
      argv: [...command],
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

    return {
      confined: false,
      backend: "none",
      failure: { kind: "unavailable", reason },
      exitCode: outcome.exitCode,
      timedOut: outcome.terminatedBy === "timeout",
      stdout: outcome.stdout.text,
      stderr: outcome.stderr.text,
      writableRoots: policy.writableRoots
    };
  }
}

/**
 * Widen a policy, strictly.
 *
 * An escalation after a denial may only ADD writable roots. Returning a fresh
 * policy that replaced the set would let a "widening" quietly remove a root
 * the operator had granted, and an escalation protocol that can narrow is a
 * protocol for laundering a revocation as a grant.
 */
export function widenPolicy(policy: SandboxPolicy, addRoots: readonly string[]): SandboxPolicy {
  return {
    ...policy,
    writableRoots: [...new Set([...policy.writableRoots, ...addRoots])]
  };
}
