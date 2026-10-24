import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { join } from "node:path";
import { z } from "zod";
import { captureOrgFiles, orgPairBytes, assertOrgPairsCurrent, captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { auditRequestsOpenDir, auditRequestsClosedDir } from "./auditPolicyStore.js";
import { evidenceRequestSchema } from "./evidenceRequestSchema.js";
import type { AuditPublicationOptions } from "./binderPublication.js";

export function captureAuditApiAuthority(workspace: string, options: AuditPublicationOptions) {
  const bundle = captureOrgPairsAuthority(workspace, options.beforePublish), log = captureWorkspaceLogAuthority(workspace, bundle);
  return () => { bundle(); log.assertCurrent(); };
}
/** Preserve the existing loader's open-before-closed semantics. This snapshot adds no new request trust admission. */
export function captureBinderEvidenceRequest(workspace: string, requestId?: string | null) {
  if (!requestId) return { request: null, assertCurrent() {}, assertOutputsSafe(_paths: readonly string[]) {} };
  const open = join(auditRequestsOpenDir(workspace), `${requestId}.json`), closed = join(auditRequestsClosedDir(workspace), `${requestId}.json`);
  const before = captureOrgFiles([open, `${open}.sig`, closed, `${closed}.sig`]), bytes = orgPairBytes(before, open) ?? orgPairBytes(before, closed);
  if (bytes === null) throw new Error("audit evidence request is missing");
  const request = evidenceRequestSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (request.requestId !== requestId) throw new Error("audit evidence request identity differs");
  const protectedPaths = before.members.map(row => row.path);
  return { request, assertCurrent: () => assertOrgPairsCurrent(before), assertOutputsSafe: (paths: readonly string[]) => captureAuditOutputAliases(paths, protectedPaths)() };
}
const pendingFulfillmentSchema = z.object({ v: z.literal(1), requestId: z.string().min(1), approvalRequestId: z.string().min(1),
  intentId: z.string().min(1), agentId: z.string().min(1), createdTs: z.number().int() });
export function captureBinderFulfillment(workspace: string, requestId: string, assertOriginal: () => void) {
  const selected = captureBinderEvidenceRequest(workspace, requestId), request = selected.request!;
  if (request.status !== "OPEN" && request.status !== "APPROVED") throw new Error("audit evidence request is not fulfillable");
  const path = join(workspace, ".amc", "audit", "requests", "pending", `${requestId}.approval.json`), before = captureOrgFiles([path]);
  const bytes = orgPairBytes(before, path); if (bytes === null) throw new Error("pending audit fulfillment approval is missing");
  const pending = pendingFulfillmentSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (pending.requestId !== request.requestId) throw new Error("audit fulfillment approval identity differs");
  const expectedIntentHash = sha256Hex(canonicalize({ requestId: request.requestId, scopeType: request.scope.type, scopeId: request.scope.id, requestedItems: request.requestedItems }));
  const assertCurrent = () => { assertOriginal(); selected.assertCurrent(); assertOrgPairsCurrent(before);
    const verified = verifyApprovalForExecution({ workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId,
      expectedIntentId: pending.intentId, expectedIntentHash, expectedToolName: "audit.request.fulfill", expectedActionClass: "SECURITY" });
    if (!verified.ok) throw new Error("audit fulfillment approval is not executable");
    assertOriginal(); selected.assertCurrent(); assertOrgPairsCurrent(before);
  };
  assertCurrent(); return { request, assertCurrent, assertOutputsSafe(paths: readonly string[]) {
    selected.assertOutputsSafe(paths); captureAuditOutputAliases(paths, [path])();
  } };
}
export class AuditBinderExecutionError extends Error {
  readonly code = "AUDIT_BINDER_EXECUTION_INCOMPLETE";
  constructor(readonly phase: string, readonly completedBinder: { outFile: string; sha256: string } | null,
    readonly approvalConsumed: boolean | null, readonly pendingRemoved: boolean, cause: unknown) {
    super("audit binder execution did not complete; acknowledged binder and approval effects are retained", { cause }); this.name = "AuditBinderExecutionError";
  }
}
