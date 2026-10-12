import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdirSync, rmSync } from "node:fs";
import { z } from "zod";
import {
  createApprovalForIntent,
  consumeApprovedExecution,
  decideApprovalForIntent,
  verifyApprovalForExecution
} from "../approvals/approvalEngine.js";
import { listApprovalDecisions } from "../approvals/approvalChainStore.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { type UserRole } from "../auth/roles.js";
import {
  createEvidenceRequest,
  listEvidenceRequests,
  loadEvidenceRequest,
  updateEvidenceRequest
} from "./evidenceRequestStore.js";
import { evidenceRequestItemSchema, type EvidenceRequest } from "./evidenceRequestSchema.js";

const pendingApprovalSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  createdTs: z.number().int()
});

function pendingDir(workspace: string): string {
  return join(workspace, ".amc", "audit", "requests", "pending");
}

function pendingPath(workspace: string, requestId: string): string {
  return join(pendingDir(workspace), `${requestId}.approval.json`);
}

function savePendingApproval(workspace: string, pending: z.infer<typeof pendingApprovalSchema>): string {
  ensureDir(pendingDir(workspace));
  const path = pendingPath(workspace, pending.requestId);
  writeFileAtomic(path, JSON.stringify(pendingApprovalSchema.parse(pending), null, 2), 0o600);
  return path;
}

function loadPendingApproval(workspace: string, requestId: string): z.infer<typeof pendingApprovalSchema> {
  const path = pendingPath(workspace, requestId);
  if (!pathExists(path)) {
    throw new Error(`pending approval not found for request ${requestId}`);
  }
  return pendingApprovalSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function removePendingApproval(workspace: string, requestId: string): void {
  const path = pendingPath(workspace, requestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

function listPendingApprovals(workspace: string): z.infer<typeof pendingApprovalSchema>[] {
  const dir = pendingDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".approval.json"))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => pendingApprovalSchema.parse(JSON.parse(readUtf8(join(dir, name))) as unknown));
}

function toRequestedItems(input: Array<string | EvidenceRequest["requestedItems"][number]>): EvidenceRequest["requestedItems"] {
  const out: EvidenceRequest["requestedItems"] = [];
  for (const row of input) {
    if (typeof row !== "string") {
      out.push(evidenceRequestItemSchema.parse(row));
      continue;
    }
    const trimmed = row.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("control:")) {
      out.push(
        evidenceRequestItemSchema.parse({
          kind: "CONTROL",
          controlId: trimmed.slice("control:".length)
        })
      );
      continue;
    }
    if (trimmed.startsWith("proof:")) {
      out.push(
        evidenceRequestItemSchema.parse({
          kind: "PROOF",
          id: trimmed.slice("proof:".length)
        })
      );
      continue;
    }
    if (trimmed.startsWith("artifact:")) {
      const body = trimmed.slice("artifact:".length);
      const [id, sha256 = ""] = body.split("@");
      out.push(
        evidenceRequestItemSchema.parse({
          kind: "ARTIFACT_HASH",
          id: id ?? "",
          sha256: (sha256 || "0".repeat(64)).padEnd(64, "0").slice(0, 64)
        })
      );
      continue;
    }
    throw new Error(`unsupported evidence request item: ${trimmed}`);
  }
  if (out.length === 0) {
    throw new Error("at least one requested item is required");
  }
  return out;
}

export function createAuditEvidenceRequest(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  requestedItems: Array<string | EvidenceRequest["requestedItems"][number]>;
  requesterUserId: string;
}) {
  return createEvidenceRequest({
    workspace: params.workspace,
    scopeType: params.scopeType,
    scopeId: params.scopeType === "WORKSPACE" ? "workspace" : params.scopeId,
    requestedItems: toRequestedItems(params.requestedItems),
    requesterUserIdHash: sha256Hex(params.requesterUserId).slice(0, 16)
  });
}

export function listAuditEvidenceRequests(workspace: string): Array<EvidenceRequest & { pendingApprovalRequestId: string | null }> {
  const pending = new Map(listPendingApprovals(workspace).map((row) => [row.requestId, row.approvalRequestId]));
  return listEvidenceRequests(workspace).map((row) => ({
    ...row,
    pendingApprovalRequestId: pending.get(row.requestId) ?? null
  }));
}

export function requestAuditEvidenceApproval(params: {
  workspace: string;
  requestId: string;
  agentId?: string;
  actorUserId: string;
  actorUsername: string;
  actorRoles: UserRole[];
  reason: string;
}) {
  const request = loadEvidenceRequest(params.workspace, params.requestId);
  if (request.status !== "OPEN") {
    throw new Error(`request is not OPEN: ${request.status}`);
  }
  const existingPath = pendingPath(params.workspace, request.requestId);
  if (pathExists(existingPath)) {
    const existing = loadPendingApproval(params.workspace, request.requestId);
    return {
      request,
      approvalRequestId: existing.approvalRequestId,
      intentId: existing.intentId,
      created: false
    };
  }

  const agentId = params.agentId?.trim() || "default";
  const intentId = `audit-request-${request.requestId}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const created = createApprovalForIntent({
    workspace: params.workspace,
    // The auditor who filed the evidence request started it (P1-78); the request keeps them only as an id hash. The owner
    // filing this approval is its first approver, as the dual-control flow below records.
    initiator: `sha256-16:${request.requesterUserIdHash}`,
    agentId,
    intentId,
    toolName: "audit.request.fulfill",
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId: request.requestId,
      scopeType: request.scope.type,
      scopeId: request.scope.id,
      requestedItems: request.requestedItems
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });

  // Record owner approval decision as the start of the dual-control flow.
  if (params.actorRoles.includes("OWNER")) {
    decideApprovalForIntent({
      workspace: params.workspace,
      agentId,
      approvalId: created.approval.approvalRequestId,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: params.reason || "audit evidence request approved by owner",
      userId: params.actorUserId,
      username: params.actorUsername,
      userRoles: params.actorRoles
    });
  }

  savePendingApproval(params.workspace, {
    v: 1,
    requestId: request.requestId,
    approvalRequestId: created.approval.approvalRequestId,
    intentId,
    agentId,
    createdTs: Date.now()
  });
  return {
    request,
    approvalRequestId: created.approval.approvalRequestId,
    intentId,
    created: true
  };
}

export function rejectAuditEvidenceRequest(params: {
  workspace: string;
  requestId: string;
}) {
  const request = loadEvidenceRequest(params.workspace, params.requestId);
  if (request.status === "FULFILLED") {
    throw new Error("fulfilled request cannot be rejected");
  }
  const next: EvidenceRequest = {
    ...request,
    status: "REJECTED"
  };
  updateEvidenceRequest({
    workspace: params.workspace,
    request: next
  });
  removePendingApproval(params.workspace, params.requestId);
  return next;
}

export function markAuditEvidenceRequestFulfilled(params: {
  workspace: string;
  requestId: string;
  binderSha256: string;
  exportedAtTs?: number;
}): {
  request: EvidenceRequest;
  approvalRequestId: string;
  approvals: EvidenceRequest["approvals"];
} {
  const request = loadEvidenceRequest(params.workspace, params.requestId);
  if (request.status !== "OPEN" && request.status !== "APPROVED") {
    throw new Error(`request is not fulfillable from status ${request.status}`);
  }
  const pending = loadPendingApproval(params.workspace, request.requestId);
  const verified = verifyApprovalForExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "audit.request.fulfill",
    expectedActionClass: "SECURITY"
  });
  if (!verified.ok) {
    throw new Error(`approval not executable: ${verified.error ?? verified.status ?? "unknown"}`);
  }

  const decisions = listApprovalDecisions({
    workspace: params.workspace,
    agentId: pending.agentId,
    approvalRequestId: pending.approvalRequestId
  });
  const approvals = decisions
    .filter((row) => row.decision === "APPROVE_EXECUTE" || row.decision === "APPROVE_SIMULATE")
    .map((row) => ({
      approvalEventHash: sha256Hex(row.approvalDecisionId),
      userIdHash: sha256Hex(row.userId).slice(0, 16),
      role: (row.roles.find((role) => role === "OWNER" || role === "AUDITOR" || role === "APPROVER" || role === "OPERATOR" || role === "VIEWER") ??
        "APPROVER") as "OWNER" | "AUDITOR" | "APPROVER" | "OPERATOR" | "VIEWER"
    }));

  const next: EvidenceRequest = {
    ...request,
    status: "FULFILLED",
    approvals,
    fulfillment: {
      binderSha256: params.binderSha256,
      exportedAtTs: params.exportedAtTs ?? Date.now()
    }
  };
  updateEvidenceRequest({
    workspace: params.workspace,
    request: next
  });

  consumeApprovedExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: request.requestId
  });
  removePendingApproval(params.workspace, request.requestId);

  return {
    request: next,
    approvalRequestId: pending.approvalRequestId,
    approvals
  };
}
