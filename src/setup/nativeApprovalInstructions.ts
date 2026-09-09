import { getApprovalInboxItem } from "../approvals/approvalInbox.js";
import { renderNativeGuideCommand, type NativeGuideAction } from "./nativeFirstUseGuide.js";

export interface NativeApprovalInstructions {
  readonly status: "ready-for-review" | "inspection-only";
  readonly inspect: NativeGuideAction | null;
  readonly login: NativeGuideAction | null;
  readonly approve: NativeGuideAction | null;
  readonly deny: NativeGuideAction | null;
  readonly text: string;
}

/**
 * Present the EXISTING authenticated decision path to a one-shot native user.
 * This reads canonical evidence but neither grants authority nor records a vote.
 * The decision CLI must re-check identity, digest, expiry and quorum later.
 */
export function nativeApprovalInstructions(options: {
  readonly workspace: string;
  readonly agentId: string;
  readonly approvalId: string;
  readonly approvalRequestId: string;
}): NativeApprovalInstructions {
  const action = (...argv: string[]): NativeGuideAction => ({ cwd: options.workspace, argv: ["amc", "approvals", ...argv] });
  const safeInput = options.agentId.trim().length > 0 && !/[\x00-\x1f\x7f-\x9f]/.test(options.agentId)
    && /^apprreq_[a-f0-9]{32}$/.test(options.approvalRequestId);
  const inspect = safeInput ? action("show", "--agent", options.agentId, options.approvalRequestId) : null;
  const unavailable = (): NativeApprovalInstructions => ({ status: "inspection-only", inspect, login: null, approve: null, deny: null,
    text: "The pending native approval could not be confirmed against its signed request and current context. No decision template is offered and no action is authorized."
      + (inspect === null ? " Inspect the recorded session for the exact request reference." : `\nInspect in the same workspace: ${renderNativeGuideCommand(inspect)}`)
      + "\nDo not re-sign changed policy or resubmit the task merely to clear this state. The waiting turn can be cancelled with Ctrl-C." });
  if (!safeInput) return unavailable();
  try {
    const inbox = getApprovalInboxItem({ workspace: options.workspace, agentId: options.agentId, approvalRequestId: options.approvalRequestId });
    const request = inbox.request;
    if (!inbox.requestIntegrity.valid || !inbox.chainIntegrity.valid || !inbox.contextIntegrity.valid || inbox.status !== "PENDING"
        || request.approvalRequestId !== options.approvalRequestId || request.agentId !== options.agentId || request.intentId !== options.approvalId
        || !Number.isSafeInteger(request.expiresTs) || request.expiresTs <= Date.now()
        || !/^[a-f0-9]{64}$/.test(inbox.requestDigestSha256)
        || (request.effectiveMode !== "EXECUTE" && request.effectiveMode !== "SIMULATE")) return unavailable();
    const login = action("login", "--username", "<existing-reviewer-username>", "--token-file", "<new-private-session-file>", "--json");
    const identityArgs = ["--agent", options.agentId, "--user-id", "<authenticated-user-id>", "--username", "<authenticated-username>",
      "--roles", "<authenticated-comma-separated-roles>", "--session-token-file", "<private-session-token-file>",
      "--expect-request-digest", inbox.requestDigestSha256, "--reason", "<reviewed-decision-reason>", options.approvalRequestId];
    const approve = action("approve", "--mode", request.effectiveMode.toLowerCase(), ...identityArgs);
    const deny = action("deny", ...identityArgs);
    return { status: "ready-for-review", inspect, login, approve, deny, text: [
      `Awaiting native approval ${options.approvalRequestId}. These are review instructions, not an approval or execution receipt.`,
      `In the same workspace, inspect the exact action and current context: ${renderNativeGuideCommand(inspect!)}`,
      `Authenticate an existing reviewer when a private tracked session is not already available: ${renderNativeGuideCommand(login)}`,
      "The login uses a masked password prompt and prints identity/expiry/path metadata, never the token. Replace the quoted placeholders with that authenticated identity, its private session FILE PATH and your reviewed reason; do not paste password or token values.",
      `After review, choose ONE decision. Approve the current ${request.effectiveMode.toLowerCase()} mode: ${renderNativeGuideCommand(approve)}`,
      `Or deny: ${renderNativeGuideCommand(deny)}`,
      "The command revalidates the authenticated actor, exact request digest, current policy and quorum. A stale request must be reviewed again, not force-approved. Recording a decision is separate from its delivery and from tool execution. Ctrl-C cancels the waiting turn."
    ].join("\n") };
  } catch { return unavailable(); }
}
