/**
 * The terminal answerer: AMC's own approvals engine (plan P3.3, ADR-4).
 *
 * The seam does NOT decide approvals and does not store them. `src/approvals/`
 * already does that, with signed hash-chained request and decision files, a
 * quorum evaluator that understands distinct approvers and role allowlists, a
 * TTL, delivery to humans, and an inbox. This module is a THIN FAIL-CLOSED
 * ADAPTER over that engine — a translation from its six-state vocabulary into
 * the seam's three-valued one, and nothing else. Building a second approval
 * system beside it would mean two answers to "was this approved", which is one
 * answer too many.
 *
 * WHY THE SEAM DOES THE WAITING. The engine is create-then-poll:
 * `createApprovalForIntent` returns PENDING synchronously and the decision
 * arrives later, in a DIFFERENT PROCESS — `amc approvals decide`, the studio
 * server, a webhook — as new signed files on disk. There is no in-process event
 * to await, so somebody has to watch. That somebody is here.
 *
 * WHY POLLING AND NOT A WATCHER. `fs.watch` misses events on network
 * filesystems and behaves differently on every platform, and a missed event on
 * an approval seam is not a slow prompt, it is a hang. Every poll re-reads the
 * authoritative signed state, so a dropped notification cannot cause a stall —
 * the next read still sees the truth. The cost of that choice is bounded by the
 * backoff schedule.
 *
 * WHY THERE IS NO SEAM-LOCAL TIMEOUT ON THIS WAIT. The bound is `expiresTs` on
 * the SIGNED request, which comes from the signed approval policy's `ttlMinutes`
 * for this action class. A stopwatch here that was shorter than that TTL would
 * clamp a genuine, in-time, multi-approver grant to `unavailable` — and a human
 * who takes eleven minutes on a fifteen-minute TTL is not an error condition,
 * they are the entire point of human-in-the-loop. The operator's policy decides
 * how long a question may stay open; this module obeys it.
 */
import {
  approvalStatusPayload,
  cancelApprovalRequestForIntent,
  createApprovalForIntent,
  verifyApprovalForExecution
} from "../approvalEngine.js";
import {
  DEFAULT_POLL_SCHEDULE,
  type ApprovalAnswer,
  type ApprovalAsk,
  type ApprovalPollSchedule,
  type ApprovalWaitRuntime
} from "./approvalSeamTypes.js";

export interface EngineApprovalInput {
  readonly workspace: string;
  readonly agentId: string;
  /** The seam's audit id. Passed to the engine as its `intentId`, so the two records name each other. */
  readonly approvalId: string;
  readonly ask: ApprovalAsk;
  readonly runtime: ApprovalWaitRuntime;
  readonly poll?: ApprovalPollSchedule;
  /** Called once the engine request exists, so a UI can render the pending prompt. */
  readonly onRaised?: (approvalRequestId: string) => void;
}

/** What the engine decided, in the seam's vocabulary. */
export interface EngineVerdict {
  readonly answer: ApprovalAnswer;
  readonly approvalRequestId: string | null;
  readonly reason: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the asker has withdrawn the question.
 *
 * A FUNCTION rather than an inline `signal?.aborted` check, because the control
 * flow analyser narrows the inline form to `false` after the first test and then
 * refuses to compile the second — which is precisely backwards for a value that
 * exists in order to change while the loop below is waiting.
 */
function withdrawn(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Withdraw a question nobody answered.
 *
 * Not hygiene — safety. A PENDING request that is abandoned stays approvable,
 * and a grant arriving after the asker gave up is a grant for an action nobody
 * is still asking about. Cancelling closes it. A throw here is swallowed because
 * the request may already be terminal, and failing to tidy up must not change
 * the verdict the caller is about to receive.
 */
function withdraw(workspace: string, agentId: string, approvalRequestId: string): void {
  try {
    cancelApprovalRequestForIntent({ workspace, agentId, approvalId: approvalRequestId });
  } catch {
    // Already denied, expired, consumed or cancelled. Nothing left to withdraw.
  }
}

/**
 * Raise one approval and wait for the engine to settle it.
 *
 * Returns `unavailable` — never a throw — for every failure that is not a
 * decision, because the caller's contract is three-valued and `unavailable`
 * already means "nobody decided, do not proceed".
 */
export async function decideThroughApprovalsEngine(input: EngineApprovalInput): Promise<EngineVerdict> {
  const { workspace, agentId, approvalId, ask, runtime } = input;
  const schedule = input.poll ?? DEFAULT_POLL_SCHEDULE;
  const mode = ask.mode ?? "EXECUTE";

  if (withdrawn(ask.signal)) {
    return {
      answer: "unavailable",
      approvalRequestId: null,
      reason: "withdrawn before the approval was raised"
    };
  }

  let raised: ReturnType<typeof createApprovalForIntent>;
  try {
    raised = createApprovalForIntent({
      workspace,
      agentId,
      // The seam's audit id IS the engine's intent id. That is the whole
      // correlation mechanism: the signed session rows carry `approvalId`, the
      // signed engine request carries the same string as `intentId`, and neither
      // schema had to learn about the other.
      intentId: approvalId,
      toolName: ask.toolName,
      actionClass: ask.actionClass,
      requestedMode: mode,
      effectiveMode: mode,
      riskTier: ask.riskTier,
      intentPayload: ask.intentPayload,
      ...(ask.workOrderId === undefined ? {} : { workOrderId: ask.workOrderId })
    });
  } catch (error) {
    // FAIL CLOSED, and say so in the row. The engine refuses to raise a question
    // it cannot raise honestly — an approval policy that exists but is unsigned,
    // an action class the policy has no rule for. None of those is a grant, and
    // none of them may be quietly turned into one.
    return {
      answer: "unavailable",
      approvalRequestId: null,
      reason: `the approvals engine refused to raise the question: ${messageOf(error)}`
    };
  }

  const approvalRequestId = raised.request.approvalRequestId;
  input.onRaised?.(approvalRequestId);
  const deadline = raised.request.expiresTs;
  let delay = schedule.firstDelayMs;

  for (;;) {
    if (withdrawn(ask.signal)) {
      withdraw(workspace, agentId, approvalRequestId);
      return {
        answer: "unavailable",
        approvalRequestId,
        reason: "withdrawn by the asker before an answer arrived"
      };
    }

    let status: string;
    let quorum: { required: number; received: number };
    try {
      const state = approvalStatusPayload({ workspace, agentId, approvalId: approvalRequestId });
      status = state.status;
      quorum = { required: state.quorum.required, received: state.quorum.received };
    } catch (error) {
      // The request record no longer loads or no longer verifies. Something
      // tampered with the chain the answer would come from, so there is no
      // trustworthy answer to have.
      return {
        answer: "unavailable",
        approvalRequestId,
        reason: `the approval request could not be read back: ${messageOf(error)}`
      };
    }

    if (status !== "PENDING") {
      return settle(input, approvalRequestId, status, quorum);
    }

    if (runtime.now() >= deadline) {
      // Belt and braces. The engine's own quorum evaluation reports EXPIRED once
      // the TTL passes, so this branch is normally unreachable; it exists so a
      // clock that disagrees with the engine's cannot turn the wait into an
      // unbounded loop.
      withdraw(workspace, agentId, approvalRequestId);
      return {
        answer: "unavailable",
        approvalRequestId,
        reason: `approval expired with ${quorum.received}/${quorum.required} approvals`
      };
    }

    await runtime.sleep(delay, ask.signal);
    delay = Math.min(delay * 2, schedule.maxDelayMs);
  }
}

/**
 * Translate one terminal engine status into the seam's vocabulary.
 *
 * Only QUORUM_MET can become `allow`, and even then only after
 * `verifyApprovalForExecution` re-checks the grant. That second check is not
 * ceremony: it re-verifies the request signature and the whole decision chain,
 * and it re-compares the action policy, tool config and budget digests the
 * request was BOUND to against what is on disk now. An approval collected before
 * an operator swapped the tool config is not an approval for what is about to
 * run, and this is where that is caught.
 */
function settle(
  input: EngineApprovalInput,
  approvalRequestId: string,
  status: string,
  quorum: { required: number; received: number }
): EngineVerdict {
  if (status === "DENIED") {
    return { answer: "deny", approvalRequestId, reason: "an approver denied the request" };
  }
  if (status !== "QUORUM_MET") {
    // EXPIRED, CANCELLED, CONSUMED. None is a decision about THIS ask: an
    // expired question was never answered, a cancelled one was withdrawn, and a
    // consumed grant has already been spent on some execution.
    return {
      answer: "unavailable",
      approvalRequestId,
      reason: `the approval settled ${status} without granting this request`
    };
  }

  const verified = verifyApprovalForExecution({
    workspace: input.workspace,
    approvalId: approvalRequestId,
    expectedAgentId: input.agentId,
    expectedIntentId: input.approvalId,
    expectedToolName: input.ask.toolName,
    expectedActionClass: input.ask.actionClass
  });
  if (!verified.ok) {
    return {
      answer: "unavailable",
      approvalRequestId,
      reason: `quorum was met but the grant did not verify: ${verified.error ?? "unknown"}`
    };
  }
  return {
    answer: "allow",
    approvalRequestId,
    reason: `quorum met and verified (${quorum.received}/${quorum.required} approvals)`
  };
}
