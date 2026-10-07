import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { rmSync } from "node:fs";
import { z } from "zod";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { auditMapSchema, type AuditMapFile } from "./auditMapSchema.js";
import { auditPolicySchema, type AuditPolicy } from "./auditPolicySchema.js";
import {
  initAuditMaps,
  loadAuditMapActive,
  loadAuditMapBuiltin,
  saveAuditMapActive,
  verifyAuditMapActiveSignature,
  verifyAuditMapBuiltinSignature
} from "./auditMapStore.js";
import {
  initAuditPolicy,
  loadAuditPolicy,
  saveAuditPolicy,
  verifyAuditPolicySignature
} from "./auditPolicyStore.js";
import {
  createAuditBinderArtifact,
  defaultAuditExportPath,
  listExportedAuditBinders
} from "./binderArtifact.js";
import { verifyAuditBinderFile, verifyAuditWorkspace } from "./binderVerifier.js";
import { verifyIndustryPackAuditFile } from "../domains/industryPackAudit.js";
import { loadBinderCache } from "./binderStore.js";
import {
  createAuditEvidenceRequest,
  listAuditEvidenceRequests,
  markAuditEvidenceRequestFulfilled,
  rejectAuditEvidenceRequest,
  requestAuditEvidenceApproval
} from "./evidenceRequests.js";
import { loadEvidenceRequest } from "./evidenceRequestStore.js";
import { evidenceRequestItemSchema } from "./evidenceRequestSchema.js";
import { auditSchedulerRunNow, auditSchedulerSetEnabled, auditSchedulerStatus } from "./auditScheduler.js";
import type { TrustContext } from "../trust/trustContext.js";

const pendingExportSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  scopeType: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  scopeId: z.string().min(1),
  outFile: z.string().min(1),
  evidenceRequestId: z.string().min(1).nullable().optional(),
  createdTs: z.number().int()
});

function pendingExportDir(workspace: string): string {
  return join(workspace, ".amc", "audit", "binders", "pending");
}

function pendingExportPath(workspace: string, approvalRequestId: string): string {
  return join(pendingExportDir(workspace), `${approvalRequestId}.json`);
}

function savePendingExport(workspace: string, pending: z.infer<typeof pendingExportSchema>): string {
  ensureDir(pendingExportDir(workspace));
  const path = pendingExportPath(workspace, pending.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(pendingExportSchema.parse(pending), null, 2), 0o600);
  return path;
}

function loadPendingExport(workspace: string, approvalRequestId: string): z.infer<typeof pendingExportSchema> {
  const path = pendingExportPath(workspace, approvalRequestId);
  if (!pathExists(path)) {
    throw new Error(`pending audit export not found: ${approvalRequestId}`);
  }
  return pendingExportSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function removePendingExport(workspace: string, approvalRequestId: string): void {
  const path = pendingExportPath(workspace, approvalRequestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

function parseScope(params: {
  scopeType?: string | null;
  scopeId?: string | null;
}): { scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string } {
  const scopeTypeRaw = String(params.scopeType ?? "WORKSPACE").toUpperCase();
  const scopeType = scopeTypeRaw === "NODE" || scopeTypeRaw === "AGENT" ? scopeTypeRaw : "WORKSPACE";
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : ((params.scopeId ?? "").trim() || "default");
  return {
    scopeType,
    scopeId
  };
}

export function auditInitForApi(workspace: string) {
  const policy = initAuditPolicy(workspace);
  const maps = initAuditMaps(workspace);
  return {
    policy,
    maps
  };
}

export function auditPolicyForApi(workspace: string): {
  policy: AuditPolicy;
  signature: ReturnType<typeof verifyAuditPolicySignature>;
} {
  return {
    policy: loadAuditPolicy(workspace),
    signature: verifyAuditPolicySignature(workspace)
  };
}

export function auditPolicyApplyForApi(params: {
  workspace: string;
  policy: unknown;
}) {
  const parsed = auditPolicySchema.parse(params.policy);
  const saved = saveAuditPolicy(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_POLICY_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")),
      id: "audit-policy"
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function auditMapListForApi(workspace: string): Array<{ id: string; name: string; source: "builtin" | "active" }> {
  const builtin = loadAuditMapBuiltin(workspace);
  const active = loadAuditMapActive(workspace);
  const rows: Array<{ id: string; name: string; source: "builtin" | "active" }> = [
    {
      id: builtin.auditMap.id,
      name: builtin.auditMap.name,
      source: "builtin"
    }
  ];
  if (active.auditMap.id !== builtin.auditMap.id || active.auditMap.name !== builtin.auditMap.name) {
    rows.push({
      id: active.auditMap.id,
      name: active.auditMap.name,
      source: "active"
    });
  } else {
    rows.push({
      id: active.auditMap.id,
      name: active.auditMap.name,
      source: "active"
    });
  }
  return rows;
}

export function auditMapShowForApi(params: {
  workspace: string;
  id?: "builtin" | "active";
}): {
  map: AuditMapFile;
  signatures: {
    builtin: ReturnType<typeof verifyAuditMapBuiltinSignature>;
    active: ReturnType<typeof verifyAuditMapActiveSignature>;
  };
} {
  const id = params.id ?? "active";
  return {
    map: id === "builtin" ? loadAuditMapBuiltin(params.workspace) : loadAuditMapActive(params.workspace),
    signatures: {
      builtin: verifyAuditMapBuiltinSignature(params.workspace),
      active: verifyAuditMapActiveSignature(params.workspace)
    }
  };
}

export function auditMapApplyForApi(params: {
  workspace: string;
  map: unknown;
}) {
  const parsed = auditMapSchema.parse(params.map);
  const saved = saveAuditMapActive(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_MAP_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")),
      id: parsed.auditMap.id
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function auditMapVerifyForApi(workspace: string) {
  return {
    builtin: verifyAuditMapBuiltinSignature(workspace),
    active: verifyAuditMapActiveSignature(workspace)
  };
}

export function auditReadinessGate(workspace: string): {
  ok: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const policy = verifyAuditPolicySignature(workspace);
  if (!policy.valid) {
    reasons.push(`AUDIT_POLICY_UNTRUSTED:${policy.reason ?? "unknown"}`);
  }
  const activeMap = verifyAuditMapActiveSignature(workspace);
  if (!activeMap.valid) {
    reasons.push(`AUDIT_MAP_UNTRUSTED:${activeMap.reason ?? "unknown"}`);
  }
  const verify = verifyAuditWorkspace({ workspace });
  if (!verify.ok) {
    warnings.push(...verify.errors.map((row) => `AUDIT_VERIFY_WARN:${row}`));
  }
  return {
    ok: reasons.length === 0,
    reasons,
    warnings
  };
}

export async function auditBinderCreateForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  requestId?: string | null;
}) {
  const scope = parseScope(params);
  const request = params.requestId ? loadEvidenceRequest(params.workspace, params.requestId) : null;
  const out = await auditSchedulerRunNow({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    request
  });
  return {
    binder: out.binder,
    cache: out.cache,
    scheduler: out.scheduler,
    transparencyHash: out.transparencyHash
  };
}

export async function auditBinderExportForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
  requestId?: string | null;
}) {
  const scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultAuditExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const request = params.requestId ? loadEvidenceRequest(params.workspace, params.requestId) : null;
  return await createAuditBinderArtifact({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    request
  });
}

export function auditBinderExportRequestForApi(params: {
  workspace: string;
  agentId: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
  requestId?: string | null;
}): {
  requestId: string;
  approvalRequestId: string;
  intentId: string;
} {
  const scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultAuditExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const requestId = `auditexp_${randomUUID().replace(/-/g, "")}`;
  const intentId = `audit-export-${requestId}`;
  const approval = createApprovalForIntent({
    workspace: params.workspace,
    agentId: params.agentId,
    intentId,
    toolName: "audit.binder.export",
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      outFile: resolve(params.workspace, outFile),
      evidenceRequestId: params.requestId ?? null
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });
  savePendingExport(params.workspace, {
    v: 1,
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    agentId: params.agentId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    evidenceRequestId: params.requestId ?? null,
    createdTs: Date.now()
  });
  return {
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId
  };
}

export async function auditBinderExportExecuteForApi(params: {
  workspace: string;
  approvalRequestId: string;
}) {
  const pending = loadPendingExport(params.workspace, params.approvalRequestId);
  const verify = verifyApprovalForExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "audit.binder.export",
    expectedActionClass: "SECURITY"
  });
  if (!verify.ok) {
    throw new Error(`audit binder export approval not executable: ${verify.error ?? verify.status ?? "unknown"}`);
  }
  const created = await createAuditBinderArtifact({
    workspace: params.workspace,
    scopeType: pending.scopeType,
    scopeId: pending.scopeId,
    outFile: pending.outFile,
    request: pending.evidenceRequestId ? loadEvidenceRequest(params.workspace, pending.evidenceRequestId) : null
  });
  consumeApprovedExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  removePendingExport(params.workspace, pending.approvalRequestId);
  return created;
}

export function auditBindersForApi(workspace: string) {
  return {
    exports: listExportedAuditBinders(workspace),
    cache: {
      workspace: loadBinderCache({
        workspace,
        scopeType: "WORKSPACE",
        scopeId: "workspace"
      })
    }
  };
}

export function auditBinderVerifyForApi(params: {
  file: string;
  workspace?: string;
  publicKeyPath?: string;
  trust: TrustContext;
}) {
  const file = resolve(params.file);
  const publicKeyPath = params.publicKeyPath ? resolve(params.publicKeyPath) : undefined;
  // P0-20: a .json industry-pack audit verifies here too, under the same pinned trust as a binder.
  return verifyIndustryPackAuditFile({ file, publicKeyPath, trust: params.trust })
    ?? verifyAuditBinderFile({ file, workspace: params.workspace, publicKeyPath, trust: params.trust });
}

export function auditRequestCreateForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  requestedItems: Array<string | z.infer<typeof evidenceRequestItemSchema>>;
  requesterUserId: string;
}) {
  const scope = parseScope(params);
  return createAuditEvidenceRequest({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    requestedItems: params.requestedItems,
    requesterUserId: params.requesterUserId
  });
}

export function auditRequestListForApi(workspace: string) {
  return listAuditEvidenceRequests(workspace);
}

export function auditRequestApproveForApi(params: {
  workspace: string;
  requestId: string;
  agentId?: string;
  actorUserId: string;
  actorUsername: string;
  actorRoles: Array<"OWNER" | "AUDITOR" | "APPROVER" | "OPERATOR" | "VIEWER" | "AGENT">;
  reason: string;
}) {
  return requestAuditEvidenceApproval({
    workspace: params.workspace,
    requestId: params.requestId,
    agentId: params.agentId,
    actorUserId: params.actorUserId,
    actorUsername: params.actorUsername,
    actorRoles: params.actorRoles,
    reason: params.reason
  });
}

export function auditRequestRejectForApi(params: {
  workspace: string;
  requestId: string;
}) {
  return rejectAuditEvidenceRequest(params);
}

export async function auditRequestFulfillForApi(params: {
  workspace: string;
  requestId: string;
  outFile?: string | null;
}) {
  const request = loadEvidenceRequest(params.workspace, params.requestId);
  const scope = parseScope({
    scopeType: request.scope.type,
    scopeId: request.scope.id
  });
  const outFile = params.outFile?.trim() || defaultAuditExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const created = await createAuditBinderArtifact({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    request
  });
  const fulfilled = markAuditEvidenceRequestFulfilled({
    workspace: params.workspace,
    requestId: request.requestId,
    binderSha256: created.sha256
  });
  return {
    request: fulfilled.request,
    approvalRequestId: fulfilled.approvalRequestId,
    export: created
  };
}

export function auditSchedulerStatusForApi(workspace: string) {
  return auditSchedulerStatus(workspace);
}

export async function auditSchedulerRunNowForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
}) {
  const scope = parseScope(params);
  return await auditSchedulerRunNow({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
}

export function auditSchedulerEnableForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  return auditSchedulerSetEnabled(params);
}
