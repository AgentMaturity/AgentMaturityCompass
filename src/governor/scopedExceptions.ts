/**
 * Scoped exceptions (P2-24, backlog A08): a signed, approval-bound deviation from one control for named agents, tools,
 * action classes, resources and an amount, inside a window of at most 30 days. Only the enforcement point honours one
 * (the compiled-policy guard abstains for that control), and only while it verifies, is in window, is not revoked and
 * matches the call. An exception is a recorded, reviewed deviation, never a pass: it relaxes no monotonic safety guard,
 * freeze, kill switch, legal hold, residency block or pending legal review (docs/APPROVALS.md).
 */
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isoTimeSchema } from "../contracts/v1/common.js";
import { scopedExceptionV1Schema, type BoundApproval, type ScopedExceptionV1 } from "../contracts/v1/governanceRecords.js";
import { MAX_EXCEPTION_WINDOW_MS } from "../approvals/seam/devProfileException.js";
import type { AnsweredQuestion, ApprovalAnswer, ApprovalAnswerer } from "../approvals/seam/approvalSeamTypes.js";
import type { ActionClass } from "../types.js";
import { signArtifactBytesAsync } from "../lifecycle/artifactSignature.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import {
  amountWithin, approvalMatches, assertRecordApproved, BoundRecordError, draftDigest, inWindow,
  publishSignedRecord, raiseRecordApproval, readSignedRecords
} from "./boundRecords.js";

const scopedExceptionDraftSchema = scopedExceptionV1Schema.omit({ approval: true });
export type ScopedExceptionDraft = z.infer<typeof scopedExceptionDraftSchema>;
export type { ScopedExceptionV1 };

const revocationSchema = z.strictObject({
  schema: z.literal("amc.scoped-exception-revocation/v1"),
  exceptionId: z.string().regex(/^sex_[a-f0-9]{24}$/), reason: z.string().trim().min(1), revokedBy: z.string().min(1), revokedAt: isoTimeSchema
});

/** The facts of one call an exception or break-glass record is matched against; all from the authorization record. */
export interface DeviationCall {
  readonly workspace: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly actionClass: ActionClass;
  readonly amount: { readonly value: string; readonly currency: string } | null;
  readonly resourceId: string | null;
}

const exceptionsDir = (workspace: string): string => join(workspace, ".amc", "governor", "scoped-exceptions");
const revocationsDir = (workspace: string): string => join(exceptionsDir(workspace), "revocations");

function checkDraft(workspace: string, draft: ScopedExceptionDraft): void {
  const notBefore = Date.parse(draft.window.notBefore), notAfter = Date.parse(draft.window.notAfter);
  if (notAfter <= notBefore || notAfter - notBefore > MAX_EXCEPTION_WINDOW_MS) {
    throw new BoundRecordError("invalid_window", "an exception window must be positive and at most 30 days");
  }
  if (draft.scope.workspaceId !== workspaceIdFromDirectory(workspace)) {
    throw new BoundRecordError("cross_workspace", "the exception names another workspace");
  }
}

/** Step 1: validate the draft and raise its approval under the signed SECURITY rule. Nothing is honoured yet. */
export async function requestScopedException(workspace: string,
  input: Omit<ScopedExceptionDraft, "schema" | "exceptionId" | "scope"> & { scope: Omit<ScopedExceptionDraft["scope"], "workspaceId"> }) {
  const draft = scopedExceptionDraftSchema.parse({ ...input, schema: "amc.scoped-exception/v1",
    exceptionId: `sex_${randomUUID().replace(/-/g, "").slice(0, 24)}`, scope: { ...input.scope, workspaceId: workspaceIdFromDirectory(workspace) } });
  checkDraft(workspace, draft);
  const approval = await raiseRecordApproval(workspace, { kind: "scoped-exception", recordId: draft.exceptionId, digest: draftDigest(draft),
    agentId: draft.scope.agentIds[0]!, initiator: draft.requestedBy });
  return { draft, approval };
}

/** Step 2: with the quorum's bound decisions in place, sign and publish the exact draft that was approved. */
export async function issueScopedException(workspace: string, draft: ScopedExceptionDraft,
  approval: BoundApproval): Promise<ScopedExceptionV1> {
  const parsed = scopedExceptionDraftSchema.parse(draft);
  checkDraft(workspace, parsed);
  assertRecordApproved(workspace, approval, { kind: "scoped-exception", recordId: parsed.exceptionId, digest: draftDigest(parsed),
    excluded: [parsed.requestedBy], mode: "quorum" });
  const record = scopedExceptionV1Schema.parse({ ...parsed, approval });
  await publishSignedRecord(workspace, exceptionsDir(workspace), record.exceptionId, record, "scoped-exception");
  return record;
}

/**
 * Revoke, signed, effective on the next call. Any revocation file for an id revokes it, signed or not: a revocation only
 * ever denies, so neither a broken signature nor a locked vault can keep an exception alive. Without a key the
 * revocation still takes effect, and this throws so the operator signs it later.
 */
export async function revokeScopedException(workspace: string, exceptionId: string, reason: string, revokedBy: string): Promise<void> {
  const record = revocationSchema.parse({ schema: "amc.scoped-exception-revocation/v1", exceptionId, reason, revokedBy, revokedAt: new Date().toISOString() });
  const path = join(revocationsDir(workspace), `${record.exceptionId}.json`);
  if (pathExists(path)) return;
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  ensureDir(revocationsDir(workspace));
  writeFileAtomic(path, bytes, 0o644);
  let signature: Awaited<ReturnType<typeof signArtifactBytesAsync>>;
  try {
    signature = await signArtifactBytesAsync({ workspace, artifactKind: "scoped-exception-revocation", bytes });
  } catch {
    throw new BoundRecordError("signing_unavailable", `exception ${record.exceptionId} is revoked, but the revocation is unsigned; unlock the vault and revoke again to sign it`);
  }
  writeFileAtomic(`${path}.sig`, `${JSON.stringify(signature, null, 2)}\n`, 0o644);
}

const revokedIds = (workspace: string): ReadonlySet<string> => new Set(pathExists(revocationsDir(workspace))
  ? readdirSync(revocationsDir(workspace)).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, "")) : []);

export interface ScopedExceptionStatus {
  readonly honoured: readonly ScopedExceptionV1[];
  /** Files present but never honoured, with why: a bad signature, another workspace, revoked, out of window. */
  readonly refused: readonly { readonly id: string; readonly reason: string }[];
}

/** Every exception on disk, honoured only when it verifies, names this workspace and its approval, and is live now. */
export function scopedExceptionStatus(workspace: string, now: number = Date.now()): ScopedExceptionStatus {
  const read = readSignedRecords(workspace, exceptionsDir(workspace), "scoped-exception", (raw) => scopedExceptionV1Schema.parse(raw));
  const revoked = revokedIds(workspace), workspaceId = workspaceIdFromDirectory(workspace);
  const honoured: ScopedExceptionV1[] = [];
  const refused = read.invalid.map((row) => ({ id: row.file.replace(/\.json$/, ""), reason: row.reason }));
  for (const { record, file } of read.records) {
    const why = file !== `${record.exceptionId}.json` ? "file name does not match its exception id"
      : record.scope.workspaceId !== workspaceId ? "names another workspace"
      : !approvalMatches(workspace, record.approval, "scoped-exception", draftDigest(record)) ? "its approval does not match"
      : revoked.has(record.exceptionId) ? "revoked"
      : !inWindow(record.window, now) ? "outside its window" : null;
    if (why === null) honoured.push(record);
    else refused.push({ id: record.exceptionId, reason: why });
  }
  return { honoured, refused };
}

/** Whether the exception covers this call (any control); the guard additionally matches the control. */
function exceptionCoversCall(exception: ScopedExceptionV1, call: DeviationCall): boolean {
  const scope = exception.scope;
  return scope.agentIds.includes(call.agentId) && scope.toolNames.includes(call.toolName) && scope.actionClasses.includes(call.actionClass)
    && (scope.resourceIds === null || (call.resourceId !== null && scope.resourceIds.includes(call.resourceId)))
    && (scope.maxAmount === null || amountWithin(call.amount, scope.maxAmount));
}

/** Honoured exceptions that cover the call, re-read and re-verified on every call. */
export function matchingScopedExceptions(call: DeviationCall, now: number = Date.now()): ScopedExceptionV1[] {
  return scopedExceptionStatus(call.workspace, now).honoured.filter((exception) => exceptionCoversCall(exception, call));
}

/**
 * P2-24: the regulated-profile form of `--approval-exception`. A workspace with an active compiled plan accepts only
 * the id of a signed ScopedExceptionV1 whose control is the plan's approval control for the gate's action class; the
 * unsigned note above keeps working only outside a regulated profile. The exception is re-read and re-verified for
 * every question (revocation, window, agent, tool, class, resource and amount), and it abstains whenever it does not
 * cover the question exactly. Its id and approval are carried in the answerer name, which the signed log records.
 */
export function createScopedExceptionAnswerer(input: {
  readonly workspace: string;
  readonly agentId: string;
  readonly exceptionId: string;
  /** The controls (id and current version in the active plan) its approval rule for the gate's class names. */
  readonly approvalControls: readonly { readonly controlId: string; readonly controlVersion: string }[];
}): ApprovalAnswerer {
  const exception = scopedExceptionStatus(input.workspace).honoured.find((row) => row.exceptionId === input.exceptionId);
  if (!exception) {
    throw new Error(`--approval-exception ${input.exceptionId} is not a signed, approved, live scoped exception in this workspace; `
      + "a regulated profile refuses the unsigned ADR-5 note");
  }
  const current = input.approvalControls.find((control) => control.controlId === exception.control.controlId);
  if (current === undefined) {
    throw new Error(`scoped exception ${exception.exceptionId} is for control ${exception.control.controlId}, not the approval control `
      + `(${input.approvalControls.map((control) => control.controlId).join(", ") || "none in the active plan"})`);
  }
  // An exception granted for one control version never covers another (the compiled-policy guard applies the same rule).
  if (current.controlVersion !== exception.control.controlVersion) {
    throw new Error(`scoped exception ${exception.exceptionId} was granted for ${exception.control.controlId}@${exception.control.controlVersion}; `
      + `the active plan runs version ${current.controlVersion}`);
  }
  return {
    name: `scoped-exception:${exception.exceptionId} (control ${exception.control.controlId}@${exception.control.controlVersion}, `
      + `approval ${exception.approval.approvalRequestId}, expires ${exception.window.notAfter})`,
    answer(question: AnsweredQuestion): Promise<ApprovalAnswer | null> {
      const bindings = (question.intentPayload as { bindings?: { amount?: { value: string; currency: string } | null; resourceId?: string | null } }).bindings;
      const covered = matchingScopedExceptions({ workspace: input.workspace, agentId: input.agentId, toolName: question.toolName,
        actionClass: question.actionClass, amount: bindings?.amount ?? null, resourceId: bindings?.resourceId ?? null })
        .some((row) => row.exceptionId === exception.exceptionId);
      return Promise.resolve(covered ? "allow" : null);
    }
  };
}
