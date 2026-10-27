import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdirSync, renameSync } from "node:fs";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { auditRequestsClosedDir, auditRequestsOpenDir, ensureAuditDirs } from "./auditPolicyStore.js";
import { evidenceRequestSchema, type EvidenceRequest } from "./evidenceRequestSchema.js";

function openRequestPath(workspace: string, requestId: string): string {
  return join(auditRequestsOpenDir(workspace), `${requestId}.json`);
}

function closedRequestPath(workspace: string, requestId: string): string {
  return join(auditRequestsClosedDir(workspace), `${requestId}.json`);
}

function loadRequestAt(path: string): EvidenceRequest {
  return evidenceRequestSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function createEvidenceRequest(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  requestedItems: EvidenceRequest["requestedItems"];
  requesterUserIdHash: string;
}): {
  request: EvidenceRequest;
  path: string;
  sigPath: string;
} {
  ensureAuditDirs(params.workspace);
  const request = evidenceRequestSchema.parse({
    v: 1,
    requestId: `req_${randomUUID().replace(/-/g, "")}`,
    createdTs: Date.now(),
    scope: {
      type: params.scopeType,
      id: params.scopeId
    },
    requestedItems: params.requestedItems,
    status: "OPEN",
    requesterUserIdHash: params.requesterUserIdHash
  });
  const path = openRequestPath(params.workspace, request.requestId);
  writeFileAtomic(path, JSON.stringify(request, null, 2), 0o600);
  const sigPath = signFileWithAuditor(params.workspace, path);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_EVIDENCE_REQUEST_CREATED",
    agentId: "workspace",
    artifact: {
      kind: "approval",
      id: request.requestId,
      sha256: sha256Hex(Buffer.from(JSON.stringify(request), "utf8"))
    }
  });
  return {
    request,
    path,
    sigPath
  };
}

export function listEvidenceRequests(workspace: string): EvidenceRequest[] {
  ensureAuditDirs(workspace);
  const dirs = [auditRequestsOpenDir(workspace), auditRequestsClosedDir(workspace)];
  const out: EvidenceRequest[] = [];
  for (const dir of dirs) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const path = join(dir, name);
      const verify = verifySignedFileWithAuditor(workspace, path);
      if (!verify.valid) {
        continue;
      }
      out.push(loadRequestAt(path));
    }
  }
  return out.sort((a, b) => b.createdTs - a.createdTs);
}

export function loadEvidenceRequest(workspace: string, requestId: string): EvidenceRequest {
  const openPath = openRequestPath(workspace, requestId);
  if (pathExists(openPath)) {
    return loadRequestAt(openPath);
  }
  const closedPath = closedRequestPath(workspace, requestId);
  if (pathExists(closedPath)) {
    return loadRequestAt(closedPath);
  }
  throw new Error(`evidence request not found: ${requestId}`);
}

export function updateEvidenceRequest(params: {
  workspace: string;
  request: EvidenceRequest;
}): {
  path: string;
  sigPath: string;
} {
  ensureAuditDirs(params.workspace);
  const next = evidenceRequestSchema.parse(params.request);
  const isClosed = next.status === "REJECTED" || next.status === "FULFILLED";
  const path = isClosed
    ? closedRequestPath(params.workspace, next.requestId)
    : openRequestPath(params.workspace, next.requestId);
  writeFileAtomic(path, JSON.stringify(next, null, 2), 0o600);
  const sigPath = signFileWithAuditor(params.workspace, path);

  if (isClosed) {
    const openPath = openRequestPath(params.workspace, next.requestId);
    if (pathExists(openPath) && openPath !== path) {
      renameSync(openPath, path);
      const movedSig = `${openPath}.sig`;
      if (pathExists(movedSig)) {
        renameSync(movedSig, `${path}.sig`);
      }
      writeFileAtomic(path, JSON.stringify(next, null, 2), 0o600);
      signFileWithAuditor(params.workspace, path);
    }
  }

  const eventType =
    next.status === "APPROVED"
      ? "AUDIT_EVIDENCE_REQUEST_APPROVED"
      : next.status === "REJECTED"
        ? "AUDIT_EVIDENCE_REQUEST_REJECTED"
        : next.status === "FULFILLED"
          ? "AUDIT_EVIDENCE_REQUEST_FULFILLED"
          : "AUDIT_EVIDENCE_REQUEST_CREATED";
  appendTransparencyEntry({
    workspace: params.workspace,
    type: eventType,
    agentId: "workspace",
    artifact: {
      kind: "approval",
      id: next.requestId,
      sha256: sha256Hex(Buffer.from(JSON.stringify(next), "utf8"))
    }
  });

  return {
    path,
    sigPath
  };
}

export { createEvidenceRequestAsync, rejectEvidenceRequestAsync } from "./evidenceRequestPublication.js";
