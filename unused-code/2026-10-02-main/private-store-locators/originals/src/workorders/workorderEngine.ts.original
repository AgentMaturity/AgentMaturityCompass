import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getPublicKeyHistory, getPrivateKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workOrderSchema, type WorkOrder } from "./workorderSchema.js";
import type { ActionClass, ExecutionMode, RiskTier } from "../types.js";

interface SignatureFile {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

interface WorkOrderRevocation {
  v: 1;
  workOrderId: string;
  agentId: string;
  revokedTs: number;
  reason: string;
}

function toWorkOrderRisk(risk: RiskTier): WorkOrder["riskTier"] {
  return risk === "med" ? "medium" : risk;
}

export function workOrdersDir(workspace: string, agentId?: string): string {
  const resolved = resolveAgentId(workspace, agentId);
  return join(getAgentPaths(workspace, resolved).rootDir, "workorders");
}

export function workOrderPath(workspace: string, agentId: string, workOrderId: string): string {
  return join(workOrdersDir(workspace, agentId), `${workOrderId}.json`);
}

function workOrderSigPath(file: string): string {
  return `${file}.sig`;
}

function workOrderRevokePath(workspace: string, agentId: string, workOrderId: string): string {
  return join(workOrdersDir(workspace, agentId), `${workOrderId}.revocation.json`);
}

function signFile(workspace: string, filePath: string): string {
  const digest = sha256Hex(readFileSync(filePath));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const payload: SignatureFile = {
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = workOrderSigPath(filePath);
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

function verifyFileSignature(workspace: string, filePath: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  sigPath: string;
} {
  const sigPath = workOrderSigPath(filePath);
  if (!pathExists(filePath)) {
    return { valid: false, signatureExists: false, reason: "work order file missing", sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "signature missing", sigPath };
  }
  try {
    const signature = JSON.parse(readUtf8(sigPath)) as SignatureFile;
    const digest = sha256Hex(readFileSync(filePath));
    if (digest !== signature.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", sigPath };
    }
    const valid = verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: `invalid signature payload: ${String(error)}`,
      sigPath
    };
  }
}

export function createWorkOrder(params: {
  workspace: string;
  agentId?: string;
  title: string;
  description: string;
  riskTier: RiskTier;
  requestedMode: ExecutionMode;
  allowedActionClasses: ActionClass[];
  requiredAssurancePacks?: Record<string, { minScore: number }>;
  expiresTs?: number | null;
  artifacts?: { repoUrl?: string; branch?: string; ticketUrl?: string };
}): {
  workOrder: WorkOrder;
  filePath: string;
  sigPath: string;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const dir = workOrdersDir(params.workspace, agentId);
  ensureDir(dir);

  const workOrder = workOrderSchema.parse({
    v: 1,
    workOrderId: `wo_${randomUUID().replace(/-/g, "")}`,
    agentId,
    title: params.title,
    description: params.description,
    createdTs: Date.now(),
    riskTier: toWorkOrderRisk(params.riskTier),
    requestedMode: params.requestedMode,
    allowedActionClasses: params.allowedActionClasses,
    requiredAssurancePacks: params.requiredAssurancePacks ?? {},
    expiresTs: params.expiresTs ?? null,
    artifacts: params.artifacts ?? {}
  });

  const filePath = workOrderPath(params.workspace, agentId, workOrder.workOrderId);
  writeFileAtomic(filePath, JSON.stringify(workOrder, null, 2), 0o644);
  const sigPath = signFile(params.workspace, filePath);
  return {
    workOrder,
    filePath,
    sigPath
  };
}

export function verifyWorkOrder(params: {
  workspace: string;
  agentId?: string;
  workOrderId: string;
}): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
  expired: boolean;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const path = workOrderPath(params.workspace, agentId, params.workOrderId);
  const sig = verifyFileSignature(params.workspace, path);
  let expired = false;
  if (pathExists(path)) {
    try {
      const wo = workOrderSchema.parse(JSON.parse(readUtf8(path)) as unknown);
      expired = isWorkOrderExpired(params.workspace, agentId, wo);
    } catch {
      expired = true;
    }
  }
  return {
    valid: sig.valid,
    signatureExists: sig.signatureExists,
    reason: sig.reason,
    path,
    sigPath: sig.sigPath,
    expired
  };
}

export function loadWorkOrder(params: {
  workspace: string;
  agentId?: string;
  workOrderId: string;
  requireValidSignature?: boolean;
}): WorkOrder {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const path = workOrderPath(params.workspace, agentId, params.workOrderId);
  if (!pathExists(path)) {
    throw new Error(`Work order not found: ${path}`);
  }
  const workOrder = workOrderSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  if (params.requireValidSignature !== false) {
    const verification = verifyFileSignature(params.workspace, path);
    if (!verification.valid) {
      throw new Error(`Invalid work order signature: ${verification.reason ?? "unknown"}`);
    }
  }
  if (isWorkOrderExpired(params.workspace, agentId, workOrder)) {
    throw new Error(`Work order ${workOrder.workOrderId} is expired/revoked`);
  }
  return workOrder;
}

function isWorkOrderExpired(workspace: string, agentId: string, workOrder: WorkOrder): boolean {
  if (typeof workOrder.expiresTs === "number" && workOrder.expiresTs > 0 && Date.now() > workOrder.expiresTs) {
    return true;
  }
  return pathExists(workOrderRevokePath(workspace, agentId, workOrder.workOrderId));
}

export function listWorkOrders(params: {
  workspace: string;
  agentId?: string;
}): Array<{ workOrderId: string; title: string; riskTier: WorkOrder["riskTier"]; requestedMode: WorkOrder["requestedMode"]; valid: boolean; expired: boolean }> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const dir = workOrdersDir(params.workspace, agentId);
  if (!pathExists(dir)) {
    return [];
  }

  const rows: Array<{ workOrderId: string; title: string; riskTier: WorkOrder["riskTier"]; requestedMode: WorkOrder["requestedMode"]; valid: boolean; expired: boolean }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file.endsWith(".revocation.json")) {
      continue;
    }
    const full = join(dir, file);
    try {
      const workOrder = workOrderSchema.parse(JSON.parse(readUtf8(full)) as unknown);
      const verify = verifyFileSignature(params.workspace, full);
      rows.push({
        workOrderId: workOrder.workOrderId,
        title: workOrder.title,
        riskTier: workOrder.riskTier,
        requestedMode: workOrder.requestedMode,
        valid: verify.valid,
        expired: isWorkOrderExpired(params.workspace, agentId, workOrder)
      });
    } catch {
      rows.push({
        workOrderId: basename(file, ".json"),
        title: "(invalid)",
        riskTier: "low",
        requestedMode: "SIMULATE",
        valid: false,
        expired: true
      });
    }
  }

  return rows.sort((a, b) => a.workOrderId.localeCompare(b.workOrderId));
}

export function expireWorkOrder(params: {
  workspace: string;
  agentId?: string;
  workOrderId: string;
  reason?: string;
}): { revokePath: string; sigPath: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const workOrder = loadWorkOrder({
    workspace: params.workspace,
    agentId,
    workOrderId: params.workOrderId,
    requireValidSignature: true
  });
  const revoke: WorkOrderRevocation = {
    v: 1,
    workOrderId: workOrder.workOrderId,
    agentId,
    revokedTs: Date.now(),
    reason: params.reason ?? "expired by owner"
  };
  const revokePath = workOrderRevokePath(params.workspace, agentId, workOrder.workOrderId);
  writeFileAtomic(revokePath, JSON.stringify(revoke, null, 2), 0o644);
  const sigPath = signFile(params.workspace, revokePath);
  return {
    revokePath,
    sigPath
  };
}

export function latestActiveWorkOrder(workspace: string, agentId?: string): WorkOrder | null {
  const resolved = resolveAgentId(workspace, agentId);
  const dir = workOrdersDir(workspace, resolved);
  if (!pathExists(dir)) {
    return null;
  }
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".revocation.json"))
    .map((file) => join(dir, file))
    .sort((a, b) => a.localeCompare(b));
  let best: WorkOrder | null = null;
  for (const file of files) {
    try {
      const workOrder = workOrderSchema.parse(JSON.parse(readUtf8(file)) as unknown);
      const verify = verifyFileSignature(workspace, file);
      if (!verify.valid) {
        continue;
      }
      if (isWorkOrderExpired(workspace, resolved, workOrder)) {
        continue;
      }
      if (!best || workOrder.createdTs > best.createdTs) {
        best = workOrder;
      }
    } catch {
      // ignore malformed files
    }
  }
  return best;
}

export function workOrderDigest(workOrder: WorkOrder): string {
  return sha256Hex(canonicalize(workOrder));
}
