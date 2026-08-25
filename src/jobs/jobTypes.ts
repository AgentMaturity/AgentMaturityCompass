/**
 * Background jobs (P4.2).
 *
 * A job is work that outlives the turn that started it. The two properties
 * that make it safe are both about identity rather than scheduling:
 *
 * OWNER-FENCED. Every job belongs to one session. Reading, killing or waiting
 * on someone else's job is refused. The fence is authorization, not secrecy —
 * ids are short and guessable on purpose, because a scheme whose safety rests
 * on unguessable ids is one leak away from having no safety.
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

export type JobStatus = "running" | "settled";

/** Why a job ended. Kept separate from whether it succeeded. */
export type JobSettleCause = "completed" | "killed" | "owner-disposed" | "timeout";

export interface JobOutcome {
  readonly ok: boolean;
  readonly cause: JobSettleCause;
  /** Short human-facing text. Scrubbed by whoever produced it. */
  readonly summary: string;
}

export interface JobSpec {
  /** Groups the id sequence: `bash-1`, `bash-2`. */
  readonly kind: string;
  /** The session that may read, kill and wait on this job. */
  readonly owner: string;
  readonly label: string;
  /** The work. Aborting the signal must stop it. */
  readonly run: (signal: AbortSignal) => Promise<Omit<JobOutcome, "cause">>;
}

export interface JobSnapshot {
  readonly id: JobId;
  readonly kind: string;
  readonly label: string;
  readonly status: JobStatus;
  readonly ownerSession: string;
  readonly startedAt: number;
  readonly settledAt: number | null;
  readonly outcome: JobOutcome | null;
}

/**
 * One error for "no such job" and for "not yours".
 *
 * Ids are predictable by design, so a caller that could tell the two apart
 * could enumerate `bash-1`, `bash-2`, … and learn exactly how many jobs of
 * each kind another session is running. Indistinguishable is the point.
 */
export class JobAccessError extends Error {
  constructor(id: JobId) {
    super(`no job "${id}" available to this session`);
    this.name = "JobAccessError";
  }
}
