/**
 * `amc governor-override` and `amc emergency-override` (P2-24): both delegate here and write a signed
 * BreakGlassRecordV1 in two steps. The first run requests it (opens the incident, raises the approval); after one
 * approver with an allowed role records a decision bound to the request digest, `--activate --approval` signs it.
 * The requester is the authenticated user of an `amc approvals login` token (`--session-token-file`), recorded as the
 * approval request's initiator, so the engine refuses that user's own decision. Without a valid session it refuses.
 */
import { isActionClass } from "./actionCatalog.js";
import { activateBreakGlass, requestBreakGlass } from "./breakGlass.js";
import { boundApprovalFor } from "./boundRecords.js";

export interface BreakGlassCommandOptions {
  readonly agent: string;
  readonly ttlMs: number;
  readonly reason?: string;
  readonly tools?: string;
  readonly actionClasses?: string;
  readonly controls?: string;
  readonly activate?: string;
  readonly approval?: string;
  readonly sessionTokenFile?: string;
}

const list = (raw: string | undefined, flag: string): string[] => {
  const items = (raw ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new Error(`${flag} is required: break-glass names exactly what it covers`);
  return items;
};

/** Run one step and return the lines to print. */
export async function breakGlassCommand(workspace: string, opts: BreakGlassCommandOptions): Promise<string> {
  if (opts.activate !== undefined) {
    if (opts.approval === undefined) throw new Error("--activate needs --approval <approvalRequestId>");
    const record = await activateBreakGlass(workspace, opts.activate, boundApprovalFor(workspace, opts.agent, opts.approval));
    return [`Break-glass activated: ${record.breakGlassId} (incident ${record.incidentId})`,
      `  Window: ${record.window.notBefore} to ${record.window.notAfter}`, `  Controls: ${record.scope.controlIds.join(", ")}`,
      `  Post-hoc review due: ${record.postHocReviewDueAt}. The next break-glass is refused until it is filed.`].join("\n");
  }
  if (opts.sessionTokenFile === undefined) throw new Error("--session-token-file is required: run amc approvals login; break-glass names an authenticated requester");
  const named = list(opts.actionClasses, "--action-classes"), actionClasses = named.filter(isActionClass);
  if (actionClasses.length !== named.length) throw new Error(`--action-classes: unknown action class in ${named.join(", ")}`);
  const { draft, approval } = await requestBreakGlass(workspace, {
    sessionTokenFile: opts.sessionTokenFile, reason: opts.reason ?? "", ttlMs: opts.ttlMs,
    scope: { agentIds: [opts.agent], toolNames: list(opts.tools, "--tools"), actionClasses, controlIds: list(opts.controls, "--controls") }
  });
  return [`Break-glass requested: ${draft.breakGlassId} (incident ${draft.incidentId}); nothing is honoured until it is activated.`,
    `  One approver with an allowed role, signed in (amc approvals login), runs: amc approvals approve --agent ${approval.agentId} `
      + `--mode execute --reason <why> --username <name> --roles <role> --session-token-file <file> `
      + `--expect-request-digest ${approval.requestBindingDigest} ${approval.approvalRequestId}`,
    `  Then: amc governor-override --agent ${opts.agent} --activate ${draft.breakGlassId} --approval ${approval.approvalRequestId}`].join("\n");
}
