/**
 * Pi's tool_result, as AMC's extension forwards it in control mode (P1-22 follow-up): the outcome of one call Pi ran,
 * recorded under the rules Claude Code's PostToolUse follows (claudeCodeObservations.ts). It must name the tool_call
 * decision it follows and come with that decision's lease, in a session still registered; it is capped, never dropped
 * silently; a fault of AMC's own writer while recording it for a registered session latches the workspace's hooks
 * (hookAuditLatch.ts). Observed, never enforced: the call already ran.
 */
import { z } from "zod";
import type { HookLease } from "./hookAuthorization.js";
import { parse, recordPostExecution, type HookObservationResult } from "./claudeCodeObservations.js";

const toolResultSchema = z.strictObject({
  hook_event_name: z.literal("tool_result"),
  pi: z.strictObject({ sessionId: z.string().min(1).max(512), toolCallId: z.string().min(1).max(512) }),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
  isError: z.boolean(),
  /** Whether the extension recorded this outcome at the observed ingress first; false is recorded and refused. */
  ingressRecorded: z.boolean(),
  /** The receipt digest of the tool_call decision this outcome follows, as the extension verified it. */
  decisionReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

/** Record the outcome of one Pi call (recordPostExecution). */
export function recordPiToolResult(input: { workspace: string; authenticatedAgentId: string; rawInput: string; lease?: HookLease; now?: number }):
  HookObservationResult {
  const parsed = parse(toolResultSchema, input.rawInput, "Pi tool_result");
  return recordPostExecution(input, { provider: "pi", event: "tool_result", sessionId: parsed.pi.sessionId, callId: parsed.pi.toolCallId,
    toolInput: parsed.tool_input, failed: parsed.isError, ingressRecorded: parsed.ingressRecorded, decisionReceiptSha256: parsed.decisionReceiptSha256 });
}
