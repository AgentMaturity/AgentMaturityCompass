import { randomUUID } from "node:crypto";
import { linkSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { ActionClass, ExecutionMode } from "../types.js";
import type { UserRole } from "../auth/roles.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { signatureSchema, approvalRequestSchema, approvalDecisionSchema, approvalConsumedSchema } from "./approvalSchemas.js";
import { inCheckPass, readFileInPass } from "../utils/checkPass.js";
export { approvalRequestSchema, approvalDecisionSchema, approvalConsumedSchema } from "./approvalSchemas.js";
import type { ApprovalRequestRecord, ApprovalDecisionRecord, ApprovalConsumedRecord, ApprovalRequestStatus, ApprovalDecisionKind } from "./approvalSchemas.js";
export type { ApprovalRequestRecord, ApprovalDecisionRecord, ApprovalConsumedRecord, ApprovalRequestStatus, ApprovalDecisionKind } from "./approvalSchemas.js";

/**
 * Status evolves; every other request field is part of the reviewed authority, except `initiator` (P1-78): it is kept out
 * so every record digests the same under every AMC version, including verifiers that predate it (a4Verify recomputes this
 * offline). The request file's signature still covers it.
 */
export function approvalRequestBindingDigest(request: ApprovalRequestRecord): string {
  return sha256Hex(canonicalize({ ...request, status: "PENDING", initiator: undefined }));
}

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

/** Fixed consumption paths; this projection supplies names, never positive authority or acknowledgment. */
export function approvalConsumptionPaths(params: { workspace: string; agentId: string; approvalRequestId: string }) {
  const agentId = resolveAgentId(params.workspace, params.agentId), root = approvalsRoot(params.workspace, agentId);
  return Object.freeze({ agentId, root, requests: requestsDir(params.workspace, agentId), decisions: decisionsDir(params.workspace, agentId),
    consumed: consumedDir(params.workspace, agentId), request: requestPath(params.workspace, agentId, params.approvalRequestId),
    consumption: consumedPath(params.workspace, agentId, params.approvalRequestId) });
}

function signArtifact(workspace: string, path: string): string {
  const digest = sha256Hex(readFileSync(path));
  const sig = signatureSchema.parse({
    digestSha256: digest,
    signature: signHexDigest(digest, getSigningKey(workspace, "artifact-seal")),
    signedTs: Date.now(),
    signer: "auditor"
  });
  const sigPath = sigPathFor(path);
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return sigPath;
}

/** Pass the bytes the caller will parse, so what is verified is what is read (no verify-then-reread). */
function verifyArtifact(workspace: string, path: string, bytes?: Buffer): { valid: boolean; reason?: string } {
  if (!pathExists(path)) {
    return { valid: false, reason: "file missing" };
  }
  const sigPath = sigPathFor(path);
  if (!pathExists(sigPath)) {
    return { valid: false, reason: "signature missing" };
  }
  try {
    const sidecar = readFileInPass(sigPath);
    return verifyArtifactBytes(workspace, bytes ?? readFileInPass(path), sidecar);
  } catch (error) {
    return { valid: false, reason: String(error) };
  }
}
/** The signature check over bytes just read; within one check pass the same bytes are verified once. */
const verifyArtifactBytes = inCheckPass((workspace: string, body: Buffer, sidecar: Buffer): { valid: boolean; reason?: string } => {
  const sig = signatureSchema.parse(JSON.parse(sidecar.toString("utf8")) as unknown);
  const digest = sha256Hex(body);
  if (digest !== sig.digestSha256) {
    return { valid: false, reason: "digest mismatch" };
  }
  const valid = sig.envelope === undefined
    ? verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"))
    : sig.envelope.signer.type === "VAULT" && sig.signature === sig.envelope.sigB64
      && verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar).valid;
  return valid ? { valid: true } : { valid: false, reason: "signature verification failed" };
});

/**
 * Publish complete bytes at `path` only if nothing is there; false when something already was.
 * ponytail: hard links only; fall back to openSync(path, "wx") when a filesystem without them shows up.
 */
function publishExclusive(path: string, bytes: string): boolean {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, bytes, { mode: 0o644 });
  try {
    linkSync(tmp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
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
  authorizationIntent?: Record<string, unknown>;
  initiator?: string;
}): { request: ApprovalRequestRecord; path: string; sigPath: string } {
  const { request, path } = prepareApprovalRequestRecord(input);
  writeFileAtomic(path, JSON.stringify(request, null, 2), 0o644);
  const sigPath = signArtifact(input.workspace, path);
  return {
    request,
    path,
    sigPath
  };
}

export type ApprovalRequestRecordInput = Parameters<typeof createApprovalRequestRecord>[0];

/** Shared native directory prefix and actual UUID/two-clock payload recipe; no signing or member write. */
export function prepareApprovalRequestRecord(input: ApprovalRequestRecordInput, directories?: (phase: "attempted" | "returned") => void) {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  directories?.("attempted");
  ensureDirs(input.workspace, agentId);
  directories?.("returned");
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
    },
    ...(input.authorizationIntent === undefined ? {} : { authorizationIntent: input.authorizationIntent }),
    ...(input.initiator === undefined ? {} : { initiator: input.initiator })
  });
  const path = requestPath(input.workspace, agentId, request.approvalRequestId);
  return { request, path };
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
  const bytes = readFileInPass(path);
  if (params.requireValidSignature !== false) {
    const verification = verifyArtifact(params.workspace, path, bytes);
    if (!verification.valid) {
      throw new Error(`invalid approval request signature: ${verification.reason ?? "unknown"}`);
    }
  }
  return approvalRequestSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
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
  expectedRequestDigestSha256?: string;
}): { decision: ApprovalDecisionRecord; path: string; sigPath: string } {
  const request = loadApprovalRequestRecord({
    workspace: params.workspace,
    agentId: params.agentId,
    approvalRequestId: params.approvalRequestId,
    requireValidSignature: true
  });
  const agentId = request.agentId;
  if (params.expectedRequestDigestSha256 !== undefined &&
    (request.status !== "PENDING" || params.expectedRequestDigestSha256 !== approvalRequestBindingDigest(request))) {
    throw new Error("approval request changed after review; no bound decision recorded");
  }
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
    ...(params.expectedRequestDigestSha256 === undefined ? {} : { requestDigestSha256: params.expectedRequestDigestSha256 }),
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
      const row = approvalDecisionSchema.parse(JSON.parse(readFileInPass(path).toString("utf8")) as unknown);
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
  const consumed = approvalConsumedSchema.parse({
    v: 1,
    approvalRequestId: request.approvalRequestId,
    agentId: request.agentId,
    consumedTs: Date.now(),
    executionId: params.executionId ?? null,
    reason: params.reason
  });
  ensureDirs(params.workspace, request.agentId);
  // Exclusive create, so two processes cannot both consume: the loser sees the winner's file and is a replay.
  // A reader that lands between the link and the signature fails closed on the missing signature.
  if (!publishExclusive(path, JSON.stringify(consumed, null, 2))) {
    const prior = loadApprovalConsumed({ workspace: params.workspace, agentId: request.agentId, approvalRequestId: request.approvalRequestId });
    if (!prior) throw new Error("approval consumption artifact missing");
    return { consumed: prior, path, sigPath: sigPathFor(path), replay: true };
  }
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
  const bytes = readFileInPass(path);
  const verification = verifyArtifact(params.workspace, path, bytes);
  if (!verification.valid) {
    throw new Error(`invalid approval consumed signature: ${verification.reason ?? "unknown"}`);
  }
  const consumed = approvalConsumedSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
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
    // One read: the bytes verified are the bytes parsed (P1-78; this list feeds quorum decisions).
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      continue;
    }
    if (!verifyArtifact(params.workspace, path, bytes).valid) {
      continue;
    }
    try {
      out.push(approvalRequestSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown));
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

export const inspectApprovalChainIntegrity = inCheckPass(function inspectApprovalChainIntegrity(params: {
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
  let requestBinding: string | null = null;
  try {
    const request = loadApprovalRequestRecord({ ...params, agentId, requireValidSignature: true });
    if (request.approvalRequestId !== params.approvalRequestId || request.agentId !== agentId) reasonCodes.push("REQUEST_BINDING_INVALID");
    else requestBinding = approvalRequestBindingDigest(request);
  } catch { reasonCodes.push("REQUEST_INTEGRITY_INVALID"); }

  const decisionRoot = decisionsDir(params.workspace, agentId);
  if (pathExists(decisionRoot)) {
    for (const file of readdirSync(decisionRoot)) {
      if (!file.endsWith(".json")) continue;
      const path = join(decisionRoot, file);
      let decision: ApprovalDecisionRecord;
      try {
        decision = approvalDecisionSchema.parse(JSON.parse(readFileInPass(path).toString("utf8")) as unknown);
      } catch {
        reasonCodes.push("DECISION_ARTIFACT_UNPARSEABLE");
        continue;
      }
      if (decision.approvalRequestId !== params.approvalRequestId) continue;
      if (decision.requestDigestSha256 !== undefined && decision.requestDigestSha256 !== requestBinding) reasonCodes.push("DECISION_REQUEST_BINDING_INVALID");
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
        const record = approvalConsumedSchema.parse(JSON.parse(readFileInPass(consumed).toString("utf8")) as unknown);
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
});

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
