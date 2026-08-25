/**
 * Human-in-the-loop for tool calls, as a seam wrapper (plan P3.3, stage 4).
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It is the smallest honest thing that makes
 * the P3.3 exit criterion — "the loop has identity, context, and
 * human-in-the-loop" — true of a RUN rather than of a library: a tool seam that
 * asks `ctx.amcApproval` before it dispatches, and blocks the call until a
 * signed decision exists. It is NOT the P4.1 execution pipeline: there are no
 * pre-execute guards, no monotonic ordering rules, no nested tokens, and no
 * per-tool policy. P4.1 replaces this wrapper with the real pipeline, and the
 * approval step there is the same `ApprovalAsk` this one builds.
 *
 * DENIAL IS AN OUTCOME, NOT AN EXCEPTION. A refused call comes back as a normal
 * `ToolCallOutcome` with `outcome: "DENIED"` and `denied: true`, so the loop
 * writes the `tool/result` row it writes for every other call and the model gets
 * an answer it can act on. Throwing instead would end the turn as an error and
 * leave the model never learning that permission was the problem — the one fact
 * it needs in order to stop trying.
 *
 * THE INNER SEAM IS NEVER TOUCHED ON A REFUSAL. `execute` is called only after
 * `decision.proceed` is true. That is the whole security content of this file:
 * `proceed` is derived in the seam as `answer === "allow"`, so `unavailable` —
 * the answer to every way of not answering — cannot reach the tool.
 *
 * SCHEMAS AND EXECUTION MODE PASS STRAIGHT THROUGH. A gate that hid tools from
 * the model would be a different feature (and a worse one: the model would work
 * around a capability it cannot see instead of asking for it), and a gate that
 * forced every gated call exclusive would serialize work for a reason that has
 * nothing to do with the tools.
 */
import type { ActionClass } from "../types.js";
import type {
  ApprovalAsk,
  ApprovalDecision,
  ApprovalRiskTier
} from "../approvals/seam/approvalSeamTypes.js";
import type { ToolSchema } from "../llm/request/requestSpec.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "./toolSeam.js";

/**
 * The part of the approval seam a gate uses.
 *
 * Narrowed to one method so BOTH the concrete `ApprovalSeam` and the composed
 * `amcApproval` facade satisfy it — the same reason `LoopLlm` is narrow, and the
 * reason this module can live outside src/kernel/ at all.
 */
export interface ToolApprovalSeam {
  request(ask: ApprovalAsk): Promise<ApprovalDecision>;
}

export interface ToolApprovalGateOptions {
  /** Selects the signed policy rule: how many approvers, which roles, what TTL. */
  readonly actionClass: ActionClass;
  readonly riskTier: ApprovalRiskTier;
  /**
   * Which tools are gated. OMITTED MEANS ALL OF THEM.
   *
   * The default is the strict one on purpose: a gate that had to be told what to
   * protect would leave every tool added after it was configured ungoverned, and
   * nobody would notice until the new tool ran unapproved. Naming tools here is
   * the operator's deliberate NARROWING, and it is visible in the composition.
   */
  readonly toolNames?: readonly string[];
}

/** Whether this call must be approved. Omitting the list gates everything. */
function isGated(options: ToolApprovalGateOptions, toolName: string): boolean {
  return options.toolNames === undefined || options.toolNames.includes(toolName);
}

/** What the model is told when permission was not granted. */
function refusalText(decision: ApprovalDecision, toolName: string): string {
  return (
    `[amc:approval] "${toolName}" was not approved (answer: ${decision.answer}, ` +
    `decided by: ${decision.answeredBy}). Reason: ${decision.reason} ` +
    `Approval id: ${decision.approvalId}.`
  );
}

/**
 * Gate a tool seam on the approval seam.
 *
 * @param inner - the seam that actually runs the tools.
 * @param approval - the composed approval seam; its `request` BLOCKS.
 * @param options - which action class the calls are decided under, and which
 * tools are gated.
 * @returns a seam with the same catalogue and an approval in front of `execute`.
 */
export function gateToolCallsOnApproval(
  inner: AgentToolSeam,
  approval: ToolApprovalSeam,
  options: ToolApprovalGateOptions
): AgentToolSeam {
  return {
    schemas: (): readonly ToolSchema[] | null => inner.schemas(),
    executionMode: (request: ToolCallRequest): "parallel" | "exclusive" =>
      inner.executionMode(request),
    execute: async (request: ToolCallRequest): Promise<ToolCallOutcome> => {
      if (!isGated(options, request.toolName)) return inner.execute(request);

      const decision = await approval.request({
        toolCallId: request.callId,
        toolName: request.toolName,
        actionClass: options.actionClass,
        riskTier: options.riskTier,
        question: `The agent wants to call "${request.toolName}" during turn ${request.turn}, step ${request.step}.`,
        // The model's own arguments, verbatim. They are hashed into the engine
        // request's `intentHash`, so the grant is bound to THESE arguments and a
        // later call with different ones cannot spend it.
        intentPayload: { toolName: request.toolName, rawArguments: request.rawArguments },
        // The turn's signal, so a cancelled turn withdraws the question instead
        // of leaving a live grant behind for something else to spend.
        signal: request.signal
      });

      if (!decision.proceed) {
        return {
          outcome: "DENIED",
          content: refusalText(decision, request.toolName),
          exitCode: null,
          timedOut: false,
          denied: true
        };
      }
      return inner.execute(request);
    }
  };
}
