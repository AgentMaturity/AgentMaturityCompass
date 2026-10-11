import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import type { ActionClass, ExecutionMode } from "../types.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  approvalConsumedSchema,
  approvalSchema,
  type ApprovalArtifact,
  type ApprovalConsumedRecord,
  type ApprovalDecision,
  type ApprovalStatus
} from "./approvalSchema.js";

interface SignaturePayload {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export interface ApprovalCreateInput {
  workspace: string;
  agentId?: string;
  intentId: string;
  toolName: string;
  actionClass: ActionClass;
  workOrderId?: string | null;
  requestedMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  riskTier: "low" | "medium" | "high" | "critical";
  expiresTs?: number;
  boundHashes: {
    intentHash: string;
    workOrderHash?: string | null;
    policyHash: string;
    toolsHash: string;
  };
}

export interface ApprovalDecisionInput {
  workspace: string;
  agentId?: string;
  approvalId: string;
  decision: ApprovalDecision;
  effectiveMode: ExecutionMode;
  reason: string;
  expiresTs?: number;
  decisionReceiptId?: string | null;
}

function approvalsDir(workspace: string, agentId?: string): string {
  const resolved = resolveAgentId(workspace, agentId);
  return join(getAgentPaths(workspace, resolved).rootDir, "approvals");
}

function approvalPath(workspace: string, agentId: string, approvalId: string): string {
  return join(approvalsDir(workspace, agentId), `${approvalId}.json`);
}

function approvalSigPath(file: string): string {
  return `${file}.sig`;
}

function approvalConsumedPath(workspace: string, agentId: string, approvalId: string): string {
  return join(approvalsDir(workspace, agentId), `${approvalId}.consumed.json`);
}

function signFile(workspace: string, file: string): string {
  const digest = sha256Hex(readFileSync(file));
  const signature = signHexDigest(digest, getSigningKey(workspace, "artifact-seal"));
  const payload: SignaturePayload = {
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sig = approvalSigPath(file);
  writeFileAtomic(sig, JSON.stringify(payload, null, 2), 0o644);
  return sig;
}

function verifyFileSignature(workspace: string, file: string): { valid: boolean; reason: string | null; signatureExists: boolean } {
  const sig = approvalSigPath(file);
  if (!pathExists(file)) {
    return { valid: false, reason: "file missing", signatureExists: false };
  }
  if (!pathExists(sig)) {
    return { valid: false, reason: "signature missing", signatureExists: false };
  }
  try {
    const parsed = JSON.parse(readUtf8(sig)) as SignaturePayload;
    const digest = sha256Hex(readFileSync(file));
    if (digest !== parsed.digestSha256) {
      return { valid: false, reason: "digest mismatch", signatureExists: true };
    }
    const valid = verifyHexDigestAny(digest, parsed.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      reason: valid ? null : "signature verification failed",
      signatureExists: true
    };
  } catch (error) {
    return {
      valid: false,
      reason: String(error),
      signatureExists: true
    };
  }
}

export function approvalDigest(approval: ApprovalArtifact): string {
  return sha256Hex(canonicalize(approval));
}

function statusFromArtifact(workspace: string, approval: ApprovalArtifact): ApprovalStatus {
  const consumed = approvalConsumedPath(workspace, approval.agentId, approval.approvalId);
  if (pathExists(consumed)) {
    return "CONSUMED";
  }
  if (Date.now() > approval.expiresTs) {
    return "EXPIRED";
  }
  if (approval.status === "DENIED") {
    return "DENIED";
  }
  if (approval.status === "APPROVED") {
    return "APPROVED";
  }
  return "PENDING";
}

export function createApprovalRequest(input: ApprovalCreateInput): {
  approval: ApprovalArtifact;
  filePath: string;
  sigPath: string;
} {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const dir = approvalsDir(input.workspace, agentId);
  ensureDir(dir);
  const approval = approvalSchema.parse({
    v: 1,
    approvalId: `appr_${randomUUID().replace(/-/g, "")}`,
    agentId,
    intentId: input.intentId,
    toolName: input.toolName,
    actionClass: input.actionClass,
    workOrderId: input.workOrderId ?? null,
    requestedMode: input.requestedMode,
    effectiveMode: input.effectiveMode,
    riskTier: input.riskTier,
    createdTs: Date.now(),
    expiresTs: input.expiresTs ?? Date.now() + 15 * 60_000,
    status: "PENDING",
    decision: null,
    decisionTs: null,
    decisionBy: null,
    decisionReceiptId: null,
    reason: null,
    boundHashes: {
      intentHash: input.boundHashes.intentHash,
      workOrderHash: input.boundHashes.workOrderHash ?? null,
      policyHash: input.boundHashes.policyHash,
      toolsHash: input.boundHashes.toolsHash
    }
  });
  const filePath = approvalPath(input.workspace, agentId, approval.approvalId);
  writeFileAtomic(filePath, JSON.stringify(approval, null, 2), 0o644);
  const sigPath = signFile(input.workspace, filePath);
  return { approval, filePath, sigPath };
}

export function verifyApprovalSignature(params: {
  workspace: string;
  agentId?: string;
  approvalId: string;
}): { valid: boolean; reason: string | null; signatureExists: boolean; filePath: string; sigPath: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const filePath = approvalPath(params.workspace, agentId, params.approvalId);
  const verification = verifyFileSignature(params.workspace, filePath);
  return {
    ...verification,
    filePath,
    sigPath: approvalSigPath(filePath)
  };
}

export function loadApproval(params: {
  workspace: string;
  agentId?: string;
  approvalId: string;
  requireValidSignature?: boolean;
}): ApprovalArtifact {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const filePath = approvalPath(params.workspace, agentId, params.approvalId);
  if (!pathExists(filePath)) {
    throw new Error(`Approval not found: ${filePath}`);
  }
  if (params.requireValidSignature !== false) {
    const verification = verifyFileSignature(params.workspace, filePath);
    if (!verification.valid) {
      throw new Error(`Invalid approval signature: ${verification.reason ?? "unknown reason"}`);
    }
  }
  return approvalSchema.parse(JSON.parse(readUtf8(filePath)) as unknown);
}

export function listApprovals(params: {
  workspace: string;
  agentId?: string;
  status?: ApprovalStatus;
}): Array<{ approval: ApprovalArtifact; status: ApprovalStatus; signatureValid: boolean }> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const dir = approvalsDir(params.workspace, agentId);
  if (!pathExists(dir)) {
    return [];
  }
  const out: Array<{ approval: ApprovalArtifact; status: ApprovalStatus; signatureValid: boolean }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file.endsWith(".consumed.json")) {
      continue;
    }
    const full = join(dir, file);
    try {
      const approval = approvalSchema.parse(JSON.parse(readUtf8(full)) as unknown);
      const valid = verifyFileSignature(params.workspace, full).valid;
      const status = statusFromArtifact(params.workspace, approval);
      if (params.status && params.status !== status) {
        continue;
      }
      out.push({
        approval,
        status,
        signatureValid: valid
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.approval.createdTs - a.approval.createdTs);
}

export function decideApproval(input: ApprovalDecisionInput): {
  approval: ApprovalArtifact;
  filePath: string;
  sigPath: string;
} {
  const current = loadApproval({
    workspace: input.workspace,
    agentId: input.agentId,
    approvalId: input.approvalId,
    requireValidSignature: true
  });
  const status = statusFromArtifact(input.workspace, current);
  if (status !== "PENDING") {
    throw new Error(`Approval ${current.approvalId} is not pending (current: ${status})`);
  }
  const next = approvalSchema.parse({
    ...current,
    status: input.decision === "APPROVED" ? "APPROVED" : "DENIED",
    decision: input.decision,
    decisionBy: "owner",
    decisionTs: Date.now(),
    decisionReceiptId: input.decisionReceiptId ?? null,
    reason: input.reason,
    effectiveMode: input.decision === "APPROVED" ? input.effectiveMode : "SIMULATE",
    expiresTs: input.expiresTs ?? current.expiresTs
  });
  const filePath = approvalPath(input.workspace, current.agentId, current.approvalId);
  writeFileAtomic(filePath, JSON.stringify(next, null, 2), 0o644);
  const sigPath = signFile(input.workspace, filePath);
  return {
    approval: next,
    filePath,
    sigPath
  };
}

export function consumeApproval(params: {
  workspace: string;
  approval: ApprovalArtifact;
  executionId?: string | null;
  reason: string;
}): {
  consumed: ApprovalConsumedRecord;
  filePath: string;
  sigPath: string;
} {
  const consumedFile = approvalConsumedPath(params.workspace, params.approval.agentId, params.approval.approvalId);
  if (pathExists(consumedFile)) {
    throw new Error(`Approval replay detected for ${params.approval.approvalId}`);
  }
  const consumed = approvalConsumedSchema.parse({
    v: 1,
    approvalId: params.approval.approvalId,
    agentId: params.approval.agentId,
    intentId: params.approval.intentId,
    consumedTs: Date.now(),
    executionId: params.executionId ?? null,
    reason: params.reason
  });
  writeFileAtomic(consumedFile, JSON.stringify(consumed, null, 2), 0o644);
  const sigPath = signFile(params.workspace, consumedFile);
  return {
    consumed,
    filePath: consumedFile,
    sigPath
  };
}

export function loadApprovalConsumed(params: {
  workspace: string;
  agentId?: string;
  approvalId: string;
}): ApprovalConsumedRecord | null {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const file = approvalConsumedPath(params.workspace, agentId, params.approvalId);
  if (!pathExists(file)) {
    return null;
  }
  const verification = verifyFileSignature(params.workspace, file);
  if (!verification.valid) {
    throw new Error(`Invalid approval consumed signature: ${verification.reason ?? "unknown reason"}`);
  }
  return approvalConsumedSchema.parse(JSON.parse(readUtf8(file)) as unknown);
}

export function approvalStatus(params: {
  workspace: string;
  approval: ApprovalArtifact;
}): ApprovalStatus {
  return statusFromArtifact(params.workspace, params.approval);
}
