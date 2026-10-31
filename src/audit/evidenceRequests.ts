import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes } from "../org/preparedOrgPairs.js";
import { safeIdSchema } from "../utils/pathSafety.js";
import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import type { AuditPublicationOptions } from "./binderPublication.js";
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
  createEvidenceRequest, createEvidenceRequestAsync,
  listEvidenceRequests,
  loadEvidenceRequest,
  updateEvidenceRequest, rejectEvidenceRequestAsync
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

/** A completed request mutation can precede a refused or partial pending-file removal. */
class AuditEvidenceRequestExecutionError extends Error {
  readonly code = "AUDIT_REQUEST_EXECUTION_INCOMPLETE";
  constructor(readonly requestId: string, readonly completedRequest: Awaited<ReturnType<typeof rejectEvidenceRequestAsync>>["progress"],
    readonly pendingRemoveAttempted: boolean, readonly pendingRemoveReturned: boolean, readonly pendingRemoveAcknowledged: boolean, cause: unknown) {
    super("audit evidence request mutation completed but its pending-file continuation did not finish", { cause }); this.name = "AuditEvidenceRequestExecutionError";
  }
}
export async function createAuditEvidenceRequestAsync(params: Parameters<typeof createAuditEvidenceRequest>[0], options: AuditPublicationOptions = {}) {
  const input = structuredClone(params), workspace = resolve(input.workspace), caller = { ...options };
  const attempt = await createEvidenceRequestAsync({ workspace, scopeType: input.scopeType,
    scopeId: input.scopeType === "WORKSPACE" ? "workspace" : input.scopeId, requestedItems: toRequestedItems(input.requestedItems),
    requesterUserIdHash: sha256Hex(input.requesterUserId).slice(0, 16) }, caller);
  attempt.assertCurrent(); return { request: attempt.request, path: attempt.path, sigPath: attempt.sigPath };
}
export async function rejectAuditEvidenceRequestAsync(params: Parameters<typeof rejectAuditEvidenceRequest>[0], options: AuditPublicationOptions = {}) {
  const requestId = safeIdSchema.parse(params.requestId), workspace = resolve(params.workspace), caller = { ...options };
  const path = pendingPath(workspace, requestId), original = captureOrgFiles([path]); let expected = original;
  const beforePublish = () => { caller.beforePublish?.(); assertOrgPairsCurrent(expected); };
  const originalOutputs = caller.assertOutputsSafe; let aliases: (() => void) | null = null, selectedPaths: string | null = null;
  const attempt = await rejectEvidenceRequestAsync({ workspace, requestId }, { ...caller, beforePublish,
    assertOutputsSafe(paths) { originalOutputs?.(paths); const key = JSON.stringify(paths);
      if (selectedPaths !== null && selectedPaths !== key) throw new Error("audit request output selection changed");
      if (aliases === null) { selectedPaths = key; aliases = captureAuditOutputAliases(paths, [path]); }
      aliases(); assertOrgPairsCurrent(expected); } });
  let pendingRemoveAttempted = false, pendingRemoveReturned = false, pendingRemoveAcknowledged = false;
  try {
    attempt.assertCurrent();
    if (orgPairBytes(original, path) !== null) {
      pendingRemoveAttempted = true; rmSync(path, { force: true }); pendingRemoveReturned = true;
      const absent = captureOrgFiles([path]);
      if (orgPairBytes(absent, path) !== null) throw new Error("removed audit request pending file is not absent");
      expected = absent; pendingRemoveAcknowledged = true;
    }
    attempt.assertCurrent(); return attempt.request;
  } catch (cause) { throw new AuditEvidenceRequestExecutionError(requestId, attempt.progress, pendingRemoveAttempted, pendingRemoveReturned, pendingRemoveAcknowledged, cause); }
}
