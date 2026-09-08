/**
 * The process-execution contract (P4.2).
 *
 * Shapes chosen from measurement rather than from the shape of the Node API.
 * Two of them are worth stating up front because the rest follows:
 *
 * `treeExitProven` is separate from `exitCode`. Killing a process GROUP is not
 * the same as proving the group is gone, and on macOS there is no pure-Node way
 * to enumerate a process group's members — `kill(-pgid, 0)` answers "is anyone
 * left" and cannot answer "who". So this reports what was actually established:
 * the tree was observed gone, or it was not. Claiming a clean teardown we
 * cannot demonstrate is exactly the false-green this project keeps finding.
 *
 * `droppedBytes` sits beside the captured text. A consumer reading a truncated
 * tail must be able to say how much it did not see; in an evidence product,
 * silent truncation is a claim about output that was never checked.
 */

/** Why a process was asked to stop. Never inferred from an exit code. */
export type TerminateReason = "cancel" | "timeout" | "dispose";

/** How output is handled. `tee` also forwards to the parent's own streams. */
export type OutputMode = "capture" | "tee" | "ignore";

export interface ProcessSpec {
  /** argv[0] is the program. Never shell-interpreted. */
  readonly argv: readonly string[];
  readonly cwd: string;
  /**
   * The COMPLETE environment. There is no inheritance here: a spec that wants
   * the parent's variables says so by building them in. `spawnMonitoredProcess`
   * inherited by default and then remembered to strip provider keys in one of
   * its two spawn sites, which is how the version probe ended up handing every
   * provider key to an unvetted binary.
   */
  readonly env: Readonly<Record<string, string>>;
  /**
   * `"pipe"` opens a writable the caller feeds; `"ignore"` gives the child no
   * stdin at all. Defaulting to `"ignore"` is deliberate — a process that
   * inherits a terminal it was not meant to read from can steal the operator's
   * keystrokes from AMC itself.
   */
  readonly stdin: "ignore" | "pipe";
  readonly stdout: OutputMode;
  readonly stderr: OutputMode;
  /** Bytes retained per stream. Output past this is counted, not kept. */
  readonly maxCaptureBytes: number;
  /** Exact values removed from output before anyone sees it. */
  readonly scrubValues: readonly string[];
  /**
   * Called with text that has already been bounded-checked and scrubbed.
   *
   * The recording hook. It deliberately sees the SAME text the operator sees
   * rather than the raw bytes, so there is no arrangement in which the log and
   * the terminal disagree about what the process said.
   */
  readonly onOutput?: (stream: "stdout" | "stderr", text: string) => void;
  /** Milliseconds between SIGTERM and SIGKILL when terminating. */
  readonly graceMs: number;
  /** Wall-clock limit; exceeding it terminates with reason "timeout". */
  readonly timeoutMs?: number;
  /** Aborting terminates the tree with reason "cancel". */
  readonly signal?: AbortSignal;
  /** Explicit launcher-owned descriptors, inherited as fd 3 onward; never inferred from the environment. */
  readonly extraFds?: readonly number[];
}

export interface CapturedStream {
  /** Retained text, already scrubbed. */
  readonly text: string;
  /** Everything the process wrote, including what was not retained. */
  readonly totalBytes: number;
  /** Bytes discarded because the cap was reached. Zero when nothing was lost. */
  readonly droppedBytes: number;
}

export interface ProcessOutcome {
  readonly exitCode: number | null;
  /** Set when the kernel killed it. Independent of exitCode. */
  readonly signal: string | null;
  /** Why WE stopped it, or null when it ended on its own. */
  readonly terminatedBy: TerminateReason | null;
  /**
   * Whether the process group was observed empty afterwards.
   *
   * False does not mean survivors exist — it means none were demonstrated
   * absent. The distinction matters because "we could not prove it" and
   * "we proved it" are different evidentiary claims.
   */
  readonly treeExitProven: boolean;
  readonly stdout: CapturedStream;
  readonly stderr: CapturedStream;
  readonly pid: number | null;
  readonly durationMs: number;
}
