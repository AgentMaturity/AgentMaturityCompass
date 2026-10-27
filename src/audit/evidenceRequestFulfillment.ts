import { join, resolve } from "node:path";
import { rmSync } from "node:fs";
import { captureApprovedExecutionConsumptionEntry, consumeApprovedExecution } from "../approvals/approvalEngine.js";
import type { ApprovalConsumptionProgress } from "../approvals/approvalConsumptionPublication.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { physicalPathWithMissingSuffix, safeIdSchema } from "../utils/pathSafety.js";
import { captureAuditApiAuthority, captureBinderFulfillment, AuditBinderExecutionError } from "./binderRequestBoundary.js";
import { createAuditBinderArtifactAttempt, defaultAuditPublicationPath, type AuditBinderArtifactAttempt } from "./binderArtifact.js";
import { captureEvidenceRequestFulfillmentPublication } from "./evidenceRequestPublication.js";
import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { AuditBinderPublicationError, type AuditPublicationOptions } from "./binderPublication.js";
import type { EvidenceRequest } from "./evidenceRequestSchema.js";

function enabled() { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); }
export interface AuditFulfillmentProgress {
  phase: string; requestProgress: Awaited<ReturnType<ReturnType<typeof captureEvidenceRequestFulfillmentPublication>["publishFulfilled"]>>["progress"] | null;
  consumeAttempted: boolean; consumeReturned: boolean; consumeAcknowledged: boolean; consumeProgress: Readonly<ApprovalConsumptionProgress>;
  consumption: ReturnType<typeof consumeApprovedExecution> | null;
  pendingRemoveAttempted: boolean; pendingRemoveReturned: boolean; pendingRemoveAcknowledged: boolean;
}
export class AuditEvidenceFulfillmentError extends AuditBinderExecutionError {
  constructor(readonly progress: Readonly<AuditFulfillmentProgress>, binder: AuditBinderArtifactAttempt | null, cause: unknown) {
    super(progress.phase, binder === null ? null : { outFile: binder.result.outFile, sha256: binder.result.sha256 },
      progress.consumption?.consumed ?? null, progress.pendingRemoveAcknowledged, cause); this.name = "AuditEvidenceFulfillmentError";
    this.message = "audit fulfillment did not finish; inspect binder/request effects and actual approval-call return uncertainty";
  }
}
/** Actual maintained fulfillment attempt; no caller can inject a binder result, signature, approval or positive handle. */
export async function fulfillAuditEvidenceRequestAsync(input: { workspace: string; requestId: string; outFile?: string | null }, options: AuditPublicationOptions = {}) {
  const requestId = safeIdSchema.parse(input.requestId), workspace = resolve(input.workspace), params = { ...input, workspace, requestId }, caller = { ...options };
  const entry = captureApprovedExecutionConsumptionEntry(workspace);
  const callerCurrent = () => {
    enabled(); entry.assertPublicCurrent(); caller.beforePublish?.(); enabled(); entry.assertPublicCurrent();
    caller.assertInputsCurrent?.(); enabled(); entry.assertPublicCurrent();
  };
  callerCurrent(); const original = captureAuditApiAuthority(workspace, { beforePublish: callerCurrent }); entry.assertPublicCurrent();
  const selected = captureBinderFulfillment(workspace, requestId, original), request = selected.request, pending = selected.pending;
  const pendingPath = join(workspace, ".amc", "audit", "requests", "pending", `${requestId}.approval.json`);
  selected.assertPendingCurrent(); let expectedPending = captureOrgFiles([pendingPath]); const pendingPhysical = physicalPathWithMissingSuffix(pendingPath); selected.assertPendingCurrent();
  const policies = captureOrgPairs(["approval-policy.yaml", "action-policy.yaml", "tools.yaml", "budgets.yaml"].map(path => join(workspace, ".amc", path)));
  const expectedIntentHash = sha256Hex(canonicalize({ requestId: request.requestId, scopeType: request.scope.type, scopeId: request.scope.id, requestedItems: request.requestedItems }));
  const execution = { workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, expectedIntentId: pending.intentId,
    expectedIntentHash, expectedToolName: "audit.request.fulfill", expectedActionClass: "SECURITY" as const };
  let phase = "binder", binder: AuditBinderArtifactAttempt | null = null;
  let requestAttempt: Awaited<ReturnType<ReturnType<typeof captureEvidenceRequestFulfillmentPublication>["publishFulfilled"]>> | null = null;
  let consumeAttempted = false, consumeReturned = false, consumeAcknowledged = false, consumption: ReturnType<typeof consumeApprovedExecution> | null = null;
  let pendingRemoveAttempted = false, pendingRemoveReturned = false, pendingRemoveAcknowledged = false;
  // This fixed audit negative contains no completed request handle or consumption intrinsic.
  const inputsCurrent = () => {
    callerCurrent(); if (physicalPathWithMissingSuffix(pendingPath) !== pendingPhysical) throw new Error("original fulfillment pending location changed");
    assertOrgPairsCurrent(policies); assertOrgPairsCurrent(expectedPending);
    original(); binder?.assertArtifactCurrent(); assertOrgPairsCurrent(policies); assertOrgPairsCurrent(expectedPending); enabled();
  };
  const consume = entry.selectGrant({ ...execution, executionId: requestId }, {
    beforePublish() { inputsCurrent(); requestAttempt?.assertCurrent(); }, assertOutputsSafe: caller.assertOutputsSafe
  });
  const decisions = consume.decisions;
  const approvals: EvidenceRequest["approvals"] = decisions.filter(row => row.decision === "APPROVE_EXECUTE" || row.decision === "APPROVE_SIMULATE").map(row => ({
    approvalEventHash: sha256Hex(row.approvalDecisionId), userIdHash: sha256Hex(row.userId).slice(0, 16),
    role: (row.roles.find(role => role === "OWNER" || role === "AUDITOR" || role === "APPROVER" || role === "OPERATOR" || role === "VIEWER") ?? "APPROVER") as "OWNER" | "AUDITOR" | "APPROVER" | "OPERATOR" | "VIEWER" }));
  // Intrinsic currentness never invokes the above callback, so request stable -> base -> intrinsic terminates.
  const base = () => { inputsCurrent(); consume.assertCurrent(); inputsCurrent(); };
  let requestAliases: (() => void) | null = null;
  const publication = captureEvidenceRequestFulfillmentPublication(workspace, requestId, { beforePublish: base,
    assertOutputsSafe(paths) { caller.assertOutputsSafe?.(paths); consume.assertOutputsSafe(paths); if (requestAliases === null) requestAliases = captureAuditOutputAliases(paths, [pendingPath, ...policies.members.map(row => row.path)]); requestAliases(); base(); } });
  if (canonicalize(publication.request) !== canonicalize(request)) throw new Error("original fulfillment request selection differs");
  selected.assertCurrent(); publication.assertPreparingCurrent();
  const scopeType = request.scope.type, scopeId = scopeType === "WORKSPACE" ? "workspace" : (request.scope.id.trim() || "default");
  const outFile = params.outFile?.trim() || defaultAuditPublicationPath({ workspace, scopeType, scopeId });
  const progress = (): Readonly<AuditFulfillmentProgress> => Object.freeze({ phase, requestProgress: requestAttempt?.progress ?? null, consumeAttempted, consumeReturned,
    consumeAcknowledged, consumeProgress: consume.progress(), consumption: consumption === null ? null : Object.freeze({ ...consumption }),
    pendingRemoveAttempted, pendingRemoveReturned, pendingRemoveAcknowledged });
  try {
    binder = await createAuditBinderArtifactAttempt({ workspace, scopeType, scopeId, outFile: resolve(workspace, outFile), request }, {
      beforePublish() { base(); selected.assertCurrent(); publication.assertPreparingCurrent(); },
      assertPreparationInputsCurrent: caller.assertPreparationInputsCurrent,
      assertOutputsSafe(paths) { caller.assertOutputsSafe?.(paths); consume.assertOutputsSafe(paths); selected.assertOutputsSafe(paths); publication.assertBinderOutputsSafe(paths); base(); selected.assertCurrent(); publication.assertPreparingCurrent(); }
    });
    phase = "request-fulfillment"; base(); publication.assertPreparingCurrent(); binder.assertLogCurrent();
    requestAttempt = await publication.publishFulfilled({ binderSha256: binder.result.sha256, approvals }, binder.assertLogCurrent);
    phase = "approval-consumption"; requestAttempt.assertCurrent(); base(); consumeAttempted = true;
    const returned = await consume.consume();
    consumeReturned = true; consumption = { ...returned };
    if (!returned.consumed || returned.replay) throw new Error("audit approval consumption was not owned by this attempt");
    consume.assertCommittedCurrent(); consumeAcknowledged = true;
    phase = "pending-removal"; requestAttempt.assertCurrent(); base(); consume.assertCommittedCurrent(); pendingRemoveAttempted = true;
    rmSync(pendingPath, { force: true }); pendingRemoveReturned = true;
    const absent = captureOrgFiles([pendingPath]); if (orgPairBytes(absent, pendingPath) !== null) throw new Error("removed fulfillment pending file is not absent");
    expectedPending = absent; pendingRemoveAcknowledged = true;
    phase = "complete"; requestAttempt.assertCurrent(); base(); consume.assertCommittedCurrent();
    return { request: requestAttempt.request, approvalRequestId: pending.approvalRequestId, export: binder.result, consumption: { ...consumption } };
  } catch (cause) {
    if (binder === null && cause instanceof AuditBinderPublicationError) throw cause;
    throw new AuditEvidenceFulfillmentError(progress(), binder, cause);
  }
}
