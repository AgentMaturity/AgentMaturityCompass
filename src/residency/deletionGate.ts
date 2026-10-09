import { resolve } from "node:path";
import { z } from "zod";
import { loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { getWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { deletionTargetSchema, holdVerdict, readLegalHoldRegistry, withLegalHoldLock } from "./legalHoldRegistry.js";
import type { DeletionRequest, HoldVerdict } from "./types.js";

type Clear = Extract<HoldVerdict, { verdict: "clear" }>;
type Refused = Exclude<HoldVerdict, Clear>;
const term = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const requestSchema = z.strictObject({ workspace: z.string().min(1).refine(value => value.trim().length > 0), executor: term,
  target: deletionTargetSchema });
export class DeletionDenied extends Error {
  readonly verdict: Refused;
  readonly auditPersisted: boolean;
  constructor(verdict: Refused, auditPersisted: boolean) {
    super(`Deletion denied: ${verdict.verdict === "held" ? `held (${verdict.holdIds.slice(0, 8).join(",")})` : verdict.reason}`);
    this.name = "DeletionDenied"; this.verdict = Object.freeze({ ...verdict,
      ...(verdict.verdict === "held" ? { holdIds: Object.freeze([...verdict.holdIds]) } : {}) });
    this.auditPersisted = auditPersisted;
  }
}
function deny(request: DeletionRequest, verdict: Refused): never {
  let persisted = false;
  try {
    appendOpsAuditEvent({ workspace: request.workspace,
      auditType: verdict.verdict === "held" ? "DELETION_DENIED_HELD" : "DELETION_DENIED_HOLD_UNKNOWN", severity: "HIGH",
      payload: { executor: request.executor, target: request.target, holdVerdict: verdict } });
    persisted = true;
  } catch { /* Audit unavailability never permits the deletion. */ }
  throw new DeletionDenied(verdict, persisted);
}
function normalized(request: DeletionRequest): DeletionRequest {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new DeletionDenied({ verdict: "unknown", reason: "registry_unreadable" }, false);
  return { ...parsed.data, workspace: resolve(parsed.data.workspace), target: { ...parsed.data.target,
    ...(parsed.data.target.sessionIds ? { sessionIds: [...new Set(parsed.data.target.sessionIds)].sort() } : {}),
    ...(parsed.data.target.sessionHashes ? { sessionHashes: [...new Set(parsed.data.target.sessionHashes)].sort() } : {}) } };
}
function assertUnlocked(request: DeletionRequest): Clear {
  const verdict = holdVerdict({ workspace: request.workspace, target: request.target });
  if (verdict.verdict !== "clear") return deny(request, verdict);
  try {
    const audit = appendOpsAuditEvent({ workspace: request.workspace, auditType: "DELETION_ALLOWED", payload: {
      executor: request.executor, target: request.target, holdVerdict: verdict } });
    if (!audit.eventId || !/^[a-f0-9]{64}$/.test(audit.eventHash)) throw new Error("audit_unacknowledged");
  } catch { return deny(request, { verdict: "unknown", reason: "registry_unreadable" }); }
  return verdict;
}
/** Preflight only; use withDeletionGate to keep the hold writer lock across the actual synchronous effect. */
export function assertDeletionAllowed(request: DeletionRequest): Clear {
  const call = normalized(request);
  let entered = false;
  try { return withLegalHoldLock(call.workspace, () => { entered = true; return assertUnlocked(call); }); }
  catch (error) {
    if (entered || error instanceof DeletionDenied) throw error;
    return deny(call, { verdict: "unknown", reason: "registry_unreadable" });
  }
}
/** Native async functions and PromiseLike returns are refused; the callback must perform its effect synchronously. */
export function withDeletionGate<T>(request: DeletionRequest, operation: () => T & (T extends PromiseLike<unknown> ? never : unknown)): T {
  const call = normalized(request);
  if (typeof operation !== "function" || operation.constructor.name === "AsyncFunction")
    return deny(call, { verdict: "unknown", reason: "registry_unreadable" });
  let entered = false;
  try {
    return withLegalHoldLock(call.workspace, () => {
      entered = true; assertUnlocked(call);
      const result = operation();
      if (result && (typeof result === "object" || typeof result === "function") && "then" in result && typeof result.then === "function")
        return deny(call, { verdict: "unknown", reason: "registry_unreadable" });
      return result;
    });
  } catch (error) {
    // A callback error is unrelated to hold admission and must retain its original error contract.
    if (entered || error instanceof DeletionDenied) throw error;
    return deny(call, { verdict: "unknown", reason: "registry_unreadable" });
  }
}
/** An unset scope never guesses another workspace from a deletion path. */
export function resolveDeletionWorkspace(workspace?: string): string {
  const scoped = workspace ?? getWorkspaceScope();
  if (scoped !== undefined) {
    if (typeof scoped !== "string" || !scoped.trim()) throw new DeletionDenied({ verdict: "unknown", reason: "registry_unreadable" }, false);
    return resolve(scoped);
  }
  const fallback = process.cwd();
  try {
    const snapshot = readLegalHoldRegistry(fallback);
    if (loadActiveCompiledPolicy(fallback) || !snapshot.headMissing || snapshot.holdsChecked) throw new Error("scope_required");
    return resolve(fallback);
  } catch { throw new DeletionDenied({ verdict: "unknown", reason: "tenant_unmapped" }, false); }
}
