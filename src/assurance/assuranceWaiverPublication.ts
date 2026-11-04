import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { listApprovalDecisions, loadApprovalConsumed } from "../approvals/approvalChainStore.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority, type TransparencyAppendAttempt } from "../transparency/asyncWorkspaceAppend.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureTransparencyAppendPublication } from "../transparency/workspacePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { canonicalize } from "../utils/json.js";
import { captureOrgFiles, captureOrgPairs, captureOrgPairsAuthority, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { assuranceWaiversDir, saveAssuranceWaiver, prepareAssuranceWaiverAsync, listAssuranceWaivers } from "./assurancePolicyStore.js";
import { assuranceWaiverSchema, type AssuranceWaiver } from "./assuranceSchema.js";

export const pendingWaiverSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  reason: z.string().min(1),
  hours: z.number().int().min(1).max(72),
  policySha256: z.string().length(64),
  lastCertSha256: z.string().length(64),
  createdTs: z.number().int()
});

function pendingWaiversDir(workspace: string): string {
  return join(assuranceWaiversDir(workspace), "pending");
}

function pendingWaiverPath(workspace: string, approvalRequestId: string): string {
  return join(pendingWaiversDir(workspace), `${approvalRequestId}.json`);
}

export function savePendingWaiver(workspace: string, pending: z.infer<typeof pendingWaiverSchema>): string {
  ensureDir(pendingWaiversDir(workspace));
  const path = pendingWaiverPath(workspace, pending.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(pendingWaiverSchema.parse(pending), null, 2), 0o600);
  return path;
}

function removePendingWaiver(workspace: string, approvalRequestId: string): void {
  const path = pendingWaiverPath(workspace, approvalRequestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

export function listPendingWaivers(workspace: string): z.infer<typeof pendingWaiverSchema>[] {
  const dir = pendingWaiversDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => pendingWaiverSchema.parse(JSON.parse(readUtf8(join(dir, name))) as unknown));
}

function activateApprovedWaiver(workspace: string, pending: z.infer<typeof pendingWaiverSchema>, nowTs = Date.now()): AssuranceWaiver | null {
  const approval = verifyApprovalForExecution({
    workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "assurance.waiver",
    expectedActionClass: "SECURITY"
  });
  if (!approval.ok) {
    return null;
  }

  const decisions = listApprovalDecisions({
    workspace,
    agentId: pending.agentId,
    approvalRequestId: pending.approvalRequestId
  }).filter((row) => row.decision === "APPROVE_EXECUTE" || row.decision === "APPROVE_SIMULATE");

  const ownerDecision = decisions.find((row) => row.roles.includes("OWNER"));
  const auditorDecision = decisions.find((row) => row.roles.includes("AUDITOR"));
  if (!ownerDecision || !auditorDecision) {
    return null;
  }

  const waiver = assuranceWaiverSchema.parse({
    v: 1,
    waiverId: `wvr_${randomUUID().replace(/-/g, "")}`,
    createdTs: nowTs,
    expiresTs: nowTs + pending.hours * 60 * 60 * 1000,
    reason: pending.reason,
    scope: {
      type: "WORKSPACE",
      id: "workspace"
    },
    allowReadyDespiteAssuranceFail: true,
    approvedBy: [
      {
        userIdHash: sha256Hex(ownerDecision.userId).slice(0, 16),
        role: "OWNER",
        approvalEventHash: sha256Hex(ownerDecision.approvalDecisionId)
      },
      {
        userIdHash: sha256Hex(auditorDecision.userId).slice(0, 16),
        role: "AUDITOR",
        approvalEventHash: sha256Hex(auditorDecision.approvalDecisionId)
      }
    ],
    bindings: {
      lastCertSha256: pending.lastCertSha256,
      policySha256: pending.policySha256
    }
  });

  saveAssuranceWaiver(workspace, waiver);
  consumeApprovedExecution({
    workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  removePendingWaiver(workspace, pending.approvalRequestId);
  appendTransparencyEntry({
    workspace,
    type: "ASSURANCE_WAIVER_ACTIVE",
    agentId: "workspace",
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(JSON.stringify(waiver), "utf8")),
      id: waiver.waiverId
    }
  });
  return waiver;
}

export function maybeActivatePendingWaivers(workspace: string): AssuranceWaiver[] {
  const activated: AssuranceWaiver[] = [];
  for (const pending of listPendingWaivers(workspace)) {
    const waiver = activateApprovedWaiver(workspace, pending);
    if (waiver) {
      activated.push(waiver);
    }
  }
  return activated;
}

interface WaiverEffects { consumeAttempted: boolean; consumeReturned: boolean; consumeAcknowledged: boolean; removeAttempted: boolean; removeReturned: boolean; removeAcknowledged: boolean }
const noWaiverEffects = (): WaiverEffects => ({ consumeAttempted: false, consumeReturned: false, consumeAcknowledged: false, removeAttempted: false, removeReturned: false, removeAcknowledged: false });
class AssuranceWaiverPublicationError extends Error {
  readonly code = "ASSURANCE_WAIVER_INCOMPLETE";
  constructor(readonly waiverId: string, readonly completedStages: readonly string[], readonly attemptedStage: string,
    readonly consumption: unknown, readonly transparency: unknown, readonly effects: Readonly<WaiverEffects>, cause: unknown) {
    super("assurance waiver did not complete; published waiver and approval-consumption effects may remain", { cause }); this.name = "AssuranceWaiverPublicationError";
  }
}
function approvalSelection(workspace: string, pending: z.infer<typeof pendingWaiverSchema>) {
  const approval = verifyApprovalForExecution({ workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId, expectedToolName: "assurance.waiver", expectedActionClass: "SECURITY" });
  const decisions = listApprovalDecisions({ workspace, agentId: pending.agentId, approvalRequestId: pending.approvalRequestId })
    .filter(row => row.decision === "APPROVE_EXECUTE" || row.decision === "APPROVE_SIMULATE");
  return { approval, ownerDecision: decisions.find(row => row.roles.includes("OWNER")), auditorDecision: decisions.find(row => row.roles.includes("AUDITOR")) };
}
function selectedWaiver(pending: z.infer<typeof pendingWaiverSchema>, ownerDecision: NonNullable<ReturnType<typeof approvalSelection>["ownerDecision"]>,
  auditorDecision: NonNullable<ReturnType<typeof approvalSelection>["auditorDecision"]>, nowTs: number) {
  return assuranceWaiverSchema.parse({
    v: 1,
    waiverId: `wvr_${randomUUID().replace(/-/g, "")}`,
    createdTs: nowTs,
    expiresTs: nowTs + pending.hours * 60 * 60 * 1000,
    reason: pending.reason,
    scope: {
      type: "WORKSPACE",
      id: "workspace"
    },
    allowReadyDespiteAssuranceFail: true,
    approvedBy: [
      {
        userIdHash: sha256Hex(ownerDecision.userId).slice(0, 16),
        role: "OWNER",
        approvalEventHash: sha256Hex(ownerDecision.approvalDecisionId)
      },
      {
        userIdHash: sha256Hex(auditorDecision.userId).slice(0, 16),
        role: "AUDITOR",
        approvalEventHash: sha256Hex(auditorDecision.approvalDecisionId)
      }
    ],
    bindings: {
      lastCertSha256: pending.lastCertSha256,
      policySha256: pending.policySha256
    }
  });
}
function captureApprovedWaiver(workspace: string, pending: z.infer<typeof pendingWaiverSchema>, options: OrgPairsOptions) {
  const actor = options.beforePublish; actor?.();
  const pendingPath = pendingWaiverPath(workspace, pending.approvalRequestId), pendingState = captureOrgFiles([pendingPath]);
  const bytes = orgPairBytes(pendingState, pendingPath);
  if (bytes === null || canonicalize(pendingWaiverSchema.parse(JSON.parse(bytes.toString("utf8")))) !== canonicalize(pending))
    throw new Error("selected pending waiver changed before its signing attempt");
  const selected = approvalSelection(workspace, pending);
  if (!selected.approval.ok || !selected.ownerDecision || !selected.auditorDecision) return null;
  const waiver = selectedWaiver(pending, selected.ownerDecision, selected.auditorDecision, Date.now());
  const path = join(assuranceWaiversDir(workspace), `waiver_${waiver.createdTs}.json`), target = captureOrgPairs([path]);
  const fixed = captureOrgPairsAuthority(workspace, actor), log = captureWorkspaceLogAuthority(workspace);
  const binding = canonicalize({ owner: selected.ownerDecision, auditor: selected.auditorDecision });
  const originalApproval = structuredClone(selected.approval.approval!);
  let consumed: ReturnType<typeof consumeApprovedExecution> | null = null, removed = false;
  const assertCurrent = () => {
    actor?.();
    if (!removed) assertOrgPairsCurrent(pendingState);
    else if (orgPairBytes(captureOrgFiles([pendingPath]), pendingPath) !== null) throw new Error("removed pending waiver reappeared");
    const next = approvalSelection(workspace, pending), expected = consumed === null ? originalApproval : { ...originalApproval, status: "CONSUMED" };
    if (canonicalize(next.approval.approval) !== canonicalize(expected) || binding !== canonicalize({ owner: next.ownerDecision, auditor: next.auditorDecision }))
      throw new Error("selected assurance waiver approval or OWNER/AUDITOR decisions changed");
    if (consumed === null ? !next.approval.ok : next.approval.status !== "CONSUMED") throw new Error("selected assurance waiver approval status is refused");
    if (consumed !== null) {
      const record = loadApprovalConsumed({ workspace, agentId: pending.agentId, approvalRequestId: pending.approvalRequestId });
      if (record === null || record.executionId !== pending.requestId || record.consumedTs !== consumed.consumedTs
        || record.reason !== "approved execution completed") throw new Error("acknowledged assurance waiver consumption changed");
    }
    fixed(); log.assertCurrent();
  };
  assertCurrent();
  return { path, approvalRequestId: pending.approvalRequestId, async publish(predecessorCurrent: () => void) {
    const completed: string[] = [], effects = noWaiverEffects(); let stage = "waiver-pair", transparency: unknown = null;
    const assertPreparing = () => { assertCurrent(); predecessorCurrent(); };
    try {
      const prepared = await prepareAssuranceWaiverAsync(workspace, waiver,
        { beforePublish: assertCurrent, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(target); assertPreparing(); } }, target);
      prepared.publish(); completed.push("waiver-pair");
      stage = "approval-consume"; prepared.assertCurrent(); predecessorCurrent();
      effects.consumeAttempted = true;
      consumed = consumeApprovedExecution({ workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, executionId: pending.requestId });
      effects.consumeReturned = true; completed.push("approval-consume-returned");
      if (!consumed.consumed || consumed.replay || consumed.consumedTs === undefined) throw new Error("assurance waiver approval consumption returned a replay or no acknowledgement");
      prepared.assertCurrent(); effects.consumeAcknowledged = true; completed.push("approval-consume-acknowledged");
      stage = "pending-remove"; prepared.assertCurrent(); predecessorCurrent();
      effects.removeAttempted = true; rmSync(pendingPath, { force: true }); effects.removeReturned = true; removed = true; completed.push("pending-remove-returned");
      prepared.assertCurrent(); effects.removeAcknowledged = true; completed.push("pending-remove-acknowledged"); stage = "transparency";
      const logged = await appendTransparencyEntryAttemptAsync({ workspace, type: "ASSURANCE_WAIVER_ACTIVE", agentId: "workspace",
        artifact: { kind: "approval", sha256: sha256Hex(Buffer.from(JSON.stringify(waiver), "utf8")), id: waiver.waiverId } },
        { beforeCommit: () => { prepared.assertCurrent(); predecessorCurrent(); }, beforeMember: prepared.assertCurrent });
      transparency = logged.entry; completed.push("transparency"); stage = "return"; prepared.assertCurrent(); logged.assertCurrent(); return { waiver, logged, assertCurrent: prepared.assertCurrent };
    } catch (cause) { throw new AssuranceWaiverPublicationError(waiver.waiverId, Object.freeze([...completed]), stage, consumed, transparency, Object.freeze({ ...effects }), cause); }
  } };
}
/** Only the selected pending records are retained; unrelated new pending requests are not an inventory CAS. */
export async function maybeActivatePendingWaiversAsync(workspace: string, options: OrgPairsOptions = {}) {
  options = { ...options }; options.beforePublish?.();
  const candidates = listPendingWaivers(workspace).map(pending => captureApprovedWaiver(workspace, pending, options)).filter(plan => plan !== null);
  const selectedPaths = new Set<string>(), deferredTimestampCollisions: string[] = [];
  const plans = candidates.filter(plan => { if (selectedPaths.has(plan.path)) { deferredTimestampCollisions.push(plan.approvalRequestId); return false; } selectedPaths.add(plan.path); return true; });
  const activated: AssuranceWaiver[] = [], own: (() => void)[] = [];
  const originalLog = plans.length > 0 ? captureTransparencyAppendPublication(workspace) : null;
  let previousLog: TransparencyAppendAttempt | null = null;
  for (const plan of plans) {
    const selectedPredecessor = previousLog, predecessorCurrent = () => { if (selectedPredecessor === null) originalLog!.assertCurrent(); else selectedPredecessor.assertCurrent(); };
    try { const result = await plan.publish(predecessorCurrent); activated.push(result.waiver); own.push(result.assertCurrent); previousLog = result.logged; }
    catch (cause) { throw new AssuranceWaiverActivationBatchError(Object.freeze(structuredClone(activated)), cause); }
  }
  const assertCurrent = () => { options.beforePublish?.(); for (const current of own) current(); previousLog?.assertCurrent(); };
  try { assertCurrent(); return Object.freeze({ activated, deferredTimestampCollisions: Object.freeze([...deferredTimestampCollisions]), assertCurrent }); }
  catch (cause) { throw new AssuranceWaiverActivationBatchError(Object.freeze(structuredClone(activated)), cause); }
}
function captureSelectedWaiver(workspace: string, waiver: AssuranceWaiver) {
  const path = join(assuranceWaiversDir(workspace), `waiver_${waiver.createdTs}.json`), selected = captureOrgPairs([path]);
  const bytes = orgPairBytes(selected, path), sidecar = orgPairBytes(selected, `${path}.sig`);
  if (bytes === null || sidecar === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, sidecar).valid
    || canonicalize(assuranceWaiverSchema.parse(JSON.parse(bytes.toString("utf8")))) !== canonicalize(waiver)) throw new Error("selected waiver changed before revocation");
  return { path, selected };
}
class AssuranceWaiverActivationBatchError extends Error {
  readonly code = "ASSURANCE_WAIVER_BATCH_INCOMPLETE";
  constructor(readonly activated: readonly AssuranceWaiver[], cause: unknown) {
    super("pending waiver activation stopped; earlier activated waivers remain", { cause }); this.name = "AssuranceWaiverActivationBatchError";
  }
}
export async function revokeAssuranceWaiverAsync(input: { workspace: string; waiverId?: string }, options: OrgPairsOptions = {}) {
  const params = { ...input }, actor = options.beforePublish; actor?.();
  const waivers = listAssuranceWaivers(params.workspace), nowTs = Date.now();
  const waiver = params.waiverId ? waivers.find(row => row.waiverId === params.waiverId) ?? null
    : waivers.find(row => row.allowReadyDespiteAssuranceFail && row.expiresTs > nowTs) ?? null;
  if (waiver === null) return { revoked: false as const, reason: "waiver not found" };
  const { path, selected } = captureSelectedWaiver(params.workspace, waiver);
  const log = captureWorkspaceLogAuthority(params.workspace, actor), predecessor = captureTransparencyAppendPublication(params.workspace);
  let removed = false, stage = "remove", transparency: unknown = null; const completed: string[] = [], effects = noWaiverEffects();
  const assertCurrent = () => { actor?.(); if (!removed) assertOrgPairsCurrent(selected);
    else { if (orgPairBytes(captureOrgFiles([path]), path) !== null) throw new Error("revoked waiver body reappeared");
      assertOrgPairsCurrent({ members: selected.members.filter(row => row.path !== path) }); }
    log.assertCurrent(); };
  try {
    withControlFileLock({ root: join(params.workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
      assertCurrent(); predecessor.assertCurrent(); effects.removeAttempted = true; rmSync(path, { force: true }); effects.removeReturned = true; removed = true;
      completed.push("remove-returned"); assertCurrent(); effects.removeAcknowledged = true; completed.push("remove-acknowledged");
    } });
    stage = "transparency";
    const logged = await appendTransparencyEntryAttemptAsync({ workspace: params.workspace, type: "ASSURANCE_WAIVER_REVOKED", agentId: "workspace",
      artifact: { kind: "approval", sha256: sha256Hex(Buffer.from(waiver.waiverId, "utf8")), id: waiver.waiverId } },
      { beforeCommit: () => { assertCurrent(); predecessor.assertCurrent(); }, beforeMember: assertCurrent });
    transparency = logged.entry; completed.push("transparency"); stage = "return"; assertCurrent(); logged.assertCurrent(); return { revoked: true as const, waiverId: waiver.waiverId };
  } catch (cause) { throw new AssuranceWaiverPublicationError(waiver.waiverId, Object.freeze([...completed]), stage, null, transparency, Object.freeze({ ...effects }), cause); }
}

export function revokeAssuranceWaiver(params: {
  workspace: string;
  waiverId?: string;
}) {
  const waivers = listAssuranceWaivers(params.workspace);
  const waiver = params.waiverId
    ? waivers.find((row) => row.waiverId === params.waiverId) ?? null
    : waivers.find(row => row.allowReadyDespiteAssuranceFail && row.expiresTs > Date.now()) ?? null;
  if (!waiver) {
    return {
      revoked: false,
      reason: "waiver not found"
    };
  }
  const { path, selected } = captureSelectedWaiver(params.workspace, waiver);
  withControlFileLock({ root: join(params.workspace, ".amc"), name: "org-auditor-pairs", operation: () => {
    assertOrgPairsCurrent(selected); if (pathExists(path)) rmSync(path, { force: true });
  } });
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ASSURANCE_WAIVER_REVOKED",
    agentId: "workspace",
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(waiver.waiverId, "utf8")),
      id: waiver.waiverId
    }
  });
  return {
    revoked: true,
    waiverId: waiver.waiverId
  };
}

