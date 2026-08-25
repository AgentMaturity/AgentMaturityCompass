/**
 * Interactive terminal sessions (P4.2).
 *
 * A terminal is a shell you send a command to and then have to decide when it
 * is finished. That decision is the whole problem: there is no syscall for
 * "the command is done", only evidence of varying strength, so the answer is a
 * LADDER — rungs tried in order of how much they actually prove.
 *
 * The design correction that matters. A ladder whose bottom rung is a deadline
 * has a rung that always passes, and a result type with only a `rung` field
 * cannot then express "this never became ready". A caller reading the output
 * and ignoring the rung would treat a shell that hung as a completed command,
 * and would record it as one. So readiness carries `settled` and `proven`
 * separately from `rung`:
 *
 *   rung       settled  proven   what was actually observed
 *   exited     true     true     the shell is gone
 *   marker     true     true     this send's own sentinel came back
 *   idle       true     false    silence, which is not proof of completion
 *   timeout    FALSE    false    the deadline passed. Not readiness at all.
 *
 * `proven: false` on `idle` is not pedantry. A command that is slow between
 * writes is indistinguishable from one that has finished, and an evidence
 * product must not record a guess in the same shape as an observation.
 */

export type ReadinessRung = "exited" | "marker" | "idle" | "timeout";

export interface TerminalReadiness {
  readonly rung: ReadinessRung;
  /** False when the deadline passed without readiness being established. */
  readonly settled: boolean;
  /** True only when a rung OBSERVED completion rather than inferring it. */
  readonly proven: boolean;
  /** What the rung saw, in words a person can check against the transcript. */
  readonly evidence: string;
  readonly elapsedMs: number;
}

export interface TerminalSendResult {
  readonly readiness: TerminalReadiness;
  /** Output produced by this send, with the sentinel line removed. */
  readonly output: string;
  /** The command's exit status. Only the `marker` rung can know it. */
  readonly exitCode: number | null;
}

/**
 * The backend a session drives.
 *
 * Deliberately small, and `resize` is optional rather than a no-op: a pipe
 * cannot resize, and a backend that silently accepted the call would report a
 * capability it does not have. An absent method is a fact a caller can check.
 */
export interface TerminalBackend {
  readonly kind: "pipe" | "pty";
  write(data: string): void;
  onData(listener: (text: string) => void): () => void;
  onExit(listener: (code: number | null) => void): () => void;
  resize?(cols: number, rows: number): void;
  dispose(): void;
}

export interface TerminalSessionOptions {
  /** Silence after output that is treated as idle. */
  readonly idleSilenceMs?: number;
  /** Absolute limit for one send. */
  readonly timeoutMs?: number;
  /** How often readiness is re-evaluated. */
  readonly pollIntervalMs?: number;
}
