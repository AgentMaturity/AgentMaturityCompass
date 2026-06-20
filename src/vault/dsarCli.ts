import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DsarAutopilot, type DsarAutopilotSnapshot, type DsarRequest } from "./dsarAutopilot.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type DsarCliType = "access" | "delete" | "deletion" | "portability";

export interface DsarAuditEvent {
  eventId: string;
  ts: number;
  action: "submitted" | "completed";
  requestId: string;
  subjectSha256: string;
  type: DsarRequest["type"];
  status: DsarRequest["status"];
}

export interface DsarRequestSummary {
  total: number;
  pending: number;
  complete: number;
}

export function dsarStorePaths(workspace: string): {
  storePath: string;
  auditPath: string;
} {
  const dir = join(workspace, ".amc", "vault", "dsar");
  return {
    storePath: join(dir, "requests.json"),
    auditPath: join(dir, "audit.jsonl")
  };
}

function normalizeDsarType(type: DsarCliType): DsarRequest["type"] {
  return type === "deletion" ? "delete" : type;
}

function loadAutopilot(workspace: string): DsarAutopilot {
  const paths = dsarStorePaths(workspace);
  if (!pathExists(paths.storePath)) {
    return new DsarAutopilot();
  }
  const snapshot = JSON.parse(readFileSync(paths.storePath, "utf8")) as DsarAutopilotSnapshot;
  return DsarAutopilot.fromSnapshot(snapshot);
}

function saveAutopilot(workspace: string, autopilot: DsarAutopilot): string {
  const paths = dsarStorePaths(workspace);
  mkdirSync(dirname(paths.storePath), { recursive: true });
  writeFileAtomic(paths.storePath, JSON.stringify(autopilot.toSnapshot(), null, 2), 0o600);
  return paths.storePath;
}

function auditEventFor(request: DsarRequest, action: DsarAuditEvent["action"]): DsarAuditEvent {
  const ts = Date.now();
  return {
    eventId: sha256Hex(`${request.requestId}:${action}:${ts}:${request.status}`),
    ts,
    action,
    requestId: request.requestId,
    subjectSha256: sha256Hex(request.subject),
    type: request.type,
    status: request.status
  };
}

function appendAuditEvent(workspace: string, event: DsarAuditEvent): string {
  const paths = dsarStorePaths(workspace);
  mkdirSync(dirname(paths.auditPath), { recursive: true });
  appendFileSync(paths.auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  return paths.auditPath;
}

export function summarizeDsarRequests(requests: DsarRequest[]): DsarRequestSummary {
  const complete = requests.filter((request) => request.status === "complete").length;
  return {
    total: requests.length,
    pending: requests.length - complete,
    complete
  };
}

export function submitDsarForCli(params: {
  workspace: string;
  subject: string;
  type: DsarCliType;
}): {
  request: DsarRequest;
  storePath: string;
  auditPath: string;
} {
  if (!params.subject || params.subject.trim().length === 0) {
    throw new Error("DSAR subject is required.");
  }
  const autopilot = loadAutopilot(params.workspace);
  const request = autopilot.submitRequest(params.subject.trim(), normalizeDsarType(params.type));
  const storePath = saveAutopilot(params.workspace, autopilot);
  const auditPath = appendAuditEvent(params.workspace, auditEventFor(request, "submitted"));
  return { request, storePath, auditPath };
}

export function listDsarForCli(params: {
  workspace: string;
}): {
  requests: DsarRequest[];
  storePath: string;
  auditPath: string;
} {
  const autopilot = loadAutopilot(params.workspace);
  const paths = dsarStorePaths(params.workspace);
  return {
    requests: autopilot.listRequests(),
    storePath: paths.storePath,
    auditPath: paths.auditPath
  };
}

export function getDsarStatusForCli(params: {
  workspace: string;
  requestId: string;
}): {
  request: DsarRequest;
  storePath: string;
  auditPath: string;
} {
  const autopilot = loadAutopilot(params.workspace);
  const request = autopilot.getStatus(params.requestId);
  if (!request) {
    throw new Error(`DSAR request not found: ${params.requestId}`);
  }
  const paths = dsarStorePaths(params.workspace);
  return {
    request,
    storePath: paths.storePath,
    auditPath: paths.auditPath
  };
}

export function completeDsarForCli(params: {
  workspace: string;
  requestId: string;
}): {
  request: DsarRequest;
  storePath: string;
  auditPath: string;
} {
  const autopilot = loadAutopilot(params.workspace);
  const request = autopilot.processRequest(params.requestId);
  const storePath = saveAutopilot(params.workspace, autopilot);
  const auditPath = appendAuditEvent(params.workspace, auditEventFor(request, "completed"));
  return {
    request,
    storePath,
    auditPath
  };
}
