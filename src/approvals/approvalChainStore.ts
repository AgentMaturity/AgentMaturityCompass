import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ActionClass, ExecutionMode } from "../types.js";
import { USER_ROLES, type UserRole } from "../auth/roles.js";

const riskTierSchema = z.enum(["low", "medium", "high", "critical"]);
const modeSchema = z.enum(["SIMULATE", "EXECUTE"]);
const actionClassSchema = z.enum([
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);
const roleSchema = z.enum(USER_ROLES);

const approvalRequestStatusSchema = z.enum(["PENDING", "QUORUM_MET", "DENIED", "EXPIRED", "CANCELLED", "CONSUMED"]);
const approvalDecisionKindSchema = z.enum(["APPROVE_EXECUTE", "APPROVE_SIMULATE", "DENY"]);

const signatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor")
});

export const approvalRequestSchema = z.object({
  v: z.literal(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  intentId: z.string().min(1),
  toolName: z.string().min(1),
  actionClass: actionClassSchema,
  workOrderId: z.string().min(1).nullable().optional(),
  requestedMode: modeSchema,
  effectiveMode: modeSchema,
  riskTier: riskTierSchema,
  createdTs: z.number().int(),
  expiresTs: z.number().int(),
  status: approvalRequestStatusSchema,
  requiredApprovals: z.number().int().min(0),
  requireDistinctUsers: z.boolean(),
  rolesAllowed: z.array(roleSchema),
  requiredAssurancePacks: z.record(z.string().min(1), z.object({
    minScore: z.number().min(0).max(100),
    maxSucceeded: z.number().int().min(0)
  })).optional(),
  boundHashes: z.object({
    intentHash: z.string().length(64),
    workOrderHash: z.string().length(64).nullable().optional(),
    policyHash: z.string().length(64),
    toolsHash: z.string().length(64),
    budgetsHash: z.string().length(64),
    leaseConstraintsHash: z.string().length(64)
  })
});

export const approvalDecisionSchema = z.object({
  v: z.literal(1),
  approvalDecisionId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  roles: z.array(roleSchema),
  decision: approvalDecisionKindSchema,
  reason: z.string().min(1),
  decisionTs: z.number().int()
});

export const approvalConsumedSchema = z.object({
  v: z.literal(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  consumedTs: z.number().int(),
  executionId: z.string().min(1).nullable().optional(),
  reason: z.string().min(1)
});

export type ApprovalRequestRecord = z.infer<typeof approvalRequestSchema>;
export type ApprovalDecisionRecord = z.infer<typeof approvalDecisionSchema>;
export type ApprovalConsumedRecord = z.infer<typeof approvalConsumedSchema>;
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;
export type ApprovalDecisionKind = z.infer<typeof approvalDecisionKindSchema>;

export interface ApprovalChainIntegrity {
  valid: boolean;
  reasonCodes: string[];
}

export interface ApprovalActivityInventory {
  valid: boolean;
  reasonCodes: string[];
  scannedRequests: number;
  trustedRequests: number;
  scannedDecisions: number;
  scannedConsumptions: number;
  requests: ApprovalRequestRecord[];
}

function approvalsRoot(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, resolveAgentId(workspace, agentId)).rootDir, "approvals");
}

function requestsDir(workspace: string, agentId?: string): string {
  return join(approvalsRoot(workspace, agentId), "requests");
}

function decisionsDir(workspace: string, agentId?: string): string {
  return join(approvalsRoot(workspace, agentId), "decisions");
}

function consumedDir(workspace: string, agentId?: string): string {
  return join(approvalsRoot(workspace, agentId), "consumed");
}

function requestPath(workspace: string, agentId: string, approvalRequestId: string): string {
  return join(requestsDir(workspace, agentId), `${approvalRequestId}.json`);
}

function decisionPath(workspace: string, agentId: string, decisionId: string): string {
  return join(decisionsDir(workspace, agentId), `${decisionId}.json`);
}

function consumedPath(workspace: string, agentId: string, approvalRequestId: string): string {
  return join(consumedDir(workspace, agentId), `${approvalRequestId}.json`);
}

function sigPathFor(path: string): string {
  return `${path}.sig`;
}

function signArtifact(workspace: string, path: string): string {
  const digest = sha256Hex(readFileSync(path));
  const sig = signatureSchema.parse({
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  });
  const sigPath = sigPathFor(path);
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return sigPath;
}

function verifyArtifact(workspace: string, path: string): { valid: boolean; reason?: string } {
  if (!pathExists(path)) {
    return { valid: false, reason: "file missing" };
  }
  const sigPath = sigPathFor(path);
  if (!pathExists(sigPath)) {
    return { valid: false, reason: "signature missing" };
  }
  try {
    const sig = signatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, reason: "digest mismatch" };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return valid ? { valid: true } : { valid: false, reason: "signature verification failed" };
  } catch (error) {
    return { valid: false, reason: String(error) };
  }
}

function ensureDirs(workspace: string, agentId?: string): void {
  ensureDir(requestsDir(workspace, agentId));
  ensureDir(decisionsDir(workspace, agentId));
  ensureDir(consumedDir(workspace, agentId));
}

export function createApprovalRequestRecord(input: {
  workspace: string;
  agentId?: string;
  intentId: string;
  toolName: string;
  actionClass: ActionClass;
  workOrderId?: string | null;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  riskTier: "low" | "medium" | "high" | "critical";
  requiredApprovals: number;
  requireDistinctUsers: boolean;
  rolesAllowed: UserRole[];
  ttlMinutes: number;
  requiredAssurancePacks?: Record<string, { minScore: number; maxSucceeded: number }>;
  boundHashes: {
    intentHash: string;
    workOrderHash?: string | null;
    policyHash: string;
    toolsHash: string;
    budgetsHash: string;
    leaseConstraintsHash: string;
  };
}): { request: ApprovalRequestRecord; path: string; sigPath: string } {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  ensureDirs(input.workspace, agentId);
  const request = approvalRequestSchema.parse({
    v: 1,
    approvalRequestId: `apprreq_${randomUUID().replace(/-/g, "")}`,
    agentId,
    intentId: input.intentId,
    toolName: input.toolName,
    actionClass: input.actionClass,
    workOrderId: input.workOrderId ?? null,
    requestedMode: input.requestedMode,
    effectiveMode: input.effectiveMode,
    riskTier: input.riskTier,
    createdTs: Date.now(),
    expiresTs: Date.now() + Math.max(1, input.ttlMinutes) * 60_000,
    status: "PENDING",
    requiredApprovals: input.requiredApprovals,
    requireDistinctUsers: input.requireDistinctUsers,
    rolesAllowed: input.rolesAllowed,
    requiredAssurancePacks: input.requiredAssurancePacks,
    boundHashes: {
      intentHash: input.boundHashes.intentHash,
      workOrderHash: input.boundHashes.workOrderHash ?? null,
      policyHash: input.boundHashes.policyHash,
      toolsHash: input.boundHashes.toolsHash,
      budgetsHash: input.boundHashes.budgetsHash,
      leaseConstraintsHash: input.boundHashes.leaseConstraintsHash
    }
  });
  const path = requestPath(input.workspace, agentId, request.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(request, null, 2), 0o644);
  const sigPath = signArtifact(input.workspace, path);
  return {
    request,
    path,
    sigPath
  };
}

export function loadApprovalRequestRecord(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  requireValidSignature?: boolean;
}): ApprovalRequestRecord {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const path = requestPath(params.workspace, agentId, params.approvalRequestId);
  if (!pathExists(path)) {
    throw new Error(`approval request not found: ${path}`);
  }
  if (params.requireValidSignature !== false) {
    const verification = verifyArtifact(params.workspace, path);
    if (!verification.valid) {
      throw new Error(`invalid approval request signature: ${verification.reason ?? "unknown"}`);
    }
  }
  return approvalRequestSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function updateApprovalRequestStatus(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  status: ApprovalRequestStatus;
}): ApprovalRequestRecord {
  const current = loadApprovalRequestRecord(params);
  const next = approvalRequestSchema.parse({
    ...current,
    status: params.status
  });
  const path = requestPath(params.workspace, current.agentId, current.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(next, null, 2), 0o644);
  signArtifact(params.workspace, path);
  return next;
}

export function recordApprovalDecision(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  userId: string;
  username: string;
  roles: UserRole[];
  decision: ApprovalDecisionKind;
  reason: string;
}): { decision: ApprovalDecisionRecord; path: string; sigPath: string } {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    requireValidSignature: true
  });
  const agentId = request.agentId;
  ensureDirs(params.workspace, agentId);
  const decision = approvalDecisionSchema.parse({
    v: 1,
    approvalDecisionId: `apprdec_${randomUUID().replace(/-/g, "")}`,
    approvalRequestId: request.approvalRequestId,
    agentId,
    userId: params.userId,
    username: params.username,
    roles: params.roles,
    decision: params.decision,
    reason: params.reason,
    decisionTs: Date.now()
  });
  const path = decisionPath(params.workspace, agentId, decision.approvalDecisionId);
  writeFileAtomic(path, JSON.stringify(decision, null, 2), 0o644);
  const sigPath = signArtifact(params.workspace, path);
  return {
    decision,
    path,
    sigPath
  };
}

export function listApprovalDecisions(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId?: string;
}): ApprovalDecisionRecord[] {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const dir = decisionsDir(params.workspace, agentId);
  if (!pathExists(dir)) {
    return [];
  }
  const out: ApprovalDecisionRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const path = join(dir, file);
    const verification = verifyArtifact(params.workspace, path);
    if (!verification.valid) {
      continue;
    }
    try {
      const row = approvalDecisionSchema.parse(JSON.parse(readUtf8(path)) as unknown);
      if (params.approvalRequestId && row.approvalRequestId !== params.approvalRequestId) {
        continue;
      }
      out.push(row);
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => a.decisionTs - b.decisionTs);
}

export function markApprovalConsumed(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
  executionId?: string | null;
  reason: string;
}): { consumed: ApprovalConsumedRecord; path: string; sigPath: string; replay: boolean } {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    requireValidSignature: true
  });
  const path = consumedPath(params.workspace, request.agentId, request.approvalRequestId);
  if (pathExists(path)) {
    const consumed = loadApprovalConsumed({
      workspace: params.workspace,
      agentId: request.agentId,
      approvalRequestId: request.approvalRequestId
    });
    if (!consumed) {
      throw new Error("approval consumption artifact missing");
    }
    return {
      consumed,
      path,
      sigPath: sigPathFor(path),
      replay: true
    };
  }
  const consumed = approvalConsumedSchema.parse({
    v: 1,
    approvalRequestId: request.approvalRequestId,
    agentId: request.agentId,
    consumedTs: Date.now(),
    executionId: params.executionId ?? null,
    reason: params.reason
  });
  ensureDirs(params.workspace, request.agentId);
  writeFileAtomic(path, JSON.stringify(consumed, null, 2), 0o644);
  const sigPath = signArtifact(params.workspace, path);
  updateApprovalRequestStatus({
    workspace: params.workspace,
    agentId: request.agentId,
    approvalRequestId: request.approvalRequestId,
    status: "CONSUMED"
  });
  return {
    consumed,
    path,
    sigPath,
    replay: false
  };
}

export function loadApprovalConsumed(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
}): ApprovalConsumedRecord | null {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const path = consumedPath(params.workspace, agentId, params.approvalRequestId);
  if (!pathExists(path)) {
    return null;
  }
  const verification = verifyArtifact(params.workspace, path);
  if (!verification.valid) {
    throw new Error(`invalid approval consumed signature: ${verification.reason ?? "unknown"}`);
  }
  const consumed = approvalConsumedSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  if (consumed.approvalRequestId !== params.approvalRequestId || consumed.agentId !== agentId) {
    throw new Error("invalid approval consumed binding");
  }
  return consumed;
}

export function listApprovalRequests(params: {
  workspace: string;
  agentId?: string;
}): ApprovalRequestRecord[] {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const dir = requestsDir(params.workspace, agentId);
  if (!pathExists(dir)) {
    return [];
  }
  const out: ApprovalRequestRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const path = join(dir, file);
    if (!verifyArtifact(params.workspace, path).valid) {
      continue;
    }
    try {
      out.push(approvalRequestSchema.parse(JSON.parse(readUtf8(path)) as unknown));
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.createdTs - a.createdTs);
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function jsonArtifacts(dir: string): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b));
}

function hasOrphanedSignatures(dir: string): boolean {
  if (!pathExists(dir)) {
    return false;
  }
  return readdirSync(dir).some((file) => {
    if (!file.endsWith(".json.sig")) {
      return false;
    }
    return !isRegularFile(join(dir, file.slice(0, -4)));
  });
}

/**
 * Audits every canonical approval artifact before a filtered activity view is
 * allowed to claim completeness. The returned reason codes are intentionally
 * path-free so callers can fail closed without exposing local identifiers.
 */
export function inspectApprovalActivityInventory(params: {
  workspace: string;
  agentId?: string;
}): ApprovalActivityInventory {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const reasonCodes: string[] = [];
  const requests: ApprovalRequestRecord[] = [];
  const requestIds = new Set<string>();

  const requestRoot = requestsDir(params.workspace, agentId);
  const requestFiles = jsonArtifacts(requestRoot);
  if (hasOrphanedSignatures(requestRoot)) {
    reasonCodes.push("REQUEST_ARTIFACT_MISSING");
  }
  for (const file of requestFiles) {
    const path = join(requestRoot, file);
    if (!isRegularFile(path) || !isRegularFile(sigPathFor(path)) || !verifyArtifact(params.workspace, path).valid) {
      reasonCodes.push("REQUEST_INTEGRITY_INVALID");
      continue;
    }
    let request: ApprovalRequestRecord;
    try {
      request = approvalRequestSchema.parse(JSON.parse(readUtf8(path)) as unknown);
    } catch {
      reasonCodes.push("REQUEST_ARTIFACT_UNPARSEABLE");
      continue;
    }
    const fileRequestId = file.slice(0, -5);
    if (request.approvalRequestId !== fileRequestId) {
      reasonCodes.push("REQUEST_BINDING_INVALID");
      continue;
    }
    if (request.agentId !== agentId) {
      reasonCodes.push("REQUEST_AGENT_INVALID");
      continue;
    }
    if (requestIds.has(request.approvalRequestId)) {
      reasonCodes.push("REQUEST_DUPLICATE");
      continue;
    }
    requestIds.add(request.approvalRequestId);
    requests.push(request);
  }

  const decisionRoot = decisionsDir(params.workspace, agentId);
  const decisionFiles = jsonArtifacts(decisionRoot);
  if (hasOrphanedSignatures(decisionRoot)) {
    reasonCodes.push("DECISION_ARTIFACT_MISSING");
  }
  const decisionIds = new Set<string>();
  for (const file of decisionFiles) {
    const path = join(decisionRoot, file);
    if (!isRegularFile(path) || !isRegularFile(sigPathFor(path)) || !verifyArtifact(params.workspace, path).valid) {
      reasonCodes.push("DECISION_INTEGRITY_INVALID");
      continue;
    }
    let decision: ApprovalDecisionRecord;
    try {
      decision = approvalDecisionSchema.parse(JSON.parse(readUtf8(path)) as unknown);
    } catch {
      reasonCodes.push("DECISION_ARTIFACT_UNPARSEABLE");
      continue;
    }
    const fileDecisionId = file.slice(0, -5);
    if (decision.approvalDecisionId !== fileDecisionId) {
      reasonCodes.push("DECISION_BINDING_INVALID");
      continue;
    }
    if (decision.agentId !== agentId) {
      reasonCodes.push("DECISION_AGENT_INVALID");
      continue;
    }
    if (!requestIds.has(decision.approvalRequestId)) {
      reasonCodes.push("DECISION_REQUEST_UNKNOWN");
      continue;
    }
    if (decisionIds.has(decision.approvalDecisionId)) {
      reasonCodes.push("DECISION_DUPLICATE");
      continue;
    }
    decisionIds.add(decision.approvalDecisionId);
  }

  const consumptionRoot = consumedDir(params.workspace, agentId);
  const consumptionFiles = jsonArtifacts(consumptionRoot);
  if (hasOrphanedSignatures(consumptionRoot)) {
    reasonCodes.push("CONSUMPTION_ARTIFACT_MISSING");
  }
  const consumedRequestIds = new Set<string>();
  for (const file of consumptionFiles) {
    const path = join(consumptionRoot, file);
    if (!isRegularFile(path) || !isRegularFile(sigPathFor(path)) || !verifyArtifact(params.workspace, path).valid) {
      reasonCodes.push("CONSUMPTION_INTEGRITY_INVALID");
      continue;
    }
    let consumed: ApprovalConsumedRecord;
    try {
      consumed = approvalConsumedSchema.parse(JSON.parse(readUtf8(path)) as unknown);
    } catch {
      reasonCodes.push("CONSUMPTION_ARTIFACT_UNPARSEABLE");
      continue;
    }
    const fileRequestId = file.slice(0, -5);
    if (consumed.approvalRequestId !== fileRequestId) {
      reasonCodes.push("CONSUMPTION_BINDING_INVALID");
      continue;
    }
    if (consumed.agentId !== agentId) {
      reasonCodes.push("CONSUMPTION_AGENT_INVALID");
      continue;
    }
    if (!requestIds.has(consumed.approvalRequestId)) {
      reasonCodes.push("CONSUMPTION_REQUEST_UNKNOWN");
      continue;
    }
    if (consumedRequestIds.has(consumed.approvalRequestId)) {
      reasonCodes.push("CONSUMPTION_DUPLICATE");
      continue;
    }
    consumedRequestIds.add(consumed.approvalRequestId);
  }

  const uniqueReasons = [...new Set(reasonCodes)].sort((a, b) => a.localeCompare(b));
  return {
    valid: uniqueReasons.length === 0,
    reasonCodes: uniqueReasons,
    scannedRequests: requestFiles.length,
    trustedRequests: requests.length,
    scannedDecisions: decisionFiles.length,
    scannedConsumptions: consumptionFiles.length,
    requests: requests.sort((a, b) => b.createdTs - a.createdTs || a.approvalRequestId.localeCompare(b.approvalRequestId))
  };
}

export function inspectApprovalChainIntegrity(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
}): ApprovalChainIntegrity {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const reasonCodes: string[] = [];
  const requestVerification = verifyArtifact(
    params.workspace,
    requestPath(params.workspace, agentId, params.approvalRequestId)
  );
  if (!requestVerification.valid) {
    reasonCodes.push("REQUEST_INTEGRITY_INVALID");
  }

  const decisionRoot = decisionsDir(params.workspace, agentId);
  if (pathExists(decisionRoot)) {
    for (const file of readdirSync(decisionRoot)) {
      if (!file.endsWith(".json")) continue;
      const path = join(decisionRoot, file);
      let decision: ApprovalDecisionRecord;
      try {
        decision = approvalDecisionSchema.parse(JSON.parse(readUtf8(path)) as unknown);
      } catch {
        reasonCodes.push("DECISION_ARTIFACT_UNPARSEABLE");
        continue;
      }
      if (decision.approvalRequestId !== params.approvalRequestId) continue;
      if (!verifyArtifact(params.workspace, path).valid) {
        reasonCodes.push("DECISION_INTEGRITY_INVALID");
      }
    }
  }

  const consumed = consumedPath(params.workspace, agentId, params.approvalRequestId);
  if (pathExists(consumed)) {
    if (!verifyArtifact(params.workspace, consumed).valid) {
      reasonCodes.push("CONSUMPTION_INTEGRITY_INVALID");
    } else {
      try {
        const record = approvalConsumedSchema.parse(JSON.parse(readUtf8(consumed)) as unknown);
        if (record.approvalRequestId !== params.approvalRequestId || record.agentId !== agentId) {
          reasonCodes.push("CONSUMPTION_BINDING_INVALID");
        }
      } catch {
        reasonCodes.push("CONSUMPTION_ARTIFACT_UNPARSEABLE");
      }
    }
  }

  const unique = [...new Set(reasonCodes)].sort((a, b) => a.localeCompare(b));
  return {
    valid: unique.length === 0,
    reasonCodes: unique
  };
}

export function cancelApprovalRequest(params: {
  workspace: string;
  agentId?: string;
  approvalRequestId: string;
}): ApprovalRequestRecord {
  const current = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    requireValidSignature: true
  });
  const effectiveStatus = current.status === "PENDING" && current.expiresTs <= Date.now()
    ? "EXPIRED"
    : current.status;
  if (effectiveStatus !== "PENDING") {
    throw new Error(`approval request is not pending: ${effectiveStatus}`);
  }
  return updateApprovalRequestStatus({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    status: "CANCELLED"
  });
}
