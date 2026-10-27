/**
 * Break-glass (P2-24, backlog A08, gap G16): a signed, time-boxed (at most 24 h), incident-linked deviation from named
 * controls for named agents, tools and action classes. It needs one decision bound to its approval request from a role
 * the signed approval policy allows (fast, never a quorum, never without a key). The signed record is never edited:
 * actions taken under it are `BREAK_GLASS_ACTION` ledger rows. Until a review record for the packet (record digest
 * plus action digests) exists, the workspace refuses the next break-glass (`previous_break_glass_unreviewed`) and an
 * overdue review raises `POSTMORTEM_OVERDUE`. Break-glass never overrides a freeze, kill switch, legal hold, residency
 * block or monotonic safety guard; it is a recorded, reviewed deviation, never compliance.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { breakGlassActionV1Schema, breakGlassRecordV1Schema, type BreakGlassActionV1, type BreakGlassRecordV1 } from "../contracts/v1/governanceRecords.js";
import { recordActionIncidents } from "../actions/actionRecovery.js";
import { reviewStatusFor } from "../approvals/reviewRecords.js";
import type { UserRole } from "../auth/roles.js";
import { openLedger } from "../ledger/ledger.js";
import type { ActionClass } from "../types.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import {
  approvalMatches, assertRecordApproved, BoundRecordError, draftDigest, inWindow, publishSignedRecord,
  raiseRecordApproval, readSignedRecords, type BoundApproval
} from "./boundRecords.js";
import type { DeviationCall } from "./scopedExceptions.js";

const BREAK_GLASS_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const POST_HOC_REVIEW_MS = 48 * 60 * 60 * 1000;
const BREAK_GLASS_ACTION_AUDIT = "BREAK_GLASS_ACTION";

const draftSchema = breakGlassRecordV1Schema.omit({ approval: true });
export type BreakGlassDraft = z.infer<typeof draftSchema>;
export type { BreakGlassActionV1, BreakGlassRecordV1 };

const breakGlassDir = (workspace: string): string => join(workspace, ".amc", "governor", "break-glass");
const pendingPath = (workspace: string, id: string): string => join(breakGlassDir(workspace), "pending", `${id}.json`);

interface Activated { readonly record: BreakGlassRecordV1; readonly sha256: string }

/**
 * Every activated record, verified. Any file that does not verify (unsigned, as legacy overrides were, or tampered)
 * refuses new activations, since the register's history is no longer known.
 */
export function breakGlassRegister(workspace: string): { records: Activated[]; invalid: { file: string; reason: string }[] } {
  const read = readSignedRecords(workspace, breakGlassDir(workspace), "break-glass", (raw) => breakGlassRecordV1Schema.parse(raw));
  const workspaceId = workspaceIdFromDirectory(workspace);
  const invalid = [...read.invalid];
  const records: Activated[] = [];
  for (const row of read.records) {
    if (row.file !== `${row.record.breakGlassId}.json` || row.record.scope.workspaceId !== workspaceId
      || !approvalMatches(workspace, row.record.approval, "break-glass", draftDigest(row.record))) invalid.push({ file: row.file, reason: "record does not bind to this workspace's approval" });
    else records.push({ record: row.record, sha256: row.sha256 });
  }
  return { records, invalid };
}

/** The register's head: the one record no other names as its predecessor, or GENESIS. A fork or gap refuses. */
function registerHead(records: readonly Activated[]): string {
  const byPrev = new Map(records.map((row) => [row.record.prevBreakGlassDigest, row]));
  if (byPrev.size !== records.length) throw new BoundRecordError("register_forked", "two break-glass records name the same predecessor");
  let head = "GENESIS";
  for (let seen = 0; byPrev.has(head); seen++) {
    if (seen > records.length) throw new BoundRecordError("register_forked", "the break-glass register has a cycle");
    head = byPrev.get(head)!.sha256;
  }
  if (records.length > 0 && !records.some((row) => row.sha256 === head)) throw new BoundRecordError("register_forked", "the break-glass register is not one chain");
  return head;
}

/** The actions taken under a break-glass record, from the signed ledger's `BREAK_GLASS_ACTION` rows. */
export function breakGlassActions(workspace: string, breakGlassId: string): BreakGlassActionV1[] {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return [];
  const ledger = openLedger(workspace);
  try {
    // ponytail: one indexed-by-nothing scan per review check; add a meta index if break-glass volume ever matters.
    const rows = ledger.db.prepare("SELECT payload_inline FROM evidence_events WHERE event_type = 'audit' "
      + "AND json_extract(meta_json, '$.auditType') = ? AND json_extract(meta_json, '$.breakGlassId') = ? ORDER BY rowid ASC")
      .all(BREAK_GLASS_ACTION_AUDIT, breakGlassId) as Array<{ payload_inline: string | null }>;
    return rows.map((row) => breakGlassActionV1Schema.parse((JSON.parse(row.payload_inline ?? "null") as { action?: unknown } | null)?.action));
  } finally {
    ledger.close();
  }
}

/** What a post-hoc review covers: the signed record's digest and every action digest under it. */
export function breakGlassPacketDigest(workspace: string, activated: Activated): string {
  const actionDigests = breakGlassActions(workspace, activated.record.breakGlassId).map((action) => sha256Hex(canonicalize(action))).sort();
  return sha256Hex(canonicalize({ recordSha256: activated.sha256, actionDigests }));
}

/** Reviewed: a verified review record (approved or rejected) exists for the packet as it is now. */
function reviewed(workspace: string, activated: Activated): boolean {
  return reviewStatusFor(workspace, { kind: "break-glass-packet", id: activated.record.breakGlassId,
    currentSha256: breakGlassPacketDigest(workspace, activated) }) !== "pending";
}

function assertMayActivate(workspace: string): string {
  const register = breakGlassRegister(workspace);
  if (register.invalid.length > 0) throw new BoundRecordError("register_invalid", `break-glass register has records that do not verify: ${register.invalid.map((row) => row.file).join(", ")}`);
  const unreviewed = register.records.find((row) => !reviewed(workspace, row));
  if (unreviewed) throw new BoundRecordError("previous_break_glass_unreviewed", `break-glass ${unreviewed.record.breakGlassId} has no post-hoc review yet`);
  return registerHead(register.records);
}

export interface BreakGlassRequest {
  readonly activatedBy: { readonly userId: string; readonly roles: readonly UserRole[] };
  readonly reason: string;
  readonly scope: Omit<BreakGlassDraft["scope"], "workspaceId">;
  readonly ttlMs: number;
}

/**
 * Step 1: refuse while an earlier break-glass is unreviewed, open the incident, write the pending draft and raise its
 * approval. The incident is opened here because the approved record must name it.
 */
export async function requestBreakGlass(workspace: string, input: BreakGlassRequest): Promise<{ draft: BreakGlassDraft; approval: BoundApproval }> {
  if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0 || input.ttlMs > BREAK_GLASS_MAX_WINDOW_MS) {
    throw new BoundRecordError("invalid_window", "a break-glass window must be positive and at most 24 hours");
  }
  const head = assertMayActivate(workspace);
  const breakGlassId = `bg_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = Date.now();
  const base = draftSchema.parse({ schema: "amc.break-glass/v1", breakGlassId, activatedBy: { userId: input.activatedBy.userId, roles: [...input.activatedBy.roles] },
    reason: input.reason, scope: { ...input.scope, workspaceId: workspaceIdFromDirectory(workspace) },
    window: { notBefore: new Date(now).toISOString(), notAfter: new Date(now + input.ttlMs).toISOString() },
    incidentId: "pending", postHocReviewDueAt: new Date(now + input.ttlMs + POST_HOC_REVIEW_MS).toISOString(), prevBreakGlassDigest: head });
  let incidentId: string | undefined;
  try {
    [incidentId] = recordActionIncidents(workspace, [base.scope.agentIds[0]!], { title: `Break-glass ${breakGlassId} requested`,
      description: `${base.activatedBy.userId} requested break-glass for controls ${base.scope.controlIds.join(", ")} (${base.reason}). `
        + "Resolve it only after a post-hoc review of the break-glass packet is filed.", triggerId: breakGlassId, triggerType: "GOVERNANCE_VIOLATION" });
  } catch (error) {
    throw new BoundRecordError("signing_unavailable", `the break-glass incident could not be signed (${error instanceof Error ? error.message : "error"}); nothing was recorded`);
  }
  const draft = draftSchema.parse({ ...base, incidentId });
  ensureDir(join(breakGlassDir(workspace), "pending"));
  writeFileAtomic(pendingPath(workspace, breakGlassId), JSON.stringify(draft, null, 2), 0o600);
  const approval = await raiseRecordApproval(workspace, { kind: "break-glass", recordId: breakGlassId, digest: draftDigest(draft),
    agentId: draft.scope.agentIds[0]! });
  return { draft, approval };
}

/** Step 2: with one bound decision in place, sign and publish the pending draft exactly as it was approved. */
export async function activateBreakGlass(workspace: string, breakGlassId: string, approval: BoundApproval): Promise<BreakGlassRecordV1> {
  if (!/^bg_[a-f0-9]{24}$/.test(breakGlassId) || !pathExists(pendingPath(workspace, breakGlassId))) {
    throw new BoundRecordError("unknown_break_glass", `no pending break-glass ${breakGlassId}`);
  }
  const draft = draftSchema.parse(JSON.parse(readUtf8(pendingPath(workspace, breakGlassId))) as unknown);
  assertRecordApproved(workspace, approval, { kind: "break-glass", recordId: breakGlassId, digest: draftDigest(draft),
    initiator: draft.activatedBy.userId, mode: "single" });
  if (assertMayActivate(workspace) !== draft.prevBreakGlassDigest) throw new BoundRecordError("register_moved", "another break-glass was activated meanwhile; request again");
  if (Date.now() >= Date.parse(draft.window.notAfter)) throw new BoundRecordError("window_ended", "the break-glass window ended before activation");
  const record = breakGlassRecordV1Schema.parse({ ...draft, approval });
  await publishSignedRecord(workspace, breakGlassDir(workspace), breakGlassId, record, "break-glass");
  return record;
}

/** Verified break-glass records live now that cover the call (any control); the guard matches the control. */
export function matchingBreakGlass(call: DeviationCall, now: number = Date.now()): BreakGlassRecordV1[] {
  return breakGlassRegister(call.workspace).records.map((row) => row.record).filter((record) => inWindow(record.window, now)
    && record.scope.agentIds.includes(call.agentId) && record.scope.toolNames.includes(call.toolName)
    && record.scope.actionClasses.includes(call.actionClass));
}

/** `POSTMORTEM_OVERDUE` for each record whose post-hoc review is past due, and `INVALID_SIGNATURE` for files never honoured. */
export function breakGlassAlerts(workspace: string, agentId: string, now: number = Date.now()):
  { overrideId: string; agentId: string; alertType: "POSTMORTEM_OVERDUE" | "INVALID_SIGNATURE"; message: string; ts: number }[] {
  const register = breakGlassRegister(workspace);
  return [
    ...register.invalid.map((row) => ({ overrideId: row.file.replace(/\.json$/, ""), agentId, alertType: "INVALID_SIGNATURE" as const,
      message: `Break-glass file ${row.file} is never honoured: ${row.reason}`, ts: now })),
    ...register.records.filter((row) => row.record.scope.agentIds.includes(agentId) && now > Date.parse(row.record.postHocReviewDueAt) && !reviewed(workspace, row))
      .map((row) => ({ overrideId: row.record.breakGlassId, agentId, alertType: "POSTMORTEM_OVERDUE" as const,
        message: `OVERDUE: post-hoc review of break-glass ${row.record.breakGlassId} (incident ${row.record.incidentId}) was due ${row.record.postHocReviewDueAt}`, ts: now }))
  ];
}
