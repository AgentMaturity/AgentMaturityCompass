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
 * AN APPROVAL BINDS THE CALL THAT RUNS (P1-02). Over a pipeline-backed seam, a
 * call in an authorized class is asked under the TOOL'S OWN signed class, about
 * its authorization intent: the normalized arguments' digest, the amount,
 * recipient, destination and resource, and the deployment digest. The granted
 * engine request goes to the pipeline through `authority`, and the pipeline
 * rechecks it against the exact call as the last step before the body. The gate
 * also binds itself to the pipeline, so every Code Mode sub-call is asked on its
 * own and no gated call in an authorized class runs without a signed approval.
 *
 * SCHEMAS AND EXECUTION MODE PASS STRAIGHT THROUGH. A gate that hid tools from
 * the model would be a different feature (and a worse one: the model would work
 * around a capability it cannot see instead of asking for it), and a gate that
 * forced every gated call exclusive would serialize work for a reason that has
 * nothing to do with the tools.
 */
import type { AuthorizationIntentResult } from "../actions/authorize.js";
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

/** One question: about the authorization intent when the call has one, else about the raw call as before. */
async function ask(approval: ToolApprovalSeam, options: ToolApprovalGateOptions, call: {
  readonly callId: string; readonly toolName: string; readonly where: string; readonly signal?: AbortSignal;
  readonly intent: AuthorizationIntentResult | null; readonly legacyPayload: Record<string, unknown>;
}): Promise<ApprovalDecision> {
  const intent = call.intent?.ok === true ? call.intent : null;
  return approval.request({
    toolCallId: call.callId,
    toolName: call.toolName,
    // An authorized class is approved under its own signed rule; a grant under another class never matches it.
    actionClass: intent?.payload.actionClass ?? options.actionClass,
    riskTier: options.riskTier,
    question: intent === null ? `The agent wants to call "${call.toolName}" ${call.where}.` : `${intent.question} ${call.where}.`,
    // Hashed into the engine request's `intentHash`, so the grant is bound to THESE facts and a later call with
    // different ones cannot spend it.
    intentPayload: intent?.payload ?? call.legacyPayload,
    // The turn's signal, so a cancelled turn withdraws the question instead of leaving a live grant behind.
    ...(call.signal === undefined ? {} : { signal: call.signal })
  });
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
  inner.bindApprovalGate?.({
    gates: (toolName) => isGated(options, toolName),
    ask: async (execution, intent) => {
      const decision = await ask(approval, options, { callId: execution.callId, toolName: execution.name, intent,
        where: `from inside the program of call ${execution.rootCallId}`, signal: execution.signal,
        legacyPayload: { toolName: execution.name, arguments: execution.arguments } });
      return decision.proceed ? { approvalRequestIds: decision.approvalRequestId === null ? [] : [decision.approvalRequestId] } : null;
    }
  });
  return {
    schemas: (): readonly ToolSchema[] | null => inner.schemas(),
    executionMode: (request: ToolCallRequest): "parallel" | "exclusive" =>
      inner.executionMode(request),
    execute: async (request: ToolCallRequest): Promise<ToolCallOutcome> => {
      if (!isGated(options, request.toolName)) return inner.execute(request);

      const intent = inner.authorizationIntent?.(request) ?? null;
      // A call whose intent cannot bind is not put to a human: the pipeline denies it with the reason.
      if (intent?.ok === false) return inner.execute(request);
      const decision = await ask(approval, options, { callId: request.callId, toolName: request.toolName, intent,
        where: `during turn ${request.turn}, step ${request.step}`, signal: request.signal,
        // Without an intent, the model's own arguments, verbatim.
        legacyPayload: { toolName: request.toolName, rawArguments: request.rawArguments } });

      if (!decision.proceed) {
        return {
          outcome: "DENIED",
          content: refusalText(decision, request.toolName),
          exitCode: null,
          timedOut: false,
          denied: true
        };
      }
      // The only place a top-level call gains authority: after a grant, naming the engine request that granted it.
      return inner.execute({ ...request,
        authority: { approvalRequestIds: decision.approvalRequestId === null ? [] : [decision.approvalRequestId] } });
    }
  };
}
