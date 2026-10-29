import { randomUUID } from "node:crypto";
import { OutputCollector } from "../exec/outputCollector.js";
import { JobAccessError } from "./jobTypes.js";
import type { JobCleanup, JobId, JobOutcome, JobOutput, JobResult, JobSettleCause, JobSnapshot, JobSpec } from "./jobTypes.js";

interface JobRecord {
  readonly id: JobId;
  readonly spec: JobSpec;
  readonly startedAt: number;
  readonly controller: AbortController;
  readonly output: OutputCollector;
  readonly changed: Set<() => void>;
  readonly waiters: Array<(outcome: JobOutcome) => void>;
  cleanup: JobCleanup;
  stopRequested: boolean;
  outputEnded: boolean;
  settledAt: number | null;
  outcome: JobOutcome | null;
  deadline: ReturnType<typeof setTimeout> | null;
}

export type JobSettledListener = (snapshot: JobSnapshot) => void;
export interface JobRegistryConfig {
  readonly wakeBudget?: number;
  readonly maxActivePerOwner?: number;
  readonly maxActiveTotal?: number;
  readonly maxOwners?: number;
  readonly maxRetainedPerOwner?: number;
  readonly maxOutputBytes?: number;
  readonly cleanupGraceMs?: number;
}

const DEFAULTS = { wakeBudget: 3, maxActivePerOwner: 4, maxActiveTotal: 16, maxOwners: 64, maxRetainedPerOwner: 32, maxOutputBytes: 64_000, cleanupGraceMs: 2_500 } as const;
const OMITTED = Buffer.from("\n[amc: output middle omitted]\n");

/** One logical verdict per job. Cleanup is separately observed and never inferred from abort(). */
export class JobRegistry {
  /** A transcript handle from an earlier registry must never target new work. */
  private readonly incarnation = randomUUID();
  private readonly jobs = new Map<JobId, JobRecord>();
  private readonly sequence = new Map<string, number>();
  private readonly listeners: Array<{ owner: string; listener: JobSettledListener }> = [];
  private readonly spentWakes = new Map<string, number>();
  /** A shared runtime may rotate sessions; keep every owner-keyed collection within one bound. */
  private readonly owners = new Set<string>();
  private readonly closedOwners = new Set<string>();
  private disposed = false;
  private readonly config: Required<JobRegistryConfig>;

  constructor(config: number | JobRegistryConfig = {}) {
    this.config = { ...DEFAULTS, ...(typeof config === "number" ? { wakeBudget: config } : config) };
    for (const [name, value] of Object.entries(this.config)) {
      if (!Number.isSafeInteger(value) || value < (name === "wakeBudget" ? 0 : 1) || value > 1_000_000) {
        throw new RangeError(`Invalid job registry ${name}`);
      }
    }
    if (this.config.maxOutputBytes < 64) throw new RangeError("Job output cap must be at least 64 bytes");
    if (this.config.cleanupGraceMs > 30_000) throw new RangeError("Job cleanup grace cannot exceed 30 seconds");
  }

  start(spec: JobSpec): JobId {
    if (this.disposed || this.closedOwners.has(spec.owner)) throw new Error("This job owner is disposed; new jobs are refused.");
    if (!spec.owner || Buffer.byteLength(spec.owner) > 256 || !/^[a-zA-Z][\w.-]{0,63}$/.test(spec.kind)
      || !spec.label || Buffer.byteLength(spec.label) > 512) throw new RangeError("Invalid job owner, kind or label");
    if (spec.ownerStep && (spec.ownerStep.sessionId !== spec.owner || !Number.isSafeInteger(spec.ownerStep.turn)
      || spec.ownerStep.turn < 0 || !Number.isSafeInteger(spec.ownerStep.step) || spec.ownerStep.step < 0
      || !spec.ownerStep.callId || Buffer.byteLength(spec.ownerStep.callId) > 256)) throw new Error("Invalid job step ownership");
    if (spec.timeoutMs !== undefined && (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs <= 0 || spec.timeoutMs > 86_400_000)) {
      throw new RangeError("Invalid job deadline");
    }
    this.prune(spec.owner);
    const active = [...this.jobs.values()].filter(job => job.outcome === null || job.cleanup !== "confirmed");
    if (active.filter(job => job.spec.owner === spec.owner).length >= this.config.maxActivePerOwner) {
      throw new Error("This session has reached its active job quota; unconfirmed cleanup still consumes a slot.");
    }
    if (active.length >= this.config.maxActiveTotal) throw new Error("This registry has reached its global active job quota; unknown old-owner jobs still consume slots.");
    if (!this.sequence.has(spec.kind) && this.sequence.size >= 64) throw new Error("Job kind quota exceeded");
    if (!this.reserveOwner(spec.owner)) throw new Error("This registry has reached its owner quota; start a new admitted runtime before rotating sessions again.");
    const next = (this.sequence.get(spec.kind) ?? 0) + 1;
    this.sequence.set(spec.kind, next);
    const id = `${this.incarnation}:${spec.kind}-${next}`;
    const record: JobRecord = {
      id, spec: { ...spec, ...(spec.ownerStep ? { ownerStep: Object.freeze({ ...spec.ownerStep }) } : {}) },
      startedAt: Date.now(), controller: new AbortController(), output: new OutputCollector(this.config.maxOutputBytes, []),
      changed: new Set(), waiters: [], cleanup: "pending", stopRequested: false, outputEnded: false,
      settledAt: null, outcome: null, deadline: null
    };
    this.jobs.set(id, record);
    if (spec.timeoutMs !== undefined) record.deadline = setTimeout(() => this.stop(record, "timeout", "job deadline exceeded"), spec.timeoutMs);
    if (spec.cleanup) void spec.cleanup.then(proven => this.observeCleanup(record, proven === true), () => this.observeCleanup(record, false));
    const emit = (text: string): void => {
      if (record.outputEnded) return;
      // Bound each temporary collector buffer as well as retained head/tail memory.
      for (let start = 0; start < text.length;) {
        let end = Math.min(start + 8_192, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
        record.output.push(Buffer.from(text.slice(start, end)));
        start = end;
      }
      this.changed(record);
    };
    let running: Promise<JobResult>;
    try { running = spec.run(record.controller.signal, emit); }
    catch (error) { running = Promise.reject(error); }
    void running.then(result => {
      if (result.cleanupConfirmed === true) this.observeCleanup(record, true);
      else if (!spec.cleanup) this.observeCleanup(record, false);
      this.finishOutput(record);
      this.settle(record, this.outcome(result, "completed", record.cleanup === "confirmed"));
    }, error => {
      if (!spec.cleanup) this.observeCleanup(record, false);
      this.finishOutput(record);
      this.settle(record, this.outcome({ ok: false, summary: error instanceof Error ? error.message : String(error) }, "completed", false));
    });
    return id;
  }

  private own(id: JobId, caller: string): JobRecord {
    const record = this.jobs.get(id);
    if (!record || record.spec.owner !== caller) throw new JobAccessError(id);
    return record;
  }

  get(id: JobId, caller: string): JobSnapshot { return this.snapshot(this.own(id, caller)); }

  list(caller: string): JobSnapshot[] {
    return [...this.jobs.values()].filter(record => record.spec.owner === caller).map(record => this.snapshot(record));
  }

  /** Stop requested is an immutable logical verdict, not a physical exit acknowledgment. */
  kill(id: JobId, caller: string, reason = "killed by owner"): void {
    this.stop(this.own(id, caller), "killed", boundedText(reason, 512));
  }

  async wait(id: JobId, caller: string): Promise<JobOutcome> {
    const record = this.own(id, caller);
    if (record.outcome !== null) return record.outcome;
    if (record.waiters.length >= 64) throw new Error("Too many job waiters");
    return new Promise<JobOutcome>(resolve => record.waiters.push(resolve));
  }

  /** A finite, cancellable poll wait; timeout does not kill or logically settle the job. */
  async waitFor(id: JobId, caller: string, timeoutMs: number, signal?: AbortSignal): Promise<JobSnapshot> {
    const record = this.own(id, caller);
    await this.waitForChange(record, timeoutMs, signal);
    return this.snapshot(record);
  }

  async waitForCleanup(id: JobId, caller: string, timeoutMs = this.config.cleanupGraceMs, signal?: AbortSignal): Promise<JobSnapshot> {
    const record = this.own(id, caller);
    const until = Date.now() + this.waitLimit(timeoutMs);
    while (record.cleanup === "pending" && !signal?.aborted && Date.now() < until) {
      await this.waitForChange(record, until - Date.now(), signal);
    }
    if (record.cleanup === "pending") this.observeCleanup(record, false);
    return this.snapshot(record);
  }

  readOutput(id: JobId, caller: string, options: { readonly cursor?: number; readonly maxBytes?: number } = {}): JobOutput {
    // Authenticate before validating cursors, so foreign and absent ids reveal the same thing.
    const record = this.own(id, caller);
    const cursor = options.cursor ?? 0;
    const maxBytes = options.maxBytes ?? 8_192;
    const captured = record.output.snapshot();
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > captured.totalBytes
      || !Number.isSafeInteger(maxBytes) || maxBytes < 4 || maxBytes > 64_000) throw new RangeError("Invalid job output cursor or byte limit");
    const preview = Buffer.from(captured.text);
    let retained: Array<{ offset: number; bytes: Buffer }>;
    if (captured.droppedBytes === 0) retained = [{ offset: 0, bytes: preview }];
    else {
      // Input is already scrubbed by its producer. No registry rewrite changes byte positions.
      const headLimit = Math.floor((this.config.maxOutputBytes - OMITTED.length) / 2);
      const marker = preview.lastIndexOf(OMITTED, headLimit);
      const tail = preview.subarray(marker + OMITTED.length);
      retained = [{ offset: 0, bytes: preview.subarray(0, marker) }, { offset: captured.totalBytes - tail.length, bytes: tail }];
    }
    let remaining = maxBytes;
    let nextCursor = cursor;
    const segments: Array<{ offset: number; text: string }> = [];
    for (const part of retained) {
      let start = Math.max(0, cursor - part.offset);
      if (start >= part.bytes.length || remaining === 0) continue;
      while (start < part.bytes.length && (part.bytes[start]! & 0xc0) === 0x80) start++;
      let end = Math.min(part.bytes.length, start + remaining);
      while (end > start && end < part.bytes.length && (part.bytes[end]! & 0xc0) === 0x80) end--;
      if (end === start) continue;
      const bytes = part.bytes.subarray(start, end);
      segments.push({ offset: part.offset + start, text: bytes.toString("utf8") });
      remaining -= bytes.length;
      nextCursor = part.offset + end;
    }
    if (segments.length === 0) nextCursor = captured.totalBytes;
    return { cursor, nextCursor, totalBytes: captured.totalBytes, droppedBytes: captured.droppedBytes, segments, snapshot: this.snapshot(record) };
  }

  hasOwnedWork(owner?: string): boolean {
    return [...this.jobs.values()].some(record => (owner === undefined || record.spec.owner === owner)
      && (record.outcome === null || record.cleanup !== "confirmed"));
  }

  /** Refuse all future admission before the first await, then reap every still-owned producer within bounds. */
  async disposeOwner(owner: string): Promise<JobSnapshot[]> {
    // An untracked owner beyond the cap cannot start work, so it needs no unbounded tombstone.
    if (this.reserveOwner(owner)) this.closedOwners.add(owner);
    const owned = [...this.jobs.values()].filter(record => record.spec.owner === owner);
    for (const record of owned) if (record.outcome === null || record.cleanup !== "confirmed") this.stop(record, "owner-disposed", "owner disposed");
    const snapshots = await Promise.all(owned.map(record => this.waitForCleanup(record.id, owner)));
    this.spentWakes.delete(owner);
    return snapshots;
  }

  /** Whole-composition teardown includes owners used directly by tools after a session rotation. */
  async disposeAll(): Promise<JobSnapshot[]> {
    this.disposed = true;
    const owners = [...new Set([...this.jobs.values()].map(record => record.spec.owner))];
    return (await Promise.all(owners.map(owner => this.disposeOwner(owner)))).flat();
  }

  onSettled(owner: string, listener: JobSettledListener): () => void {
    if (!this.reserveOwner(owner)) throw new Error("This registry has reached its owner quota.");
    if (this.listeners.filter(entry => entry.owner === owner).length >= 64) throw new Error("Too many job listeners");
    const entry = { owner, listener };
    this.listeners.push(entry);
    return () => { const at = this.listeners.indexOf(entry); if (at >= 0) this.listeners.splice(at, 1); };
  }

  claimWake(owner: string): boolean {
    if (this.disposed || this.closedOwners.has(owner) || !this.reserveOwner(owner)) return false;
    const spent = this.spentWakes.get(owner) ?? 0;
    if (spent >= this.config.wakeBudget) return false;
    this.spentWakes.set(owner, spent + 1);
    return true;
  }

  /** Only a trusted host that observed human input may refill the budget. */
  acknowledge(owner: string): void { this.spentWakes.delete(owner); }

  private reserveOwner(owner: string): boolean {
    if (!owner || Buffer.byteLength(owner) > 256) return false;
    if (this.owners.has(owner)) return true;
    if (this.owners.size >= this.config.maxOwners) return false;
    this.owners.add(owner);
    return true;
  }

  private stop(record: JobRecord, cause: JobSettleCause, summary: string): void {
    if (record.outcome !== null && record.cleanup === "confirmed") return;
    record.stopRequested = true;
    // Publish the first cause before synchronous abort handlers can resolve, re-enter or throw.
    this.settle(record, this.outcome({ ok: false, summary }, cause, record.cleanup === "confirmed"));
    record.controller.abort();
  }

  private outcome(result: JobResult, cause: JobSettleCause, proven: boolean): JobOutcome {
    const known = proven && result.effect !== "unknown";
    return Object.freeze({ ok: known && result.ok === true, cause, summary: boundedText(result.summary, 512),
      outcome: known ? result.ok ? "OK" : "ERROR" : "TOOL_OUTCOME_UNKNOWN", exitCode: result.exitCode ?? null, timedOut: result.timedOut === true || cause === "timeout" });
  }

  private settle(record: JobRecord, outcome: JobOutcome): void {
    if (record.outcome !== null) return;
    record.settledAt = Date.now();
    record.outcome = outcome;
    if (record.deadline) { clearTimeout(record.deadline); record.deadline = null; }
    const snapshot = this.snapshot(record);
    for (const resolve of record.waiters.splice(0)) resolve(outcome);
    this.changed(record);
    for (const entry of [...this.listeners]) {
      if (entry.owner === record.spec.owner) {
        try { entry.listener(snapshot); } catch { /* An observer cannot veto cleanup or other notices. */ }
      }
    }
    this.prune(record.spec.owner);
  }

  private finishOutput(record: JobRecord): void {
    if (record.outputEnded) return;
    record.outputEnded = true;
    record.output.end();
    this.changed(record);
  }

  private observeCleanup(record: JobRecord, proven: boolean): void {
    if (record.cleanup === "confirmed") return;
    record.cleanup = proven ? "confirmed" : "unknown";
    this.changed(record);
    this.prune(record.spec.owner);
  }

  private changed(record: JobRecord): void { for (const notify of [...record.changed]) notify(); }

  private waitLimit(timeoutMs: number): number {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) throw new RangeError("Invalid job wait deadline");
    return timeoutMs;
  }

  private waitForChange(record: JobRecord, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    this.waitLimit(timeoutMs);
    if (timeoutMs === 0 || signal?.aborted) return Promise.resolve();
    if (record.changed.size >= 64) throw new Error("Too many job output waiters");
    return new Promise<void>(resolve => {
      const done = (): void => {
        clearTimeout(timer); record.changed.delete(done); signal?.removeEventListener("abort", done); resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      record.changed.add(done);
      signal?.addEventListener("abort", done, { once: true });
      if (signal?.aborted) done();
    });
  }

  private prune(owner: string): void {
    const retained = [...this.jobs.values()].filter(record => record.spec.owner === owner && record.cleanup === "confirmed" && record.outcome !== null && record.changed.size === 0);
    while (retained.length > this.config.maxRetainedPerOwner) this.jobs.delete(retained.shift()!.id);
  }

  private snapshot(record: JobRecord): JobSnapshot {
    const output = record.output.snapshot();
    return { id: record.id, kind: record.spec.kind, label: record.spec.label,
      status: record.outcome === null ? "running" : record.cleanup === "confirmed" ? "settled" : "stopping",
      ownerSession: record.spec.owner, ownerStep: record.spec.ownerStep ?? null, stopRequested: record.stopRequested,
      cleanup: record.cleanup, outputBytes: output.totalBytes, droppedBytes: output.droppedBytes,
      startedAt: record.startedAt, settledAt: record.settledAt, outcome: record.outcome };
  }
}

function boundedText(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text.slice(0, maxBytes));
  let end = Math.min(maxBytes, bytes.length);
  while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}
