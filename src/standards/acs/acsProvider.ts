/**
 * OWASP Agent Control Standard (ACS) v0.1 as a provider of AMC's hook control path (P2-19).
 *
 * The ACS guardian route (acsGuardian.ts) turns one `steps/toolCallRequest` into the provider input below and hands it
 * to the same control path Claude Code, Gemini CLI and Pi use (hookControlRoute.ts → evaluateProviderHookControl). This
 * module holds only what is ACS-specific there: the call AMC derives from the ACS session and request ids, the
 * canonical ToolHub request, and the response row AMC signs. Pinned source: docs/source-reviews/P2-19-owasp-acs.md.
 */
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { CanonicalToolRequest, HookCall, HookControlDecision } from "../../bridge/hookProviders.js";

/** The hook control event an ACS tool call arrives as: the ACS method name. */
export const ACS_TOOL_CALL_METHOD = "steps/toolCallRequest";

/**
 * What the ACS guardian route adds to the provider input: the ACS version the request named, its session and request
 * ids (AMC derives the action id from them), the digest of the request params AMC decided, and the request fields AMC
 * cannot evaluate (a call naming any is denied). None of it is authority: identity comes from the lease.
 */
const acsControlContextSchema = z.strictObject({
  version: z.string().regex(/^0\.1\.\d+$/),
  sessionId: z.string().uuid(),
  requestId: z.string().uuid(),
  paramsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  unevaluable: z.array(z.enum(["raw_command", "operation"])).max(2),
});
export type AcsControlContext = z.infer<typeof acsControlContextSchema>;

/** AMC's action id for one ACS request: the session and request id, never an id the payload names. */
export function acsActionId(sessionId: string, requestId: string): string {
  return `acs_${sha256Hex(canonicalize({ sessionId, requestId })).slice(0, 40)}`;
}

/** The call an ACS control request names, or null when it carries no valid ACS context (hookProviders.ts refuses it). */
export function acsHookCall(input: Record<string, unknown>): HookCall | null {
  const parsed = acsControlContextSchema.safeParse(input.acs);
  if (!parsed.success) return null;
  const acs = parsed.data;
  // ACS carries no working directory, so AMC resolves nothing against one.
  return { provider: "acs", actionId: acsActionId(acs.sessionId, acs.requestId), sessionId: acs.sessionId, callId: acs.requestId,
    parentActionId: null, cwd: "", pi: null, acs, request: null, payloadSha256: null };
}

/**
 * The canonical ToolHub request for an ACS tool call. ACS names tools in the runtime's own vocabulary, so AMC maps only
 * a tool named by its ToolHub id (fs.read, fs.write, http.fetch, ...); the signed ToolHub config then decides, and any
 * other name is denied there. A call carrying `raw_command` or `operation` is not mapped: AMC evaluates the structured
 * arguments only and would not see what those fields make the runtime run.
 */
export function acsToolRequest(toolName: string, toolInput: Record<string, unknown>, call: { readonly acs?: AcsControlContext | null } | null):
  Omit<CanonicalToolRequest, "segment"> | null {
  if (!call?.acs || call.acs.unevaluable.length > 0) return null;
  return { name: toolName, args: toolInput, argumentsReviewable: true };
}

/**
 * The response row AMC signs for an ACS decision: the ACS disposition, its reasoning and the digest of the exact
 * provider input decided. An ask AMC cannot route is the ACS §9.2 substitution: deny with `approver_unavailable`.
 */
export const acsControlResponseSchema = z.union([
  z.strictObject({ decision: z.literal("allow"), reasoning: z.string().min(1).max(1_024), requestSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ decision: z.literal("deny"), reasoning: z.string().min(1).max(1_024), requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reason_codes: z.tuple([z.literal("approver_unavailable")]).optional() }),
]);

export function renderAcsControlResponse(decision: HookControlDecision, reasoning: string, requestSha256: string | undefined):
  Record<string, unknown> {
  if (!requestSha256) throw new Error("an ACS control response must bind the request it decided");
  if (decision === "allow") return { decision: "allow", reasoning, requestSha256 };
  return decision === "ask"
    ? { decision: "deny", reasoning, requestSha256, reason_codes: ["approver_unavailable"] }
    : { decision: "deny", reasoning, requestSha256 };
}

/** Why AMC denied an outcome an ACS hook call cannot carry (capability-lossy). */
export function acsLossyNote(outcome: "ask" | "steer"): string {
  return outcome === "ask"
    ? "AMC has no approval path for ACS hook calls, so AMC denied the action instead of an ACS ask (ACS v0.1 section 9.2)."
    : "AMC does not rewrite ACS tool input and serves no ACS modify, so AMC denied the action.";
}
