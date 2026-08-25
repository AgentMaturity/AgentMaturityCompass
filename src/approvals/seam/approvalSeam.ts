/**
 * `ctx.approval` — the human-in-the-loop seam (plan P3.3).
 *
 * One method, `request()`, and it BLOCKS: it returns when the question has been
 * answered, not when it has been asked. Everything else in this file exists to
 * make two promises true at once.
 *
 * PROMISE ONE — THE AUDIT PAIR. Every question produces exactly two signed
 * session rows: `approval/request` when it is raised and `approval/answer` when
 * it settles, correlated by `approvalId`, both inside the same open turn. The
 * request row is written BEFORE any answerer sees the question, so the log can
 * never hold an answer to a question it does not contain. And if either append
 * fails, `request()` throws rather than returning: handing a caller a decision
 * that no signed row records would be a fourth unsigned side-channel, and this
 * repository has shipped three already.
 *
 * PROMISE TWO — FAIL CLOSED WITHOUT OVER-CLAMPING. `unavailable` is the answer
 * to every way of not answering, and `proceed` is false for it. But the clamp is
 * applied to ANSWERERS ONLY. The approvals engine's verdict is never wrapped,
 * never raced against a seam stopwatch, and never normalized — because the
 * failure that matters most here is not a rogue callback, it is a design that
 * clamps a real two-approver QUORUM_MET grant to `unavailable` and thereby makes
 * genuine human approval impossible. Clamp the answerer, never the verdict.
 *
 * WHAT THIS SEAM DELIBERATELY DOES NOT DO. It never CONSUMES a grant.
 * `consumeApprovedExecution` marks an approval spent so it cannot be replayed,
 * and it belongs to whoever executes — the tool pipeline of P4.1. Consuming it
 * here would record an execution that had not happened and might never happen,
 * which is a false statement in a signed file. Replay through the seam is closed
 * by a different mechanism anyway: every `request()` mints a fresh `approvalId`
 * and so raises a fresh engine request, and no later ask can reach a grant some
 * earlier ask obtained.
 */
import { randomUUID } from "node:crypto";
import type { SessionService } from "../../session/sessionService.js";
import { askAnswerer } from "./answerNormalize.js";
import { decideThroughApprovalsEngine } from "./engineAnswerer.js";
import {
  DEFAULT_ANSWERER_TIMEOUT_MS,
  DEFAULT_POLL_SCHEDULE,
  realWaitRuntime,
  type AnsweredQuestion,
  type ApprovalAnswer,
  type ApprovalAnswerer,
  type ApprovalAsk,
  type ApprovalDecision,
  type ApprovalPollSchedule,
  type ApprovalWaitRuntime
} from "./approvalSeamTypes.js";

export interface ApprovalSeamInit {
  /** The session the audit pair is written to. Must have a turn open when a question is asked. */
  readonly session: SessionService;
  readonly workspace: string;
  readonly agentId: string;
  /** Answerers consulted in order, ahead of the engine. */
  readonly answerers?: readonly ApprovalAnswerer[];
  /**
   * How the seam waits on the ENGINE, and what it thinks the time is.
   *
   * It does NOT govern the answerer stopwatch — see `answererClock` on the class
   * for why those two clocks must not be the same one.
   */
  readonly runtime?: ApprovalWaitRuntime;
  readonly answererTimeoutMs?: number;
  readonly poll?: ApprovalPollSchedule;
  /** Injected so a test can pin the audit id. */
  readonly newApprovalId?: () => string;
  /** Reports the engine request id the moment it exists, so a UI can render the prompt. */
  readonly onRaised?: (event: { readonly approvalId: string; readonly approvalRequestId: string }) => void;
}

interface Settled {
  readonly answer: ApprovalAnswer;
  readonly answeredBy: string;
  readonly reason: string;
  readonly approvalRequestId: string | null;
}

export class ApprovalSeam {
  private readonly session: SessionService;

  private readonly workspace: string;

  private readonly agentId: string;

  private readonly answerers: ApprovalAnswerer[];

  private readonly runtime: ApprovalWaitRuntime;

  /**
   * The stopwatch over ONE answerer, and deliberately NOT the injected runtime.
   *
   * "Wedged" means wedged in wall-clock time. A composition (or a test) that
   * pins `runtime` to make the engine poll advance quickly would otherwise also
   * be shortening every answerer's deadline — so a healthy UI prompt could be
   * declared absent because somebody sped up the poll. Two different bounds on
   * two different things need two different clocks.
   */
  private readonly answererClock: ApprovalWaitRuntime = realWaitRuntime();

  private readonly answererTimeoutMs: number;

  private readonly poll: ApprovalPollSchedule;

  private readonly newApprovalId: () => string;

  private readonly onRaised: ApprovalSeamInit["onRaised"];

  constructor(init: ApprovalSeamInit) {
    this.session = init.session;
    this.workspace = init.workspace;
    this.agentId = init.agentId;
    this.answerers = [...(init.answerers ?? [])];
    this.runtime = init.runtime ?? realWaitRuntime();
    this.answererTimeoutMs = init.answererTimeoutMs ?? DEFAULT_ANSWERER_TIMEOUT_MS;
    this.poll = init.poll ?? DEFAULT_POLL_SCHEDULE;
    this.newApprovalId = init.newApprovalId ?? ((): string => `apr_${randomUUID()}`);
    this.onRaised = init.onRaised;
  }

  /** The answerers currently ahead of the engine, in dispatch order. */
  get answererNames(): readonly string[] {
    return this.answerers.map((answerer) => answerer.name);
  }

  /**
   * Register an answerer ahead of the engine, and return its unregister.
   *
   * Later registrations answer LAST. A plugin cannot install itself in front of
   * an answerer that is already there, so ordering is a property of composition
   * order rather than of who called `use()` most aggressively.
   */
  use(answerer: ApprovalAnswerer): () => void {
    this.answerers.push(answerer);
    return (): void => {
      const at = this.answerers.indexOf(answerer);
      if (at >= 0) this.answerers.splice(at, 1);
    };
  }

  /**
   * Ask, and wait for the answer.
   *
   * @throws if the session refuses either audit append — including when no turn
   * is open. A decision that could not be logged is a decision the caller must
   * not act on, and the loudest possible failure is the correct one.
   */
  async request(ask: ApprovalAsk): Promise<ApprovalDecision> {
    const approvalId = this.newApprovalId();
    // The QUESTION is committed first. Ordering, not taste: an answerer that
    // settled before this row existed would leave a window in which the log
    // holds a grant for a question it never recorded being asked.
    const requestRef = this.session.recordApproval({
      phase: "request",
      approvalId,
      toolCallId: ask.toolCallId,
      question: ask.question,
      toolName: ask.toolName,
      actionClass: ask.actionClass
    });

    const settled = await this.settle(approvalId, ask);

    const answerRef = this.session.recordApproval({
      phase: "answer",
      approvalId,
      answer: settled.answer,
      answeredBy: settled.answeredBy,
      approvalRequestId: settled.approvalRequestId,
      reason: settled.reason
    });

    return {
      approvalId,
      answer: settled.answer,
      // Derived here and nowhere else, so `allow` is the only value that can
      // ever produce a true.
      proceed: settled.answer === "allow",
      answeredBy: settled.answeredBy,
      reason: settled.reason,
      approvalRequestId: settled.approvalRequestId,
      requestEventId: requestRef.eventId,
      answerEventId: answerRef.eventId
    };
  }

  /**
   * Answerers first, engine last.
   *
   * The two halves are deliberately NOT symmetric. Each answerer runs inside
   * `askAnswerer`, which contains its throws and bounds its own work. The engine
   * call underneath is not contained at all: its verdict is already one of the
   * three legal values, and putting a stopwatch over the human wait is the exact
   * bug this arrangement exists to prevent.
   */
  private async settle(approvalId: string, ask: ApprovalAsk): Promise<Settled> {
    const question: AnsweredQuestion = { ...ask, approvalId };

    if (ask.signal?.aborted === true) {
      return {
        answer: "unavailable",
        answeredBy: "seam:withdrawn",
        reason: "the ask was already withdrawn when it was made",
        approvalRequestId: null
      };
    }

    for (const answerer of this.answerers) {
      const contained = await askAnswerer(answerer, question, this.answererClock, this.answererTimeoutMs);
      if (contained.answer === null) continue;
      // A CLAIMED question stops here, including when the claim was a
      // malfunction normalized to `unavailable`. A rogue answerer must not be
      // able to pass its question down to something more permissive by failing.
      return {
        answer: contained.answer,
        answeredBy: `answerer:${answerer.name}`,
        reason: contained.reason,
        approvalRequestId: null
      };
    }

    const verdict = await decideThroughApprovalsEngine({
      workspace: this.workspace,
      agentId: this.agentId,
      approvalId,
      ask,
      runtime: this.runtime,
      poll: this.poll,
      ...(this.onRaised === undefined
        ? {}
        : {
            onRaised: (approvalRequestId: string): void => {
              this.onRaised?.({ approvalId, approvalRequestId });
            }
          })
    });
    return {
      answer: verdict.answer,
      answeredBy: "approvals-engine",
      reason: verdict.reason,
      approvalRequestId: verdict.approvalRequestId
    };
  }
}
