/**
 * Running one step's tool calls, in the order the model asked for them.
 *
 * Ported from dsh's `executeToolCalls` (`packages/core/agent-loop/src/tool-calls.ts`)
 * with two AMC-specific differences, both about evidence.
 *
 * FIRST: AMC DOES NOT WRITE THE `tool/call` ROWS HERE. P3.1's stream recorder
 * already wrote one per surviving `tool_use` block when the stream settled —
 * before this function is reached, and therefore before any side effect. dsh
 * appends the call row at dispatch; AMC's ordering is strictly stronger and this
 * module must not duplicate it. What follows from that is the rule this module
 * is really built around: EVERY call the recorder wrote a row for must get a
 * `tool/result`, on every exit path. A dangling call is not merely untidy — the
 * derived conversation would carry a `tool_use` part with no result, which a
 * provider rejects outright, so the session could never be resumed.
 *
 * SECOND: WHEN THE SEAM ITSELF THROWS, the calls it had already started are
 * answered `TOOL_OUTCOME_UNKNOWN` rather than left open. dsh leaves them for its
 * crash repair. AMC answers immediately because the value exists for exactly
 * this — "the side effect may or may not have happened, and nobody knows which"
 * — and because leaving them open would make a live, healthy session's own
 * surface invalid until something crashed and got repaired.
 *
 * THIRD: THE POOL BOUNDS ITS OWN WAITING, AND ONLY ITS WAITING. There is no
 * per-call deadline here — see `AgentLoopConfig.toolAbandonGraceMs` for why a
 * loop-level wall clock on a running tool is the wrong instrument. What is
 * bounded is how long a STOPPING step waits: once the step is cancelled or the
 * seam has thrown, in-flight calls get the grace window to settle, and then the
 * pool stops waiting and answers them `TOOL_OUTCOME_UNKNOWN`. The alternative
 * is an unbounded wait, which makes cancellation a request that any misbehaving
 * tool can veto — and a `cancel` that cannot stop the agent is the one failure
 * this subsystem must not have.
 *
 * THE TWO SYNTHETIC ANSWERS ARE NOT INTERCHANGEABLE:
 *   `CANCELLED`              — the loop never attempted the call. No side effect.
 *   `TOOL_OUTCOME_UNKNOWN`   — the loop attempted it and never learned the result.
 * One vocabulary for "it never started", one for "we do not know", and the same
 * two words crash repair uses, so a reader needs one rule, not two.
 *
 * DISPATCH MAY OVERLAP; RESULTS MAY NOT. `committed` advances only across
 * contiguous slots, so a call that finishes early waits for its predecessors
 * before its row is written. Model order is what the conversation means.
 */
import type { SessionService } from "../session/sessionService.js";
import type { ToolOutcome } from "../session/sessionTypes.js";
import type { ToolUseContentBlock } from "../llm/streamChunk.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "./toolSeam.js";

export interface ToolCallsInput {
  readonly session: SessionService;
  readonly tools: AgentToolSeam;
  readonly turn: number;
  readonly step: number;
  readonly signal: AbortSignal;
  readonly maxParallel: number;
  /** How long a stopping pool waits for in-flight calls before abandoning them. */
  readonly abandonGraceMs: number;
  readonly parentToken: string | null;
  /** Where a tool's `additionalContext` goes: the same inbox a human steer uses. */
  readonly acceptContext: (text: string) => void;
  /** The model's calls, in model order. */
  readonly calls: readonly ToolUseContentBlock[];
}

/** What running a step's calls told the loop about the turn. */
export interface ToolCallsResult {
  /** A committed result asked the loop to finish the turn rather than ask again. */
  readonly concluded: boolean;
  /** True when the run stopped because the step was cancelled. */
  readonly aborted: boolean;
}

const NOT_DISPATCHED = "[amc:loop] tool call not dispatched — the run was cancelled before it started.";
const SEAM_FAILED = "[amc:loop] tool call not dispatched — the tool seam failed before it started.";
const SEAM_UNKNOWN =
  "[amc:loop] tool call dispatched, outcome unknown — the tool seam failed while it was running. " +
  "The side effect may or may not have happened; retry only if the operation is read-only or idempotent.";
const ABANDONED_UNKNOWN =
  "[amc:loop] tool call dispatched, outcome unknown — the step stopped and this tool had not " +
  "returned when the grace window expired, so the loop stopped waiting for it. It may still be " +
  "running. The side effect may or may not have happened; retry only if the operation is " +
  "read-only or idempotent.";

/**
 * The sentinel a race resolves to when the pool gives up waiting.
 *
 * Negative because every other resolution is an array index, so the two can
 * never be confused by a reader or by a bounds check.
 */
const ABANDONED = -1;

/**
 * The clock that ends a stopping pool's wait.
 *
 * ARMED BY A REASON, NOT BY A START. It begins when the step acquires a reason
 * to stop — the signal aborted, or the seam threw — rather than when a call was
 * dispatched, which is what keeps it from being a disguised tool deadline: a
 * tool running for an hour in a healthy step is never touched by it.
 *
 * Idempotent, because the first reason owns the window: a cancel that arrives
 * during a seam failure must not restart the clock and extend a wait the caller
 * already asked to end.
 */
class AbandonClock {
  private readonly graceMs: number;

  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Resolves ABANDONED once the grace window has expired. Never rejects. */
  readonly reached: Promise<number>;

  private fire: () => void = () => {
    // Replaced synchronously by the executor below.
  };

  constructor(graceMs: number) {
    this.graceMs = Math.max(0, graceMs);
    this.reached = new Promise<number>((resolve) => {
      this.fire = () => {
        resolve(ABANDONED);
      };
    });
  }

  arm(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(this.fire, this.graceMs);
    // A grace window must never be the reason a process stays alive: the pool is
    // waiting on tools, not keeping the runtime up on their behalf.
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  dispose(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Run every call, then guarantee every call has an answer.
 *
 * The outer `finally` is the guarantee: whatever happened — a clean run, a
 * cancellation, the seam throwing — indices that reached no committed result are
 * answered before this function returns or rethrows.
 */
export async function runToolCalls(input: ToolCallsInput): Promise<ToolCallsResult> {
  const state = new RunState(input);
  try {
    await state.run();
  } catch (error: unknown) {
    // Let every already-dispatched call settle before anything is written about
    // it. Answering while a dispatch is still running would record UNKNOWN for a
    // call whose real outcome arrives a millisecond later.
    await state.drain();
    throw error;
  } finally {
    state.answerUnfinished();
    state.dispose();
  }
  return { concluded: state.concluded, aborted: state.aborted };
}

/** One tool call after the loop has decided how to describe it to the seam. */
function requestFor(input: ToolCallsInput, call: ToolUseContentBlock): ToolCallRequest {
  return {
    callId: call.id,
    toolName: call.name,
    rawArguments: call.arguments,
    sessionId: input.session.sessionId,
    turn: input.turn,
    step: input.step,
    parentToken: input.parentToken,
    dispatch: "native",
    signal: input.signal
  };
}

/**
 * The scheduler's mutable state.
 *
 * A class rather than a closure over a dozen `let`s: the answer-everything
 * guarantee lives in `answerUnfinished`, and that method has to be reachable
 * from a `finally` in the caller with all the bookkeeping still in scope.
 */
class RunState {
  readonly input: ToolCallsInput;

  /** Settled outcomes by index; a hole means "no result yet". */
  private readonly slots: (ToolCallOutcome | undefined)[];

  private readonly inFlight = new Map<number, Promise<number>>();

  /** How far the contiguous, model-ordered commit has reached. */
  private committed = 0;

  /** How many calls were handed to the seam. */
  private started = 0;

  /**
   * The seam failure, WITH the call it happened on.
   *
   * The index is not bookkeeping: it is what lets the one call the seam broke on
   * be described as such, while its siblings — which the pool merely stopped
   * waiting for — are described as abandoned. Both are TOOL_OUTCOME_UNKNOWN,
   * because both are genuinely unknown, but an operator reading the log is
   * asking two different questions and the rows answer them differently.
   */
  private failure: { readonly error: unknown; readonly index: number } | undefined;

  private readonly clock: AbandonClock;

  /** Arms the clock the moment the step is cancelled, not when the pool notices. */
  private readonly onAbort: () => void;

  concluded = false;

  aborted = false;

  constructor(input: ToolCallsInput) {
    this.input = input;
    this.slots = input.calls.map(() => undefined);
    this.aborted = input.signal.aborted;
    this.clock = new AbandonClock(input.abandonGraceMs);
    // The grace window is measured from the CANCEL, not from the pool's next
    // trip round its wait loop. A tool that is mid-`await` when the stop arrives
    // must not be handed extra time just because the loop was busy elsewhere.
    this.onAbort = (): void => {
      this.clock.arm();
    };
    if (this.aborted) this.clock.arm();
    else input.signal.addEventListener("abort", this.onAbort, { once: true });
  }

  /** Release the timer and the listener. The signal outlives the step; they must not. */
  dispose(): void {
    this.clock.dispose();
    this.input.signal.removeEventListener("abort", this.onAbort);
  }

  /** Walk the calls as exclusive barriers and parallel pools until they are consumed. */
  async run(): Promise<void> {
    let next = 0;
    while (next < this.input.calls.length && !this.aborted) {
      const first = this.input.calls[next]!;
      const mode = this.input.tools.executionMode(requestFor(this.input, first));
      // An exclusive tool is a barrier of size one; parallel tools form a pool
      // that runs until the next call reclassifies itself as exclusive.
      const groupEnd = mode === "parallel" ? this.input.calls.length : next + 1;
      next = await this.runGroup(next, groupEnd, mode);
    }
  }

  /**
   * Fill and drain one group, returning the first index it did not consume.
   *
   * A group ends early when a later call reclassifies as exclusive, which is why
   * this returns a position rather than a count.
   */
  private async runGroup(from: number, groupEnd: number, mode: "parallel" | "exclusive"): Promise<number> {
    let nextToStart = from;
    const fillPool = (): void => {
      while (
        !this.aborted &&
        nextToStart < groupEnd &&
        this.inFlight.size < Math.max(1, this.input.maxParallel)
      ) {
        const call = this.input.calls[nextToStart]!;
        // Re-read after each ordered commit so a registry change mid-group can
        // still create a barrier for the calls that have not started.
        if (
          nextToStart > from &&
          mode === "parallel" &&
          this.input.tools.executionMode(requestFor(this.input, call)) !== "parallel"
        ) {
          break;
        }
        this.start(nextToStart, call);
        nextToStart += 1;
        this.commitReady();
        if (this.input.signal.aborted) this.aborted = true;
      }
    };

    fillPool();
    while (this.inFlight.size > 0) {
      // The clock is the only thing in this race that is not a tool. Without it
      // a tool that never returns and never observes its signal holds the pool,
      // the turn, and the driver open for as long as the process lives.
      const settled = await Promise.race([...this.inFlight.values(), this.clock.reached]);
      if (settled === ABANDONED) {
        // Stop waiting, do not stop the tools: nothing here can halt a function
        // that will not return. What is dropped is the CLAIM that their outcomes
        // will be learned — `answerUnfinished` records them UNKNOWN.
        this.inFlight.clear();
        if (this.input.signal.aborted) this.aborted = true;
        this.throwFailure();
        break;
      }
      this.inFlight.delete(settled);
      this.throwFailure();
      this.commitReady();
      if (this.input.signal.aborted) this.aborted = true;
      fillPool();
    }
    this.throwFailure();
    return nextToStart;
  }

  private start(index: number, call: ToolUseContentBlock): void {
    this.started = Math.max(this.started, index + 1);
    this.inFlight.set(
      index,
      this.input.tools.execute(requestFor(this.input, call)).then(
        (outcome) => {
          this.slots[index] = outcome;
          return index;
        },
        (error: unknown) => {
          // The SEAM threw — not the tool. A tool that fails returns an ERROR
          // outcome; reaching here means the pipeline itself broke, and nothing
          // about this call's side effect is known.
          this.failure ??= { error, index };
          // A broken seam is a reason to stop, so the drain below is bounded from
          // here rather than from whenever the caller gets round to draining.
          this.clock.arm();
          return index;
        }
      )
    );
  }

  /** Write every contiguous settled result, in model order. */
  private commitReady(): void {
    while (this.committed < this.input.calls.length) {
      const outcome = this.slots[this.committed];
      if (outcome === undefined) break;
      const call = this.input.calls[this.committed]!;
      this.input.session.recordToolResult({
        toolCallId: call.id,
        outcome: outcome.outcome,
        exitCode: outcome.exitCode,
        timedOut: outcome.timedOut,
        denied: outcome.denied,
        content: outcome.content
      });
      for (const text of outcome.additionalContext ?? []) this.input.acceptContext(text);
      this.concluded ||= outcome.concludesTurn === true;
      this.committed += 1;
    }
  }

  /**
   * Wait — for a bounded time — for every dispatch to settle.
   *
   * Fabricates nothing and records nothing; it exists so that a call whose real
   * outcome is one millisecond away is not written down as unknown. But the wait
   * is bounded by the same grace window the cancel path uses, because a sibling
   * that hangs must not turn a seam failure into a wedged process. Whatever has
   * not settled by then is abandoned in place and answered UNKNOWN above.
   */
  async drain(): Promise<void> {
    this.clock.arm();
    await Promise.race([
      Promise.allSettled([...this.inFlight.values()]),
      this.clock.reached
    ]);
    this.inFlight.clear();
  }

  private throwFailure(): void {
    if (this.failure !== undefined) throw this.failure.error;
  }

  /**
   * Answer every call that never reached a committed result.
   *
   * Runs on EVERY exit — clean, cancelled, or the seam throwing — and in model
   * order, so the conversation the log projects is a valid one whatever happened.
   * A slot that did settle is written with its real outcome even here: discarding
   * a known result to keep a loop simple would be recording less than AMC knows.
   */
  answerUnfinished(): void {
    // Anything already settled and contiguous is written with its true outcome
    // first, so the synthetic answers below only ever cover real gaps.
    this.commitReady();
    const seamFailed = this.failure !== undefined;
    for (let index = this.committed; index < this.input.calls.length; index += 1) {
      const call = this.input.calls[index]!;
      const settled = this.slots[index];
      if (settled !== undefined) {
        this.input.session.recordToolResult({
          toolCallId: call.id,
          outcome: settled.outcome,
          exitCode: settled.exitCode,
          timedOut: settled.timedOut,
          denied: settled.denied,
          content: settled.content
        });
        continue;
      }
      // Starts are issued in order, so the high-water mark is exactly the set of
      // calls that reached the seam.
      const dispatched = index < this.started;
      if (!dispatched) {
        this.answer(call.id, "CANCELLED", seamFailed ? SEAM_FAILED : NOT_DISPATCHED);
        continue;
      }
      // Dispatched and unsettled. Either the seam broke ON THIS CALL, or the
      // pool stopped waiting for it — if neither were true it would have a slot,
      // because every other path waits for its dispatches.
      const brokeHere = this.failure !== undefined && this.failure.index === index;
      this.answer(call.id, "TOOL_OUTCOME_UNKNOWN", brokeHere ? SEAM_UNKNOWN : ABANDONED_UNKNOWN);
    }
    this.committed = this.input.calls.length;
  }

  private answer(callId: string, outcome: ToolOutcome, content: string): void {
    this.input.session.recordToolResult({
      toolCallId: callId,
      outcome,
      exitCode: null,
      timedOut: false,
      denied: false,
      content
    });
  }
}
