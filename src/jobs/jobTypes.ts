/**
 * Background jobs (P4.2).
 *
 * A job is work that outlives the turn that started it. The two properties
 * that make it safe are both about identity rather than scheduling:
 *
 * OWNER-FENCED. Every job belongs to one session. Reading, killing or waiting
 * on someone else's job is refused. The fence is authorization, not secrecy —
 * a registry incarnation prevents stale handles from targeting new work after
 * restart. Learned ids still require the same owner check.
 *
 * SETTLES EXACTLY ONCE. Several paths can end a job — it finishes, it is
 * killed, its owner is disposed, its deadline passes — and they can race. A
 * job that settled twice would deliver two completion notices for one piece of
 * work, and a wake is a real side effect: it opens a turn.
 *
 * Scope, stated so nobody assumes more: these jobs are PROCESS-LOCAL. They do
 * not survive a restart and there is no persisted state to reconcile, so
 * "exactly once" here means "no two settlement paths both win", not "durable
 * across a crash".
 */

export type JobId = string;

export type JobStatus = "running" | "stopping" | "settled";
export type JobCleanup = "pending" | "confirmed" | "unknown";

/** Trusted loop metadata; never supplied in model arguments. */
export interface JobOwnerStep {
  readonly sessionId: string;
  readonly turn: number;
  readonly step: number;
  readonly callId: string;
}

export interface JobResult {
  readonly ok: boolean;
  readonly summary: string;
  /** Explicit proof of producer/process-tree quiescence; abort alone is not proof. */
  readonly cleanupConfirmed?: boolean;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly effect?: "applied" | "not_applied" | "unknown";
}

/** Why a job ended. Kept separate from whether it succeeded. */
export type JobSettleCause = "completed" | "killed" | "owner-disposed" | "timeout";

export interface JobOutcome {
  readonly ok: boolean;
  readonly cause: JobSettleCause;
  /** Short human-facing text. Scrubbed by whoever produced it. */
  readonly summary: string;
  readonly outcome: "OK" | "ERROR" | "TOOL_OUTCOME_UNKNOWN";
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

export interface JobSpec {
  /** Groups the sequence within a registry incarnation: `<incarnation>:bash-1`. */
  readonly kind: string;
  /** The session that may read, kill and wait on this job. */
  readonly owner: string;
  readonly label: string;
  readonly ownerStep?: JobOwnerStep;
  /** Abort requests cleanup; the result or separate cleanup promise must prove it. */
  readonly run: (signal: AbortSignal, output: (text: string) => void) => Promise<JobResult>;
  /** A separate physical cleanup acknowledgment, independent of logical settlement. */
  readonly cleanup?: Promise<boolean>;
  readonly timeoutMs?: number;
}

export interface JobSnapshot {
  readonly id: JobId;
  readonly kind: string;
  readonly label: string;
  readonly status: JobStatus;
  readonly ownerSession: string;
  readonly ownerStep: JobOwnerStep | null;
  readonly stopRequested: boolean;
  readonly cleanup: JobCleanup;
  readonly outputBytes: number;
  readonly droppedBytes: number;
  readonly startedAt: number;
  readonly settledAt: number | null;
  readonly outcome: JobOutcome | null;
}

/**
 * One error for "no such job" and for "not yours".
 *
 * A caller who learns a handle must not discover another session's jobs.
 * Missing and foreign ids remain indistinguishable within each incarnation.
 */
export class JobAccessError extends Error {
  constructor(id: JobId) {
    super(`no job "${id}" available to this session`);
    this.name = "JobAccessError";
  }
}

/** Absolute byte positions in the scrubbed producer output, with missing ranges explicit. */
export interface JobOutput {
  readonly cursor: number;
  readonly nextCursor: number;
  readonly totalBytes: number;
  readonly droppedBytes: number;
  readonly segments: readonly { readonly offset: number; readonly text: string }[];
  readonly snapshot: JobSnapshot;
}
