import { Worker } from "node:worker_threads";
import { DEFAULT_AGENT_LOOP_CONFIG } from "../agent/loopTypes.js";
import { WORKER_BOOTSTRAP } from "./workerBootstrap.js";

/**
 * The Code Mode runtime (P4.5).
 *
 * One model-written program per run, in a fresh worker, with every
 * `tools.name(args)` call dispatched back to the host so it re-enters the P4.1
 * pipeline as a sub-call. Guards, approval, budgets and evidence therefore
 * apply to a code-dispatched call exactly as they do to a direct one — which
 * is the only reason Code Mode is allowed to exist in a governance product.
 *
 * THE BOUNDARY, STATED PLAINLY. The worker is a FAULT boundary. Measured: a
 * Node worker can require `node:fs` and write anywhere, spawn processes and
 * open sockets, so a program that ignores `tools` and calls the filesystem
 * directly is not governed by anything here. Also measured: the P4.4 Seatbelt
 * profile DOES cover worker threads — a worker's write outside the workspace
 * is refused with EPERM while one inside succeeds. So the security boundary is
 * the sandbox, and this runner treats confinement as a precondition rather
 * than a nice-to-have.
 *
 * ADMISSION AND SETTLEMENT (WP15). A call is admitted, and counted, the moment
 * its message arrives: before any await, so a `Promise.all` burst cannot slip
 * more than `maxToolCalls` past a count that only grew when results came back.
 * Every verdict (return, throw, timeout, budget, cancellation) first stops
 * admission, then aborts the sub-calls' shared signal, then awaits the worker's
 * actual exit, then waits for accepted sub-calls within the loop's bounded
 * grace. A sub-call still running after that is `unknown`: terminating a worker
 * does not stop a host tool it already dispatched, and nothing here claims a
 * rollback. The published result is a frozen snapshot that later settles
 * cannot change, and nothing is ever posted to a retired worker.
 */

/** One tool call from inside the program, to be run through the pipeline. */
export interface CodeToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** How one sub-call ended. `unknown` is a call that was accepted and never reported an outcome. */
export type CodeCallStatus = "ok" | "failed" | "denied" | "cancelled" | "unknown";

export interface CodeToolResult {
  readonly ok: boolean;
  /** The tool's output, or the denial/failure reason. */
  readonly value: unknown;
  readonly error?: string;
  /** Defaults to `ok` or `failed` from `ok`. */
  readonly status?: CodeCallStatus;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
}

/** What a dispatched sub-call is given by the program run that admitted it. */
interface CodeDispatchContext {
  /** Aborted the moment the program reaches any verdict, and when the enclosing call is cancelled. */
  readonly signal: AbortSignal;
  /** Called with true when the sub-call starts waiting on an approval and false when the wait ends. */
  readonly onApprovalWait: (waiting: boolean) => void;
}

export interface CodeModeLimits {
  /**
   * Wall-clock limit for the whole program, excluding time spent waiting on approvals.
   *
   * Wall rather than CPU, and enforced on the HOST thread. A spinning program
   * never yields, so nothing inside the worker can time itself out — the timer
   * has to live somewhere the program cannot starve.
   */
  readonly wallMs: number;
  /** Total bytes the program may return. A runaway guard: the session's spill policy shapes what the model sees. */
  readonly maxResultBytes: number;
  /** How many tool calls one program may make. */
  readonly maxToolCalls: number;
  /**
   * The approval allowance (DXB-20). Approval waits pause the `wallMs` clock, but the program also has a hard cap that
   * never pauses: `wallMs` plus this allowance from the worker's start. A worker cannot stretch its wall time by
   * keeping a sub-call "waiting" while it computes.
   */
  readonly maxApprovalWaitMs?: number;
}

export const DEFAULT_CODE_LIMITS: CodeModeLimits = {
  wallMs: 30_000,
  maxResultBytes: 16 * 1024 * 1024,
  maxToolCalls: 200,
  maxApprovalWaitMs: 120_000
};

export type CodeRunFailure =
  | "timeout"
  | "call-budget"
  | "result-too-large"
  | "program-error"
  | "cancelled"
  | "worker-capacity"
  | "unconfined";

interface CodeCallRecord {
  readonly name: string;
  readonly ok: boolean;
  readonly status: CodeCallStatus;
  readonly exitCode: number | null;
}

export interface CodeRunOutcome {
  readonly ok: boolean;
  readonly value: unknown;
  readonly failure: CodeRunFailure | null;
  readonly message: string | null;
  /** Every sub-call the program made, in admission order, whether allowed or denied. Frozen. */
  readonly calls: readonly CodeCallRecord[];
  /** What the program wrote to its console, bounded. It never reaches AMC's own stdout (PXB-14). */
  readonly console: string;
  /** False when the run was refused before any worker existed. */
  readonly workerStarted: boolean;
  /** From the verdict to the worker's observed exit; null when no worker ran or its exit was not observed in the grace. */
  readonly workerExitMs: number | null;
}

export interface CodeModeRunnerInit {
  /** Runs one sub-call through the pipeline. Denials come back as ok:false. Must not reject. */
  readonly dispatch: (call: CodeToolCall, context: CodeDispatchContext) => Promise<CodeToolResult>;
  readonly limits?: CodeModeLimits;
  /**
   * Whether the host process is OS-confined.
   *
   * Required. A program that bypasses the `tools` binding is stopped by the
   * sandbox and by nothing else, so running one unconfined means running
   * ungoverned code with a governance story attached to it.
   */
  readonly confined: boolean;
  /** How long a stopping program waits for its worker and sub-calls. Defaults to the loop's abandon grace. */
  readonly abandonGraceMs?: number;
  /** How long a program may wait for a worker slot before it is refused. Defaults to 10 s. */
  readonly slotWaitMs?: number;
}

/** Console bytes kept per program; the rest are counted, not kept. */
const CONSOLE_LIMIT_BYTES = 64 * 1024;

// ponytail: one process-wide count with a bounded wait; a per-session share if one session's programs crowd others out.
const WORKER_CAPACITY = 4;
const DEFAULT_SLOT_WAIT_MS = 10_000;
let workersLive = 0;
const slotWaiters: Array<() => void> = [];

/**
 * A worker slot (PXB-18): a release function to call once, or why none was granted. Waiting is bounded, so a busy
 * process refuses a program instead of queueing it behind other sessions without end.
 */
function acquireWorkerSlot(signal: AbortSignal | undefined, waitMs: number): Promise<(() => void) | "cancelled" | "expired"> {
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    workersLive -= 1;
    slotWaiters.shift()?.();
  };
  if (workersLive < WORKER_CAPACITY) {
    workersLive += 1;
    return Promise.resolve(release);
  }
  return new Promise((resolve) => {
    const give = (answer: "cancelled" | "expired"): void => {
      const index = slotWaiters.indexOf(grant);
      if (index >= 0) slotWaiters.splice(index, 1);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(answer);
    };
    const onAbort = (): void => give("cancelled");
    const timer = setTimeout(() => give("expired"), Math.max(0, waitMs));
    const grant = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      workersLive += 1;
      resolve(release);
    };
    slotWaiters.push(grant);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** `work`'s value, or `fallback` once `deadline` passes. */
async function byDeadline<T>(work: Promise<T>, deadline: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), Math.max(0, deadline - Date.now())); });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

type Verdict = Pick<CodeRunOutcome, "ok" | "value" | "failure" | "message">;
const failed = (failure: CodeRunFailure, message: string): Verdict => ({ ok: false, value: null, failure, message });
const refused = (failure: CodeRunFailure, message: string): CodeRunOutcome =>
  ({ ...failed(failure, message), calls: Object.freeze([]), console: "", workerStarted: false, workerExitMs: null });

export class CodeModeRunner {
  private readonly limits: CodeModeLimits;

  constructor(private readonly init: CodeModeRunnerInit) {
    this.limits = init.limits ?? DEFAULT_CODE_LIMITS;
  }

  async run(source: string, signal?: AbortSignal): Promise<CodeRunOutcome> {
    if (!this.init.confined) {
      return refused("unconfined",
        "code mode requires OS confinement: a program can bypass the tools binding entirely, " +
        "and the sandbox is the only thing that stops it");
    }
    const cancelled = "the enclosing call was cancelled before the program started";
    if (signal?.aborted) return refused("cancelled", cancelled);
    const slot = await acquireWorkerSlot(signal, this.init.slotWaitMs ?? DEFAULT_SLOT_WAIT_MS);
    if (slot === "cancelled") return refused("cancelled", cancelled);
    if (slot === "expired") {
      return refused("worker-capacity", `all ${WORKER_CAPACITY} Code Mode workers stayed busy for ${this.init.slotWaitMs ?? DEFAULT_SLOT_WAIT_MS}ms`);
    }
    let worker: Worker;
    try {
      worker = new Worker(WORKER_BOOTSTRAP, {
        eval: true,
        workerData: { source },
        // Empty. A program that can read the host's environment can read every
        // credential the host holds, and it has no legitimate need for any of it.
        env: {},
        // Captured (PXB-14). Without these the program's console is piped straight onto AMC's own stdout, the
        // stream whose contract is the final structured result.
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 128 }
      });
    } catch (error) {
      slot();
      return refused("program-error", error instanceof Error ? error.message : String(error));
    }
    worker.once("exit", slot);
    return new ProgramRun(worker, this.limits, this.init, signal, slot).settled;
  }
}

interface CallSlot { readonly name: string; ok: boolean; status: CodeCallStatus | null; exitCode: number | null }

/** One program, from its worker's start to its published, frozen outcome. */
class ProgramRun {
  readonly settled: Promise<CodeRunOutcome>;
  private publish!: (outcome: CodeRunOutcome) => void;
  /** Admission is open only while running; every verdict closes it for good. */
  private running = true;
  private readonly calls: CallSlot[] = [];
  /** A program can reach `parentPort` and post forged traffic: every id is answered at most once. */
  private readonly answered = new Set<number>();
  private readonly pending = new Set<Promise<void>>();
  private readonly stopSubCalls = new AbortController();
  private readonly consoleChunks: Buffer[] = [];
  private consoleBytes = 0;
  private consoleDropped = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Wall time since start plus the approval allowance; never paused. */
  private readonly hardCap: ReturnType<typeof setTimeout>;
  private budgetMs: number;
  private since = Date.now();
  private approvalWaits = 0;
  private readonly onOuterAbort = (): void => this.stop(failed("cancelled", "the enclosing call was cancelled"));

  constructor(private readonly worker: Worker, private readonly limits: CodeModeLimits,
    private readonly init: CodeModeRunnerInit, private readonly outer: AbortSignal | undefined,
    private readonly releaseSlot: () => void) {
    this.settled = new Promise((resolve) => { this.publish = resolve; });
    this.budgetMs = limits.wallMs;
    worker.stdout.on("data", (chunk: Buffer | string) => this.capture(chunk));
    worker.stderr.on("data", (chunk: Buffer | string) => this.capture(chunk));
    worker.on("message", (message: unknown) => this.onMessage(message));
    worker.on("error", (error: Error) => this.stop(failed("program-error", error.message)));
    // A worker that exits without a verdict produced nothing. Reporting success here would credit a program that
    // died with whatever the caller's default was.
    worker.on("exit", () => this.stop(failed("program-error", "the program ended without returning a result")));
    outer?.addEventListener("abort", this.onOuterAbort, { once: true });
    const capMs = limits.wallMs + (limits.maxApprovalWaitMs ?? DEFAULT_CODE_LIMITS.maxApprovalWaitMs!);
    this.hardCap = setTimeout(() => this.stop(failed("timeout",
      `program reached its hard cap of ${capMs}ms (the ${limits.wallMs}ms budget plus the approval allowance)`)), capMs);
    this.arm();
  }

  /** Close admission, cancel the sub-calls and settle. Only the first verdict counts. */
  private stop(verdict: Verdict): void {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timer);
    clearTimeout(this.hardCap);
    this.outer?.removeEventListener("abort", this.onOuterAbort);
    this.stopSubCalls.abort();
    void this.settle(verdict);
  }

  private async settle(verdict: Verdict): Promise<void> {
    const stoppedAt = Date.now();
    const deadline = stoppedAt + Math.max(0, this.init.abandonGraceMs ?? DEFAULT_AGENT_LOOP_CONFIG.toolAbandonGraceMs);
    // A terminate that rejects or outlives the grace is not an observed exit, and never a clean cleanup verdict.
    const exited = await byDeadline(this.worker.terminate().then(() => true, () => false), deadline, false);
    const workerExitMs = exited ? Date.now() - stoppedAt : null;
    // Normally freed by `exit`; a worker whose exit was not observed must not hold its slot for ever. Its effects are
    // already reported unknown (see runCodeTool).
    if (!exited) this.releaseSlot();
    await byDeadline(Promise.all(this.pending), deadline, undefined);
    this.publish(Object.freeze({
      ...verdict,
      calls: Object.freeze(this.calls.map((slot) => Object.freeze({ name: slot.name, ok: slot.ok,
        status: slot.status ?? "unknown", exitCode: slot.exitCode }))),
      console: this.consoleText(),
      workerStarted: true,
      workerExitMs
    }));
  }

  /** (Re)start the wall clock with what is left of the budget; stopped while any sub-call waits on an approval (DXB-20). */
  private arm(): void {
    clearTimeout(this.timer);
    if (this.approvalWaits > 0) return; // The hard cap still runs.
    this.timer = setTimeout(() => this.stop(failed("timeout", `program exceeded its ${this.limits.wallMs}ms budget`)),
      Math.max(0, this.budgetMs));
  }

  private approvalWait(waiting: boolean): void {
    if (!this.running) return;
    const now = Date.now();
    if (waiting) {
      if (this.approvalWaits++ > 0) return;
      this.budgetMs -= now - this.since;
      this.arm();
    } else if (this.approvalWaits > 0 && --this.approvalWaits === 0) {
      this.since = now;
      this.arm();
    }
  }

  private capture(chunk: Buffer | string): void {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    const kept = bytes.subarray(0, Math.max(0, CONSOLE_LIMIT_BYTES - this.consoleBytes));
    if (kept.length > 0) this.consoleChunks.push(kept);
    this.consoleBytes += kept.length;
    this.consoleDropped += bytes.length - kept.length;
  }

  private consoleText(): string {
    const text = Buffer.concat(this.consoleChunks).toString("utf8");
    return this.consoleDropped > 0 ? `${text}\n[amc] ${this.consoleDropped} more console bytes dropped` : text;
  }

  private onMessage(message: unknown): void {
    // Nothing a stopping program says is admitted or answered.
    if (!this.running) return;
    // A program can post ANY value on the port, including null and primitives.
    // Reading a field off one of those throws inside the host's listener --
    // which takes down the HOST, not the worker that sent it. This guard is
    // the first thing, deliberately, and a test posts null to prove it.
    if (typeof message !== "object" || message === null) return;
    const envelope = message as { kind?: string; id?: unknown; name?: unknown; args?: unknown; value?: unknown; message?: string };
    if (envelope.kind === "done") return this.stop(this.doneVerdict(envelope.value));
    if (envelope.kind === "failed") return this.stop(failed("program-error", envelope.message ?? "program failed"));

    // Shape-gated field by field, and anything that fails is DROPPED rather
    // than thrown: a throw in this listener would crash the host process, not
    // the worker that sent the junk.
    const id = envelope.id;
    if (envelope.kind !== "call" || typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || typeof envelope.name !== "string") return;
    if (this.answered.has(id)) return;
    this.answered.add(id);
    if (this.calls.length >= this.limits.maxToolCalls) {
      return this.stop(failed("call-budget", `program exceeded ${this.limits.maxToolCalls} tool calls`));
    }
    // Reserved here, synchronously, before the first await: the count is of ACCEPTED calls.
    const slot: CallSlot = { name: envelope.name, ok: false, status: null, exitCode: null };
    this.calls.push(slot);
    const dispatched = this.dispatch(id, slot, { name: envelope.name, args: (envelope.args ?? {}) as Record<string, unknown> });
    this.pending.add(dispatched);
    void dispatched.finally(() => this.pending.delete(dispatched));
  }

  private doneVerdict(value: unknown): Verdict {
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
    } catch {
      // A forged `done` can carry anything structured clone accepts, a BigInt say. Never a throw in this listener.
      return failed("program-error", "the program's result is not JSON");
    }
    return size > this.limits.maxResultBytes
      ? failed("result-too-large", `result was ${size} bytes; the limit is ${this.limits.maxResultBytes}`)
      : { ok: true, value: value ?? null, failure: null, message: null };
  }

  private async dispatch(id: number, slot: CallSlot, call: CodeToolCall): Promise<void> {
    let result: CodeToolResult;
    try {
      result = await this.init.dispatch(call, { signal: this.stopSubCalls.signal, onApprovalWait: (waiting) => this.approvalWait(waiting) });
    } catch (error: unknown) {
      result = { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
    }
    slot.ok = result.ok;
    slot.status = result.status ?? (result.ok ? "ok" : "failed");
    slot.exitCode = result.exitCode ?? null;
    if (!this.running) return; // Never post to a retired worker; its verdict is already decided.
    // A denial goes BACK to the program as a rejected call rather than killing
    // the run. A program that is told "no" can choose something else, which is
    // the behaviour that makes a denial useful rather than merely fatal.
    try {
      this.worker.postMessage({ kind: "call-result", id, ok: result.ok, value: result.value ?? null, error: result.error ?? null,
        status: slot.status, exitCode: slot.exitCode, timedOut: result.timedOut ?? false });
    } catch {
      // The worker went away between the check and the post; its exit is the verdict.
    }
  }
}
