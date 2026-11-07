import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { getApprovalInboxItem, type ApprovalInboxItem } from "../approvals/approvalInbox.js";
import { readNativeApprovalActor } from "../setup/nativeApprovalIdentity.js";
import { checkAcpShape } from "./acpSchema.js";
import { ACP_RUNTIME_META_KEY } from "./acpRuntimeContracts.js";
import { acpToolKind } from "./acpToolCallView.js";

/**
 * `session/request_permission` over ACP (SH-UI-04).
 *
 * The approvals ENGINE decides; the client only chooses between the options this process offers. The request is sent
 * from the gate's `onRaised` hook, AFTER the engine has raised a signed request, so there is no answerer running ahead
 * of it and no client text can grant authority on its own:
 *   - `reject_once` is always offered and cancels the turn (cause `user`, by `acp-client`);
 *   - `allow_once` is offered only when the operator pinned an authenticated tracked login at launch
 *     (`amc acp --reviewer-session-token-file`). Selecting it records the decision through the same digest-bound
 *     `amc approvals approve` path native chat uses, under that login's own roles, and the signed decision is read
 *     back before the turn is allowed to continue. The reason is never invented: the client supplies one in
 *     `_meta["dev.agentmaturity.amc"].reason` on its response, or the operator fixed one with `--reviewer-reason`.
 * Anything short of a confirmed signed decision cancels the turn; the request stays in the inbox for the approvals CLI.
 *
 * A client that identifies itself as an AMC SDK (it sends `clientCapabilities._meta["dev.agentmaturity.amc"]`) receives
 * this request only when it negotiated `permissionRequests: "amc-permission-v1"`; the current SDK clients did not, so
 * they keep today's behaviour (the request waits in the inbox for `approve()`).
 */

export const ACP_PERMISSION_CONTRACT = "amc-permission-v1";

export interface AcpApprovalRaised {
  readonly sessionId: string;
  readonly approvalId: string;
  readonly approvalRequestId: string;
  /** Whether the connected client negotiated permission requests (or is a generic ACP client). */
  readonly negotiated: boolean;
  readonly request: (method: string, params: unknown, signal: AbortSignal) => Promise<unknown>;
  readonly cancelTurn: (by: string) => void;
}

export interface AcpPermissionReviewer {
  /** A private (0600) file holding an active tracked workspace login; read at each decision, never logged. */
  readonly tokenFile: string;
  /** The fixed decision reason, used when the client's response carries none. */
  readonly reason?: string;
}

export interface AcpPermissionHandlerInit {
  readonly workspace: string;
  readonly agentId: string;
  /** How to run `amc approvals approve`: this same CLI, never a shell. */
  readonly cli: { readonly execPath: string; readonly execArgv: readonly string[]; readonly entry: string };
  readonly reviewer?: AcpPermissionReviewer;
  readonly log: (message: string) => void;
}

const MAX_REASON = 1000;

/** The decision reason: the client's, else the launch default; null when neither is usable. */
export function permissionReason(result: unknown, fallback: string | undefined): string | null {
  const meta = result !== null && typeof result === "object" ? (result as { _meta?: unknown })._meta : undefined;
  const extension = meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>)[ACP_RUNTIME_META_KEY] : undefined;
  const supplied = extension !== null && typeof extension === "object" ? (extension as { reason?: unknown }).reason : undefined;
  const candidate = typeof supplied === "string" ? supplied : fallback;
  if (typeof candidate !== "string") return null;
  const reason = candidate.trim();
  return reason.length === 0 || reason.length > MAX_REASON || reason.includes("\0") ? null : reason;
}

export function createAcpPermissionHandler(init: AcpPermissionHandlerInit): { readonly capability: "signed-reviewer" | "reject-only"; handle(event: AcpApprovalRaised): void } {
  const workspace = resolve(init.workspace);
  const pending = (event: AcpApprovalRaised): ApprovalInboxItem => {
    const item = getApprovalInboxItem({ workspace, agentId: init.agentId, approvalRequestId: event.approvalRequestId });
    if (item.request.approvalRequestId !== event.approvalRequestId || item.request.agentId !== init.agentId || item.request.intentId !== event.approvalId
      || !item.requestIntegrity.valid || !item.chainIntegrity.valid || !item.contextIntegrity.valid) throw new Error("The queued request does not match this session's approval event or does not verify");
    return item;
  };
  const approve = (args: readonly string[], signal: AbortSignal): Promise<boolean> => new Promise(done => {
    let settled = false;
    const finish = (ok: boolean): void => { if (!settled) { settled = true; signal.removeEventListener("abort", onAbort); done(ok); } };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(init.cli.execPath, [...init.cli.execArgv, init.cli.entry, ...args], { cwd: workspace, env: process.env, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    } catch { finish(false); return; }
    const onAbort = (): void => { try { child.kill("SIGTERM"); } catch { /* reported by close */ } };
    signal.addEventListener("abort", onAbort, { once: true });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => { if (stderr.length < 4000) stderr += text; });
    child.once("error", () => finish(false));
    child.once("close", code => {
      if (code !== 0) init.log(`approval engine refused the decision: ${stderr.trim().split("\n").at(-1) ?? ""}`);
      finish(code === 0);
    });
  });
  return {
    capability: init.reviewer ? "signed-reviewer" : "reject-only",
    handle(event) {
      if (!event.negotiated) { init.log(`signed approval pending: ${event.approvalRequestId}`); return; }
      void decide(event).catch(error => {
        init.log(`permission request failed: ${error instanceof Error ? error.message : String(error)}; cancelling the turn`);
        event.cancelTurn("acp-permission-failed");
      });
    }
  };

  async function decide(event: AcpApprovalRaised): Promise<void> {
    const item = pending(event);
    if (item.status !== "PENDING") { init.log(`approval ${event.approvalRequestId} is already ${item.status}; no permission requested`); return; }
    const controller = new AbortController();
    const expiry = setTimeout(() => controller.abort(), Math.max(0, Math.min(2_147_483_647, item.request.expiresTs - Date.now())));
    try {
      const request = item.request;
      const options = [
        ...(init.reviewer ? [{ optionId: "allow_once", name: `Approve ${request.toolName} once (signed by the pinned reviewer)`, kind: "allow_once" }] : []),
        { optionId: "reject_once", name: "Reject and cancel this turn", kind: "reject_once" }
      ];
      let result: unknown;
      try {
        result = await event.request("session/request_permission", {
          sessionId: event.sessionId,
          toolCall: { toolCallId: event.approvalId, title: request.toolName, kind: acpToolKind(request.toolName), status: "pending" },
          options,
          _meta: { [ACP_RUNTIME_META_KEY]: { approvalRequestId: request.approvalRequestId, requestDigestSha256: item.requestDigestSha256,
            actionClass: request.actionClass, riskTier: request.riskTier, effectiveMode: request.effectiveMode, boundHashes: request.boundHashes,
            expiresAt: new Date(request.expiresTs).toISOString(), decision: init.reviewer ? "signed-reviewer" : "reject-only" } }
        }, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) { init.log(`approval ${event.approvalRequestId} expired before the client answered`); return; }
        throw error;
      }
      const shape = await checkAcpShape("RequestPermissionResponse", result);
      if (!shape.ok) throw new Error(`malformed permission response: ${shape.reason}`);
      const outcome = (result as { outcome: { outcome: string; optionId?: string } }).outcome;
      if (outcome.outcome === "cancelled") return; // The client cancelled the turn itself; nothing to decide.
      if (outcome.optionId !== "allow_once" || !init.reviewer) { event.cancelTurn("acp-client"); return; }
      const reason = permissionReason(result, init.reviewer.reason);
      if (reason === null) { init.log("allow_once without a decision reason (client _meta or --reviewer-reason); cancelling the turn"); event.cancelTurn("acp-permission-no-reason"); return; }
      const actor = readNativeApprovalActor(workspace, init.reviewer.tokenFile);
      if (!actor.roles.some(role => request.rolesAllowed.includes(role))) throw new Error("The pinned reviewer's authenticated roles are not allowed to decide this request");
      const current = pending(event);
      if (current.status !== "PENDING" || current.requestDigestSha256 !== item.requestDigestSha256) throw new Error("The approval changed while the client was deciding; no decision sent");
      const completed = await approve(["approvals", "approve", "--agent", request.agentId, "--mode", request.effectiveMode.toLowerCase(),
        "--reason", reason, "--username", actor.username, "--roles", actor.roles.join(","), "--user-id", actor.userId,
        "--session-token-file", init.reviewer.tokenFile, "--expect-request-digest", item.requestDigestSha256, "--", request.approvalRequestId], controller.signal);
      const after = pending(event);
      const kind = request.effectiveMode === "EXECUTE" ? "APPROVE_EXECUTE" : "APPROVE_SIMULATE";
      const signed = after.decisions.find(row => !item.decisions.some(old => old.approvalDecisionId === row.approvalDecisionId)
        && row.userId === actor.userId && row.username === actor.username && row.decision === kind && row.requestDigestSha256 === item.requestDigestSha256);
      if (!completed || !signed) { init.log("no matching signed decision was confirmed; cancelling the turn"); event.cancelTurn("acp-permission-unconfirmed"); return; }
      init.log(`signed approve decision ${signed.approvalDecisionId}; request status ${after.status}, quorum ${after.quorum.received}/${after.quorum.required}`);
    } finally { clearTimeout(expiry); controller.abort(); }
  }
}
