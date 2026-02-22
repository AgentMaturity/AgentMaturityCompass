import { resolve } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import type { EvidenceEvent } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";

export type EnterpriseAuditExportFormat = "splunk" | "datadog" | "cloudtrail" | "azure";
export type EnterpriseAuditOutcome = "success" | "failure";

export interface EnterpriseAuditRecord {
  eventId: string;
  ts: number;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  outcome: EnterpriseAuditOutcome;
  sourceIp: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
}

export interface SplunkHecEvent {
  time: number;
  host: string;
  source: string;
  sourcetype: string;
  event: EnterpriseAuditRecord;
}

export interface DatadogLogEvent {
  ddsource: string;
  ddtags: string;
  hostname: string;
  service: string;
  status: "info" | "error";
  timestamp: string;
  message: string;
  attributes: EnterpriseAuditRecord;
}

export interface CloudTrailEvent {
  eventVersion: string;
  eventID: string;
  eventTime: string;
  eventSource: string;
  eventName: string;
  eventType: string;
  readOnly: boolean;
  recipientAccountId: string;
  sourceIPAddress: string;
  userAgent: string;
  userIdentity: {
    type: string;
    principalId: string;
    userName: string;
  };
  requestParameters: {
    resource: string;
    details: Record<string, unknown>;
  };
  responseElements: {
    outcome: EnterpriseAuditOutcome;
  };
}

export interface CloudTrailExportPayload {
  Records: CloudTrailEvent[];
}

export interface AzureMonitorEvent {
  TimeGenerated: string;
  Category: string;
  OperationName: string;
  ResultType: "Success" | "Failure";
  ResultDescription: string;
  CallerIpAddress: string;
  Identity: string;
  ResourceId: string;
  Properties: Record<string, unknown>;
}

export type EnterpriseAuditExportPayload =
  | SplunkHecEvent[]
  | DatadogLogEvent[]
  | CloudTrailExportPayload
  | AzureMonitorEvent[];

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function metaString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function inferOutcome(meta: Record<string, unknown>): EnterpriseAuditOutcome {
  const rawStatus = metaString(meta, ["status", "result", "outcome"]);
  if (!rawStatus) {
    return "success";
  }
  const normalized = rawStatus.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("deny") || normalized.includes("error")) {
    return "failure";
  }
  return "success";
}

export function eventToEnterpriseAuditRecord(event: EvidenceEvent): EnterpriseAuditRecord {
  const meta = parseMeta(event.meta_json);
  const actor = metaString(meta, ["actor", "actorId", "agentId", "agent_id"]) ?? event.session_id;
  const action = metaString(meta, ["auditType", "action", "eventName"]) ?? event.event_type;
  const resource =
    metaString(meta, ["resource", "resourceId", "workspaceId", "workspace_id"]) ?? `session:${event.session_id}`;
  const sourceIp = metaString(meta, ["sourceIp", "source_ip", "ip"]);
  const userAgent = metaString(meta, ["userAgent", "user_agent"]);

  return {
    eventId: event.id,
    ts: event.ts,
    timestamp: new Date(event.ts).toISOString(),
    actor,
    action,
    resource,
    outcome: inferOutcome(meta),
    sourceIp,
    userAgent,
    details: {
      eventType: event.event_type,
      runtime: event.runtime,
      payloadSha256: event.payload_sha256,
      metadata: meta
    }
  };
}

export function buildEnterpriseAuditPayload(
  format: EnterpriseAuditExportFormat,
  records: EnterpriseAuditRecord[]
): EnterpriseAuditExportPayload {
  if (format === "splunk") {
    const payload: SplunkHecEvent[] = records.map((record) => ({
      time: record.ts / 1000,
      host: "amc",
      source: "amc.audit",
      sourcetype: "amc:audit",
      event: record
    }));
    return payload;
  }

  if (format === "datadog") {
    const payload: DatadogLogEvent[] = records.map((record) => ({
      ddsource: "amc",
      ddtags: `action:${record.action},outcome:${record.outcome}`,
      hostname: "amc",
      service: "amc-audit",
      status: record.outcome === "failure" ? "error" : "info",
      timestamp: record.timestamp,
      message: `${record.action} ${record.resource}`,
      attributes: record
    }));
    return payload;
  }

  if (format === "cloudtrail") {
    const payload: CloudTrailExportPayload = {
      Records: records.map((record) => ({
        eventVersion: "1.08",
        eventID: record.eventId,
        eventTime: record.timestamp,
        eventSource: "amc.enterprise.audit",
        eventName: record.action,
        eventType: "AwsApiCall",
        readOnly: false,
        recipientAccountId: "amc",
        sourceIPAddress: record.sourceIp ?? "0.0.0.0",
        userAgent: record.userAgent ?? "amc",
        userIdentity: {
          type: "AssumedRole",
          principalId: record.actor,
          userName: record.actor
        },
        requestParameters: {
          resource: record.resource,
          details: record.details
        },
        responseElements: {
          outcome: record.outcome
        }
      }))
    };
    return payload;
  }

  const payload: AzureMonitorEvent[] = records.map((record) => ({
    TimeGenerated: record.timestamp,
    Category: "AMC.Audit",
    OperationName: record.action,
    ResultType: record.outcome === "failure" ? "Failure" : "Success",
    ResultDescription: `${record.action} ${record.resource}`,
    CallerIpAddress: record.sourceIp ?? "0.0.0.0",
    Identity: record.actor,
    ResourceId: record.resource,
    Properties: record.details
  }));
  return payload;
}

export function exportEnterpriseAuditFromRecords(params: {
  records: EnterpriseAuditRecord[];
  format: EnterpriseAuditExportFormat;
  output: string;
}): {
  format: EnterpriseAuditExportFormat;
  outputPath: string;
  eventCount: number;
  payload: EnterpriseAuditExportPayload;
} {
  const outputPath = resolve(params.output);
  const payload = buildEnterpriseAuditPayload(params.format, params.records);
  writeFileAtomic(outputPath, JSON.stringify(payload, null, 2), 0o644);
  return {
    format: params.format,
    outputPath,
    eventCount: params.records.length,
    payload
  };
}

export function collectEnterpriseAuditRecords(workspace: string, limit = 1_000): EnterpriseAuditRecord[] {
  const ledger = openLedger(workspace);
  try {
    const all = ledger.getAllEvents();
    const bounded = limit > 0 ? all.slice(Math.max(0, all.length - limit)) : all;
    return bounded.map((event) => eventToEnterpriseAuditRecord(event));
  } finally {
    ledger.close();
  }
}

export function exportEnterpriseAudit(params: {
  workspace: string;
  format: EnterpriseAuditExportFormat;
  output: string;
  limit?: number;
}): {
  format: EnterpriseAuditExportFormat;
  outputPath: string;
  eventCount: number;
  payload: EnterpriseAuditExportPayload;
} {
  const records = collectEnterpriseAuditRecords(params.workspace, params.limit ?? 1_000);
  return exportEnterpriseAuditFromRecords({
    records,
    format: params.format,
    output: params.output
  });
}
