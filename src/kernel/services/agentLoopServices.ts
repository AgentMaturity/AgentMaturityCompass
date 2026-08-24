/**
 * The agent loop as a composed service (P3.2).
 *
 * `ctx.amcAgentLoop` is the first service in this tree that can DO something on
 * its own: the evidence spine records, the credentials seam resolves and the LLM
 * seam dispatches, but none of them starts a turn. This one owns a driver, and a
 * consumer that declares `inject: ["amcAgentLoop"]` stays PENDING until a host
 * has supplied everything a turn needs — a session to write into, a model route
 * to send on, and the `system/prompt` row those requests will cite.
 *
 * WHY THE SERVICE OWNS EXACTLY ONE DRIVER. Because a `SessionService` is the
 * SINGLE WRITER for one session's spine: it holds that session's head, its turn
 * counter and its seal window in memory. Two drivers over one session would be
 * two writers, and the second one's first `turn/start` would be appended against
 * a head the first one had already moved. So the service is scoped to a session,
 * exactly as the session is scoped to a run. Fan-out to several agents is
 * fan-out to several sessions, which is P6.1's problem and not something to
 * pre-build a registry for here.
 *
 * WHAT DISPOSAL MEANS, AND WHY IT IS NOT "STOP AND FORGET". Unloading the fiber
 * cancels the live turn with cause `{kind:"disposed"}` and then WAITS for the
 * driver to go idle. Both halves matter:
 *
 *   - The CAUSE is recorded, so a turn that ended because a composition was
 *     torn down is distinguishable from one a person stopped. "Who stopped this
 *     agent" is the auditor's question, and `disposed` is a real answer to it.
 *   - The WAIT is what keeps the log balanced. Returning before the driver
 *     unwound would leave `turn/end` unwritten and the session's last turn open
 *     — the shape a CRASH produces. A tidy shutdown that forges a crash is
 *     precisely the confusion this phase exists to prevent.
 *
 * This module lives under src/kernel/ because it imports workspace packages the
 * published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "@amc/core";
import type { Context } from "@amc/cordis";
import { AgentDriver } from "../../agent/agentDriver.js";
import type {
  AgentLoopConfig,
  AgentStatus,
  CancelOptions,
  InboxReceipt,
  InboxTarget,
  LoopHooks,
  LoopRetryRuntime
} from "../../agent/loopTypes.js";
import type { LoopLlm, LoopRoute } from "../../agent/stepRunner.js";
import type { AgentToolSeam } from "../../agent/toolSeam.js";
import type { SessionService } from "../../session/sessionService.js";
import type { TurnCancelCause } from "../../session/sessionTypes.js";

export const AGENT_LOOP_SEAM = defineSeam("amcAgentLoop");

export interface AgentLoopServiceConfig {
  /** The session this driver writes into. Single writer — see the module header. */
  readonly session: SessionService;
  /**
   * The model seam this loop dispatches through.
   *
   * Narrowed to what the loop uses, so BOTH the concrete `LlmRuntime` and the
   * composed `amcLlm` facade satisfy it — see {@link LoopLlm} for why the
   * concrete class alone would have made this service unreachable from a
   * composed tree.
   */
  readonly llm: LoopLlm;
  readonly route: LoopRoute;
  /** The `system/prompt` row this run's requests cite. P3.3 replaces it with an assembly. */
  readonly systemPromptEventId: string;
  readonly tools?: AgentToolSeam;
  readonly hooks?: LoopHooks;
  readonly config?: Partial<AgentLoopConfig>;
  /** Injected so a test can pin the retry wait and jitter. */
  readonly retryRuntime?: LoopRetryRuntime;
}

/**
 * The agent loop, on the tree.
 *
 * Delegation, not reimplementation. Every rule that matters — the balanced
 * turn/step brackets, the durable inbox, the cancel cause, the request-boundary
 * retry — has exactly one implementation in src/agent/, and this class must not
 * acquire a second one. In particular it does NOT re-derive status: `status`
 * reads the driver, because a mirrored copy is a copy that can be stale at the
 * exact moment somebody asks.
 */
export class AgentLoopSeamService extends AmcSeam {
  private readonly driver: AgentDriver;

  constructor(ctx: Context, config: AgentLoopServiceConfig) {
    super(ctx, AGENT_LOOP_SEAM.name);
    this.driver = new AgentDriver({
      session: config.session,
      llm: config.llm,
      route: config.route,
      systemPromptEventId: config.systemPromptEventId,
      ...(config.tools !== undefined ? { tools: config.tools } : {}),
      ...(config.hooks !== undefined ? { hooks: config.hooks } : {}),
      ...(config.config !== undefined ? { config: config.config } : {}),
      ...(config.retryRuntime !== undefined ? { retryRuntime: config.retryRuntime } : {})
    });
    // Async disposer: cordis awaits it, so the fiber does not report itself
    // unloaded while a turn is still mid-unwind with its `turn/end` unwritten.
    this.ctx.effect(
      () => async () => {
        await this.shutdown();
      },
      "amcAgentLoop driver"
    );
  }

  /** The driver, for a host that needs the machine itself (the CLI prints its notifications). */
  get agent(): AgentDriver {
    return this.driver;
  }

  get status(): AgentStatus {
    return this.driver.status;
  }

  get sessionId(): string {
    return this.driver.sessionId;
  }

  /** Queue a prompt that gets its own turn, and wake the driver. */
  followup(text: string): InboxReceipt {
    return this.driver.followup(text);
  }

  /** Steer the nearest step boundary. An idle driver starts a turn for it. */
  steer(text: string): InboxReceipt {
    return this.driver.steer(text);
  }

  /** Queue model-facing context for the nearest step boundary WITHOUT waking. */
  inject(text: string): InboxReceipt {
    return this.driver.inject(text);
  }

  /** The general form, for a host that routes and wakes on its own terms. */
  send(text: string, target: InboxTarget, wakeup: boolean): InboxReceipt {
    return this.driver.send(text, target, wakeup);
  }

  /** Stop the active turn. The cause is required and rides inside the signed `turn/end`. */
  cancel(cause: TurnCancelCause, options: CancelOptions = {}): void {
    this.driver.cancel(cause, options);
  }

  /** Settle when no driver activity remains. */
  whenIdle(): Promise<void> {
    return this.driver.whenIdle();
  }

  /**
   * Cancel as `disposed` and wait for the turn to close.
   *
   * TWO CASES ARE DELIBERATELY LEFT ALONE, because in both a cancel row would
   * claim a stop that stopped nothing — and a `loop/cancel` on every clean
   * shutdown would devalue the one signal an auditor scans for.
   *
   *   - A `failed` driver. Its session already has an open turn that only
   *     `recoverSession` may close.
   *   - An idle driver with an empty inbox. There is no turn to stop and no
   *     queued work to drop.
   *
   * An idle driver with PENDING work is cancelled: that work is really being
   * abandoned, and the row is what says so.
   */
  private async shutdown(): Promise<void> {
    if (this.driver.status === "failed") return;
    if (this.driver.status !== "running" && !this.driver.inbox.hasPending) return;
    this.driver.cancel({ kind: "disposed" });
    await this.driver.whenIdle();
  }
}

/**
 * Registers the agent loop.
 *
 * A single-service plugin rather than a group: it is complete on its own, and
 * the things it needs (a session, a model route) are seams a host composes
 * first and hands in.
 */
export const agentLoopServices = {
  name: "amc-agent-loop-services",
  apply(ctx: Context, config: AgentLoopServiceConfig): void {
    ctx.plugin(AgentLoopSeamService, config);
  }
};
