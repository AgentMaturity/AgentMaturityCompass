/**
 * The turn/step machine — AMC running an agent (plan P3.2).
 *
 * Ported from dsh's `ReactLoopAgent` (`packages/core/agent-loop/src/agent.ts`),
 * driven entirely through `SessionService` so that every fact the loop produces
 * is a signed, hash-chained evidence row rather than a log line.
 *
 * THE SHAPE, AND WHY IT IS THIS SHAPE.
 *
 *   A TURN is a bracket around ONE claim from the inbox. It opens with
 *   `turn/start` and closes with `turn/end` IN A FINALLY — on every exit path,
 *   including a throw and including a cancellation. That finally is not
 *   defensive tidiness: it is the entire mechanism by which a cancelled turn is
 *   BALANCED rather than truncated. A truncated turn is indistinguishable from a
 *   crashed one, and this project's whole position is that "someone stopped this
 *   agent" and "this agent died" are different facts that a log must keep apart.
 *
 *   A STEP is one model request plus the tool calls it asked for. It opens with
 *   `step/start` and closes with `step/end`, also in a finally, so the same
 *   balance holds one level down — crash repair synthesises a `step/end` before
 *   a `turn/end` for exactly this reason, and a live loop that skipped it would
 *   produce a shape recovery never produces.
 *
 * EVERY ENDING IS ASSIGNED AT A DEFINITE SITE. `complete` when the model asked
 * for nothing more or a tool concluded the turn; `max_tokens` when a response
 * hit the output ceiling (and it is STICKY — a later clean step must not erase
 * the fact that output was truncated); `max_steps` at the loop's own cap;
 * `blocked` when a pre-step listener vetoed; `error` on any non-abort throw;
 * `cancelled` when the signal aborted, carrying the cause the canceller named.
 * `interrupted` is unreachable from here by construction: the spine's writer
 * refuses it from a live origin.
 *
 * AN UNWRITABLE `turn/end` IS FATAL. If the spine cannot commit the closer, the
 * evidence is already incomplete, and continuing would layer a second turn onto
 * a log whose first turn is open. The driver enters a terminal `failed` state
 * and does NOT seal — sealing a window with no `turn/end` is the one shape that
 * reads as tidy while hiding a gap. The open turn is left exactly as a crash
 * would leave it, for `recoverSession` to close as `interrupted`, which is what
 * it in fact is from the log's point of view: this process stopped being able to
 * write.
 */
import type { SessionEventRef, SessionService } from "../session/sessionService.js";
import type { TokenUsage, TurnCancelCause, TurnTrigger } from "../session/sessionTypes.js";
import { isTurnCancelCause } from "../session/sessionTypes.js";
import { LoopInbox } from "./inbox.js";
import type { NativeImageInput } from "../attachments/nativeImageInput.js";
import { recordNativeImageMessage } from "./nativeImageMessage.js";
import type { NativeInputPart } from "../attachments/nativeOrderedInput.js";
import { assertOrderedClaimDecision, recordNativeOrderedMessage } from "./nativeOrderedMessage.js";
import type { NativeAudioPart } from "../attachments/nativeAudioInput.js";
import { assertAudioClaimDecision, recordNativeAudioMessage } from "./nativeAudioMessage.js";
import { DEFAULT_RETRY_RUNTIME } from "./requestRetry.js";
import {
  DEFAULT_AGENT_LOOP_CONFIG,
  NO_HOOKS,
  toTurnEndParams,
  type AgentLoopConfig,
  type AgentStatus,
  type CancelOptions,
  type InboxMessage,
  type InboxReceipt,
  type InboxTarget,
  type LoopHooks,
  type LoopNotification,
  type LoopRetryRuntime,
  type PreStepDecision,
  type TurnEnding
} from "./loopTypes.js";
import { runStep, type LoopLlm, type LoopRoute, type StepRunnerInit } from "./stepRunner.js";
import { EMPTY_TOOL_SEAM, type AgentToolSeam } from "./toolSeam.js";
import { freezeNativeValidationPlan, NativeValidationTurn, type NativeValidationPlan } from "./nativeValidation.js";
import { AutoCompactor } from "./compaction/autoCompact.js";
import { resolveCompactionConfig } from "./compaction/promptPressure.js";

export interface AgentDriverInit {
  readonly session: SessionService;
  readonly llm: LoopLlm;
  readonly route: LoopRoute;
  /** The `system/prompt` row this run cites. P3.3 replaces it with an assembly seam. */
  readonly systemPromptEventId: string;
  readonly tools?: AgentToolSeam;
  readonly validation?: NativeValidationPlan;
  readonly hooks?: LoopHooks;
  readonly config?: Partial<AgentLoopConfig>;
  /**
   * How a request-boundary retry waits and jitters.
   *
   * Injected rather than defaulted at the point of use, so a test can pin both
   * and assert the delay the signed `loop/retry` row records. Production leaves
   * it out and gets {@link DEFAULT_RETRY_RUNTIME}.
   */
  readonly retryRuntime?: LoopRetryRuntime;
}

/** Two live states plus one terminal one. */
type Phase =
  | { readonly kind: "idle"; readonly lastTurn: number }
  | { kind: "running"; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
  | { readonly kind: "failed"; readonly cause: unknown };

/** A pre-step that decided to enter, with the batch it decided to enter with. */
type PreparedStep = Extract<PreStepDecision, { kind: "enter" }>;

export class AgentDriver {
  readonly inbox: LoopInbox;

  private readonly session: SessionService;

  private readonly hooks: LoopHooks;

  private readonly config: AgentLoopConfig;

  private readonly stepInit: StepRunnerInit;
  private readonly validation: NativeValidationPlan | undefined;
  /** Null unless the operator declared a context window. */
  private readonly compactor: AutoCompactor | null;

  private phase: Phase = { kind: "idle", lastTurn: 0 };

  private activityDone: Promise<void> = Promise.resolve();

  /** The last row this driver committed. Named by a `loop/cancel` as its observed head. */
  private head: SessionEventRef | null = null;

  constructor(init: AgentDriverInit) {
    this.session = init.session;
    this.validation = init.validation === undefined ? undefined : freezeNativeValidationPlan(init.validation);
    this.hooks = init.hooks ?? NO_HOOKS;
    const compaction = init.config?.compaction === undefined ? undefined : resolveCompactionConfig(init.config.compaction);
    this.config = { ...DEFAULT_AGENT_LOOP_CONFIG, ...init.config, ...(compaction === undefined ? {} : { compaction }) };
    this.inbox = new LoopInbox(init.session, (notification) => {
      this.hooks.notify(notification);
    });
    this.stepInit = {
      session: init.session,
      llm: init.llm,
      tools: init.tools ?? EMPTY_TOOL_SEAM,
      route: init.route,
      systemPromptEventId: init.systemPromptEventId,
      config: this.config,
      retryRuntime: init.retryRuntime ?? DEFAULT_RETRY_RUNTIME,
      // Tool-produced context enters the SAME durable inbox a human steer does,
      // so there is one path and one audit story for anything that speaks to the
      // model between steps.
      acceptContext: (text: string) => {
        this.inbox.insert("next-step", text, "tool", { wake: false, demotedFrom: null });
      },
      notify: (notification: LoopNotification) => {
        this.hooks.notify(notification);
      }
    };
    const window = compaction?.contextWindowTokens ?? null;
    this.compactor = compaction === undefined || window === null ? null : new AutoCompactor({ ...compaction, contextWindowTokens: window }, this.stepInit);
  }

  get status(): AgentStatus {
    return this.phase.kind;
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  /**
   * Route input to an inbox lane and optionally wake the driver.
   *
   * Waking input cannot join an activity that is already aborting — it would be
   * claimed by a turn on its way out — so it starts the next turn instead. The
   * classification is captured BEFORE the insertion so that a cancel triggered
   * re-entrantly by an observer of the insertion cannot reclassify it.
   */
  send(text: string, target: InboxTarget, wakeup: boolean, images?: readonly NativeImageInput[]): InboxReceipt {
    return this.enqueue(text, target, wakeup, images);
  }

  /** Preserve the same lane, wake, abort-demotion and durable admission machinery. */
  sendParts(parts: readonly NativeInputPart[], target: InboxTarget, wakeup: boolean): InboxReceipt {
    return this.enqueue("", target, wakeup, undefined, parts);
  }

  sendAudioParts(parts: readonly NativeAudioPart[], target: InboxTarget, wakeup: boolean): InboxReceipt {
    return this.enqueue("", target, wakeup, undefined, undefined, parts);
  }

  private enqueue(text: string, target: InboxTarget, wakeup: boolean, images?: readonly NativeImageInput[], parts?: readonly NativeInputPart[], audioParts?: readonly NativeAudioPart[]): InboxReceipt {
    this.assertUsable();
    const wakingAfterAbort =
      wakeup && this.phase.kind === "running" && this.phase.abort.signal.aborted;
    const resolved: InboxTarget = wakingAfterAbort ? "next-turn" : target;
    const receipt = this.inbox.insert(resolved, text, originFor(target, wakeup), {
      wake: wakeup,
      demotedFrom: wakingAfterAbort ? target : null,
      ...(images === undefined ? {} : { images }),
      ...(parts === undefined ? {} : { parts }),
      ...(audioParts === undefined ? {} : { audioParts })
    });
    if (wakeup) this.wakeDriver(wakingAfterAbort);
    return receipt;
  }

  /** Queue a prompt that gets its own turn, and wake the driver. */
  followup(text: string, images?: readonly NativeImageInput[]): InboxReceipt {
    return this.send(text, "next-turn", true, images);
  }

  followupParts(parts: readonly NativeInputPart[]): InboxReceipt {
    return this.sendParts(parts, "next-turn", true);
  }

  followupAudioParts(parts: readonly NativeAudioPart[]): InboxReceipt {
    return this.sendAudioParts(parts, "next-turn", true);
  }

  /** Steer the nearest step boundary. An idle driver starts a turn for it. */
  steer(text: string): InboxReceipt {
    return this.send(text, "next-step", true);
  }

  /** Queue model-facing context for the nearest step boundary WITHOUT waking. */
  inject(text: string): InboxReceipt {
    return this.send(text, "next-step", false);
  }

  /**
   * Stop the active turn, and — unless `keepInbox` — drop pending work.
   *
   * The REQUEST is recorded before anything unwinds. If the process dies during
   * the unwind, this row is the only thing that will ever say who stopped the
   * agent: the `turn/end` would then be written by crash repair, which knows
   * nothing about the request and honestly reports `interrupted`.
   *
   * A failure to record the request never blocks the abort. Safety does not
   * depend on the row; only ATTRIBUTION does, and an agent that could not be
   * stopped because its log was unwritable would be a worse outcome than a stop
   * whose requester is unnamed.
   */
  cancel(cause: TurnCancelCause, options: CancelOptions = {}): void {
    if (!isTurnCancelCause(cause)) {
      throw new Error("AgentDriver.cancel: a cancellation must name its cause");
    }
    const keepInbox = options.keepInbox === true;
    try {
      this.head = this.session.recordLoopEvent({
        kind: "cancel",
        cause,
        keepInbox,
        requestedBy: options.by ?? "local",
        observedHeadEventId: this.head?.eventId ?? null,
        phase: this.phase.kind
      });
    } catch (error: unknown) {
      this.notifyError(error);
    }
    if (!keepInbox) {
      this.inbox.clear();
      if (this.phase.kind === "running") this.phase.wakeRequested = false;
    }
    // The cause IS the abort reason, so the turn's catch reads back exactly what
    // the canceller named rather than re-deriving it from somewhere else.
    if (this.phase.kind === "running") this.phase.abort.abort(cause);
  }

  /**
   * Settle when no driver activity remains.
   *
   * Re-reads the activity promise after each await because a latched wake can
   * replace the driver this caller was following; without the loop, `whenIdle`
   * would return while the replacement was still running.
   */
  async whenIdle(): Promise<void> {
    let activity: Promise<void>;
    do {
      activity = this.activityDone;
      await activity;
    } while (activity !== this.activityDone);
  }

  private assertUsable(): void {
    if (this.phase.kind === "failed") {
      throw new Error(
        "AgentDriver is in a terminal failed state: its session has an open turn that only recovery may close"
      );
    }
  }

  private setPhase(next: Phase): void {
    const before = this.status;
    this.phase = next;
    if (this.status !== before) this.hooks.notify({ kind: "status", status: this.status });
  }

  private requireRunning(): Extract<Phase, { kind: "running" }> {
    if (this.phase.kind !== "running") {
      throw new Error(`AgentDriver: expected a running driver, found "${this.phase.kind}"`);
    }
    return this.phase;
  }

  private notifyError(error: unknown): void {
    const turn = this.phase.kind === "running" ? this.phase.turn : 0;
    const step = this.phase.kind === "running" ? this.phase.step : 0;
    this.hooks.notify({ kind: "error", turn, step, error });
  }

  /**
   * Start a driver, or latch the wake behind one that is already aborting.
   *
   * A wake that arrives while idle always opens its turn boundary, even if its
   * message is cleared before the claim: the boundary is what the sender was
   * promised. A wake that arrives against an aborting driver is latched and
   * replayed at convergence — unless the cancel cause is `disposed`, because
   * teardown must never wait on a model turn.
   */
  private wakeDriver(wakeAfterAbort = false): void {
    if (this.phase.kind === "failed") return;
    if (this.phase.kind === "running") {
      const reason: unknown = this.phase.abort.signal.reason;
      const disposed = isTurnCancelCause(reason) && reason.kind === "disposed";
      if (!disposed && wakeAfterAbort) this.phase.wakeRequested = true;
      return;
    }
    const driver = withResolvers();
    this.activityDone = driver.promise;
    this.setPhase({
      kind: "running",
      abort: new AbortController(),
      turn: this.phase.lastTurn,
      step: 0,
      wakeRequested: false
    });
    this.kick().then(driver.resolve, driver.resolve);
  }

  /** The driver boundary: turns run until none is left, and nothing escapes. */
  private async kick(): Promise<void> {
    try {
      while (await this.runTurn()) {
        // Each iteration is one turn; runTurn says whether another is owed.
      }
    } catch {
      // Reported failures and cancellations are contained here. They were already
      // recorded as signed rows and surfaced through `notify`; rethrowing would
      // only reject a promise nobody is holding.
    } finally {
      if (this.phase.kind === "running") {
        const { turn, wakeRequested } = this.phase;
        this.setPhase({ kind: "idle", lastTurn: turn });
        if (wakeRequested && this.inbox.hasPending) this.wakeDriver();
      }
    }
  }

  /**
   * One turn. Returns whether another is owed.
   *
   * The structure — and in particular which statements sit inside which `try` —
   * is dsh's, kept deliberately: the two finallys are what make a cancelled turn
   * balanced, and moving either one changes what a cancelled log looks like.
   */
  private async runTurn(): Promise<boolean> {
    const phase = this.requireRunning();
    const { signal } = phase.abort;
    signal.throwIfAborted();

    const turnRef = this.session.startTurn({ trigger: this.triggerForNextTurn(phase.turn) });
    this.head = turnRef;
    phase.turn = turnRef.turn;
    let ending: TurnEnding | null = null;
    let target: InboxTarget = "next-turn";
    let validation: NativeValidationTurn | undefined;
    try {
      if (this.validation) validation = new NativeValidationTurn({ session: this.session, tools: this.stepInit.tools,
        plan: this.validation, turn: turnRef.turn, signal, abandonGraceMs: this.config.toolAbandonGraceMs });
      // Inside the try, NOT between startTurn and it. The turn/start row is
      // already durable at this point, so an observer that throws here would
      // otherwise leave a turn/start with no turn/end — the truncated turn this
      // whole finally exists to make impossible. A hook is untrusted code; it
      // must not be able to strand a turn just by failing.
      this.hooks.notify({ kind: "turn-start", turn: turnRef.turn });

      while (true) {
        signal.throwIfAborted();
        const step = phase.step + 1;
        if (step > this.config.maxStepsPerTurn) {
          ending = { reason: "max_steps" };
          break;
        }

        const decision = await this.preStep(target, turnRef.turn, step);
        if (decision.kind === "reject") {
          ending = { reason: "blocked" };
          return false;
        }
        // A turn that has already decided how it ends, and claimed nothing new,
        // is finished.
        if (ending !== null && decision.messages.length === 0) break;
        // A waking message that was cleared before the claim still owns the turn
        // boundary it was promised — but it spends no model call.
        if (phase.step === 0 && decision.messages.length === 0) {
          ending = { reason: "complete" };
          return false;
        }

        signal.throwIfAborted();
        this.head = this.session.startStep();
        phase.step = step;
        this.hooks.notify({ kind: "step-start", turn: turnRef.turn, step });

        let stopReason: string | null = null;
        let usage: TokenUsage | null = null;
        try {
          for (const message of decision.messages) {
            if (message.audioParts !== undefined) {
              this.head = recordNativeAudioMessage(this.session, message);
              continue;
            }
            if (message.parts !== undefined) {
              this.head = recordNativeOrderedMessage(this.session, message);
              continue;
            }
            // The signed inbox already records an image-only input's empty text.
            // Do not manufacture an empty provider text block beside its image;
            // historical rows/encoders and ordinary text-only behavior stay intact.
            if (message.text.length > 0 || !message.images?.length) {
              this.head = this.session.recordUserMessage(message.text);
            }
            this.head = recordNativeImageMessage(this.session, message) ?? this.head;
          }
          const outcome = await runStep(this.stepInit, turnRef.turn, step, signal);
          stopReason = outcome.stopReason;
          usage = outcome.usage;
          // `max_tokens` is sticky: once any step hit the ceiling, a later step
          // that completes normally must not downgrade the turn's outcome.
          if (ending === null || ending.reason !== "max_tokens") ending = outcome.ending;
        } catch (error: unknown) {
          stopReason = signal.aborted ? "cancelled" : "error";
          throw error;
        } finally {
          // ALWAYS. This is what keeps a cancelled turn balanced at step
          // granularity, and it is the shape crash repair also produces.
          this.head = this.session.endStep({ stopReason, usage });
          this.hooks.notify({ kind: "step-end", turn: turnRef.turn, step });
        }

        signal.throwIfAborted();
        // Between steps only, after `step/end` committed the usage it measures. A
        // summary step it runs takes the next step number, so keep ours in line.
        if (this.compactor !== null && this.head !== null) {
          phase.step += await this.compactor.afterStep(turnRef.turn, step, this.head.eventId, usage, signal);
        }
        // A listener that objects to the turn stopping says so by steering; the
        // inbox is re-read after it runs, so listener ORDER cannot change the
        // outcome.
        if (ending !== null && this.inbox.nextStep.length === 0) {
          await this.hooks.turnStopping({ turn: turnRef.turn, signal });
          signal.throwIfAborted();
        }
        if (ending !== null && this.inbox.nextStep.length === 0) break;
        target = "next-step";
      }
      if (ending?.reason === "complete") await validation?.run(phase.step);
    } catch (error: unknown) {
      if (signal.aborted) {
        ending = { reason: "cancelled", cause: cancelCauseOf(signal) };
        throw error;
      }
      ending = { reason: "error", error };
      this.notifyError(error);
      throw error;
    } finally {
      try { validation?.finish(signal.aborted ? "cancelled" : `turn-${ending?.reason ?? "incomplete"}`); }
      catch (error) { ending = { reason: "error", error }; this.notifyError(error); }
      this.closeTurn(turnRef.turn, ending);
    }

    if (!this.inbox.hasPending) return false;
    // A fresh controller makes any latch on the old one stale: the live driver
    // claims the queue itself rather than replaying a wake for work it can see.
    phase.abort = new AbortController();
    phase.wakeRequested = false;
    phase.step = 0;
    return true;
  }

  /**
   * Close the turn, then seal it.
   *
   * Two calls, because `endTurn` records how the turn finished and `sealTurn`
   * commits the Merkle window over everything in it — and only the seal releases
   * the spine's turn slot. If the closer cannot be written the driver stops for
   * good and does NOT seal: see this module's header for why an unsealed open
   * turn is the honest outcome there.
   */
  private closeTurn(turn: number, ending: TurnEnding | null): void {
    // Unreachable: every exit above assigns an ending. Kept, and labelled, so
    // that a future edit which introduces an unassigned path produces a signed
    // `error` turn a reader can find rather than a crash inside a finally.
    const resolved: TurnEnding = ending ?? {
      reason: "error",
      error: new Error("agent loop: turn ended with no ending assigned")
    };
    try {
      this.head = this.session.endTurn(toTurnEndParams(resolved));
    } catch (error: unknown) {
      this.setPhase({ kind: "failed", cause: error });
      this.notifyError(error);
      return;
    }
    this.hooks.notify({ kind: "turn-end", turn, ending: resolved });
    try {
      this.head = this.session.sealTurn();
    } catch (error: unknown) {
      this.setPhase({ kind: "failed", cause: error });
      this.notifyError(error);
    }
  }

  /**
   * Claim a batch, then let listeners decide whether the step is entered.
   *
   * The claim is DURABLE BEFORE the waterfall runs — dsh's ordering, kept — so a
   * veto consumes the messages it was handed. That loss is real, and AMC records
   * it rather than hiding it: the `loop/veto` row names the vetoing party and
   * every message id the veto burned.
   */
  private async preStep(target: InboxTarget, turn: number, step: number): Promise<PreStepDecision> {
    const signal = this.requireRunning().abort.signal;
    const claimed: readonly InboxMessage[] = this.inbox.claim(target);
    // A hook may mutate the batch array, but cannot erase the captured v2 claims.
    const orderedClaims = claimed.filter(message => message.parts !== undefined);
    const audioClaims = claimed.filter(message => message.audioParts !== undefined);
    const decision = await this.hooks.preStep(
      { turn, step, target, messages: claimed, signal },
      (): Promise<PreparedStep> => Promise.resolve({ kind: "enter", messages: claimed })
    );
    signal.throwIfAborted();
    if (decision.kind === "reject") {
      this.head = this.session.recordLoopEvent({
        kind: "veto",
        turn,
        step,
        by: decision.by,
        claimedMessageIds: claimed.map((message) => message.messageId)
      });
    }
    if (decision.kind === "enter") assertOrderedClaimDecision(orderedClaims, decision.messages);
    if (decision.kind === "enter") assertAudioClaimDecision(audioClaims, decision.messages);
    return decision;
  }

  /**
   * Which lane opened this turn.
   *
   * The distinction the spine's vocabulary asks for is the one a reader wants:
   * `user` is the prompt that started the conversation, `followup` is a later
   * prompt, `steer` is a turn opened by steering alone, and `resume` is a driver
   * that woke with nothing queued.
   */
  private triggerForNextTurn(lastTurn: number): TurnTrigger {
    if (this.inbox.nextTurn.length > 0) return lastTurn === 0 ? "user" : "followup";
    if (this.inbox.nextStep.length > 0) return "steer";
    return "resume";
  }
}

/** How a message is labelled in the log, from how it was sent. */
function originFor(target: InboxTarget, wakeup: boolean): "followup" | "steer" | "inject" {
  if (target === "next-turn") return "followup";
  return wakeup ? "steer" : "inject";
}

/**
 * Read back the cause the canceller named.
 *
 * Falls back to `{kind:"user"}` only for an abort raised by something that is
 * not this driver's `cancel` — which cannot happen through the public surface,
 * since the controller is private. An unattributed cancel is refused by the
 * spine's writer, so guessing here would only move the failure; naming the
 * broadest plausible actor keeps the turn closable and leaves the `loop/cancel`
 * row (or its absence) as the authority on who actually asked.
 */
function cancelCauseOf(signal: AbortSignal): TurnCancelCause {
  const reason: unknown = signal.reason;
  return isTurnCancelCause(reason) ? reason : { kind: "user" };
}

/** `Promise.withResolvers` is Node 22+; this keeps the Node 20 engine floor. */
function withResolvers(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    // Replaced synchronously by the executor below.
  };
  const promise = new Promise<void>((settle) => {
    resolve = () => {
      settle();
    };
  });
  return { promise, resolve };
}
