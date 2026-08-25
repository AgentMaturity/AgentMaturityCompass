import { JobAccessError } from "./jobTypes.js";
import type { JobId, JobOutcome, JobSettleCause, JobSnapshot, JobSpec } from "./jobTypes.js";

/**
 * The process-local job registry (P4.2).
 *
 * Settlement is the whole design. Four paths can end a job and they race:
 * the work finishes, someone kills it, the owner is disposed, or a deadline
 * passes. Each calls `settle`, which checks and sets one flag before it does
 * anything observable. JavaScript runs this to completion without
 * interleaving, so the flag genuinely admits one winner — and the winner is
 * the FIRST cause to arrive, not the most recent, because a job killed while
 * finishing was killed.
 */

interface JobRecord {
  readonly id: JobId;
  readonly kind: string;
  readonly label: string;
  readonly owner: string;
  readonly startedAt: number;
  readonly controller: AbortController;
  status: "running" | "settled";
  settledAt: number | null;
  outcome: JobOutcome | null;
  readonly waiters: Array<(outcome: JobOutcome) => void>;
}

export type JobSettledListener = (snapshot: JobSnapshot) => void;

/**
 * Consecutive turns the registry may open on one owner before it stops.
 *
 * Not in the P4.2 verification list, and included anyway because the chain is
 * self-exciting by construction: a turn opened by a completion notice can
 * start the very job whose completion opens the next one. Without a bound that
 * is an unbounded loop, and the bound is four lines.
 */
const DEFAULT_WAKE_BUDGET = 3;

export class JobRegistry {
  private readonly jobs = new Map<JobId, JobRecord>();
  private readonly sequence = new Map<string, number>();
  private readonly listeners: Array<{ owner: string; listener: JobSettledListener }> = [];
  private readonly spentWakes = new Map<string, number>();

  constructor(private readonly wakeBudget: number = DEFAULT_WAKE_BUDGET) {}

  start(spec: JobSpec): JobId {
    const next = (this.sequence.get(spec.kind) ?? 0) + 1;
    this.sequence.set(spec.kind, next);
    const id = `${spec.kind}-${next}`;
    const controller = new AbortController();
    const record: JobRecord = {
      id,
      kind: spec.kind,
      label: spec.label,
      owner: spec.owner,
      startedAt: Date.now(),
      controller,
      status: "running",
      settledAt: null,
      outcome: null,
      waiters: []
    };
    this.jobs.set(id, record);

    void spec
      .run(controller.signal)
      .then((result) => this.settle(record, { ...result, cause: "completed" }))
      .catch((error: unknown) => this.settle(record, {
        ok: false,
        cause: "completed",
        summary: error instanceof Error ? error.message : String(error)
      }));

    return id;
  }

  /**
   * The fence. Applied identically wherever a job is reached by id, and it
   * cannot tell a caller whether the id existed.
   */
  private own(id: JobId, caller: string): JobRecord {
    const record = this.jobs.get(id);
    if (!record || record.owner !== caller) throw new JobAccessError(id);
    return record;
  }

  get(id: JobId, caller: string): JobSnapshot {
    return this.snapshot(this.own(id, caller));
  }

  /** Filters rather than throws, so no caller learns another session's labels. */
  list(caller: string): JobSnapshot[] {
    return [...this.jobs.values()]
      .filter((record) => record.owner === caller)
      .map((record) => this.snapshot(record));
  }

  kill(id: JobId, caller: string): void {
    const record = this.own(id, caller);
    record.controller.abort();
    this.settle(record, { ok: false, cause: "killed", summary: "killed by owner" });
  }

  async wait(id: JobId, caller: string): Promise<JobOutcome> {
    const record = this.own(id, caller);
    if (record.outcome !== null) return record.outcome;
    return new Promise<JobOutcome>((resolve) => record.waiters.push(resolve));
  }

  /** Ends every job this owner has, e.g. when its session goes away. */
  disposeOwner(owner: string): void {
    for (const record of this.jobs.values()) {
      if (record.owner !== owner) continue;
      record.controller.abort();
      this.settle(record, { ok: false, cause: "owner-disposed", summary: "owner disposed" });
    }
    this.spentWakes.delete(owner);
  }

  /**
   * Notified once per job, and only about jobs belonging to `owner`.
   *
   * Scoped rather than global. A registry-wide listener would hand every
   * composed plugin another session's labels and summaries, which is the same
   * leak `list()` filters to avoid — reached through a different door.
   */
  onSettled(owner: string, listener: JobSettledListener): () => void {
    const entry = { owner, listener };
    this.listeners.push(entry);
    return () => {
      const at = this.listeners.indexOf(entry);
      if (at >= 0) this.listeners.splice(at, 1);
    };
  }

  /**
   * Whether a completion may open a turn on this owner right now.
   *
   * Spending is deliberate and one-way. There is no automatic refill: every
   * heuristic for "a human spoke" is defeatable by another producer posting to
   * the same inbox, and a budget that refills on something an agent can cause
   * is not a budget. A host that knows a human spoke calls `acknowledge`.
   */
  claimWake(owner: string): boolean {
    const spent = this.spentWakes.get(owner) ?? 0;
    if (spent >= this.wakeBudget) return false;
    this.spentWakes.set(owner, spent + 1);
    return true;
  }

  /** Restores the wake budget. Only a host that saw a human message may call it. */
  acknowledge(owner: string): void {
    this.spentWakes.delete(owner);
  }

  private settle(record: JobRecord, outcome: JobOutcome): void {
    // The one-winner check. Everything observable happens after it.
    if (record.status === "settled") return;
    record.status = "settled";
    record.settledAt = Date.now();
    record.outcome = outcome;

    const snapshot = this.snapshot(record);
    for (const resolve of record.waiters.splice(0)) resolve(outcome);
    for (const entry of [...this.listeners]) {
      if (entry.owner === record.owner) entry.listener(snapshot);
    }
  }

  private snapshot(record: JobRecord): JobSnapshot {
    return {
      id: record.id,
      kind: record.kind,
      label: record.label,
      status: record.status,
      ownerSession: record.owner,
      startedAt: record.startedAt,
      settledAt: record.settledAt,
      outcome: record.outcome
    };
  }
}
