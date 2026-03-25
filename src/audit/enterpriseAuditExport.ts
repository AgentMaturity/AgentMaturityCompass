import { resolve } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import type { EvidenceEvent } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type EnterpriseAuditExportFormat = "splunk" | "datadog" | "cloudtrail" | "azure" | "elasticsearch" | "syslog";
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

export interface ElasticsearchBulkAction {
  index: {
    _index: string;
    _id: string;
  };
}

export interface ElasticsearchBulkDocument {
  "@timestamp": string;
  event: {
    id: string;
    action: string;
    outcome: EnterpriseAuditOutcome;
    category: string;
  };
  user: { id: string };
  source: { ip: string | null };
  user_agent: { original: string | null };
  resource: string;
  details: Record<string, unknown>;
}

export interface ElasticsearchBulkPayload {
  lines: readonly string[];
  documentCount: number;
}

export interface SyslogCefEvent {
  header: string;
  extension: string;
  raw: string;
}

export interface SignedAuditTrail {
  readonly version: 1;
  readonly generatedAt: string;
  readonly recordCount: number;
  readonly records: readonly EnterpriseAuditRecord[];
  readonly integrityHash: string;
  readonly chainHash: string;
}

export interface RetentionPolicy {
  readonly maxAgeDays: number;
  readonly maxRecords: number;
}

export type EnterpriseAuditExportPayload =
  | SplunkHecEvent[]
  | DatadogLogEvent[]
  | CloudTrailExportPayload
  | AzureMonitorEvent[]
  | ElasticsearchBulkPayload
  | SyslogCefEvent[];

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

  if (format === "elasticsearch") {
    const lines: string[] = [];
    for (const record of records) {
      const action: ElasticsearchBulkAction = {
        index: { _index: "amc-audit", _id: record.eventId }
      };
      const doc: ElasticsearchBulkDocument = {
        "@timestamp": record.timestamp,
        event: {
          id: record.eventId,
          action: record.action,
          outcome: record.outcome,
          category: "audit"
        },
        user: { id: record.actor },
        source: { ip: record.sourceIp },
        user_agent: { original: record.userAgent },
        resource: record.resource,
        details: record.details
      };
      lines.push(JSON.stringify(action));
      lines.push(JSON.stringify(doc));
    }
    const payload: ElasticsearchBulkPayload = {
      lines,
      documentCount: records.length
    };
    return payload;
  }

  if (format === "syslog") {
    const payload: SyslogCefEvent[] = records.map((record) => {
      const severity = record.outcome === "failure" ? 7 : 3;
      const header = `CEF:0|AMC|AgentMaturityCompass|1.0|${record.action}|${record.action}|${severity}|`;
      const extension = [
        `rt=${record.timestamp}`,
        `src=${record.sourceIp ?? "0.0.0.0"}`,
        `suser=${record.actor}`,
        `cs1=${record.resource}`,
        `cs1Label=resource`,
        `outcome=${record.outcome}`
      ].join(" ");
      return {
        header,
        extension,
        raw: `${header}${extension}`
      };
    });
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

function computeChainHash(records: readonly EnterpriseAuditRecord[]): string {
  let chain = "genesis";
  for (const record of records) {
    chain = sha256Hex(`${chain}:${record.eventId}:${record.ts}:${record.action}`);
  }
  return chain;
}

export function buildSignedAuditTrail(records: readonly EnterpriseAuditRecord[]): SignedAuditTrail {
  const sorted = [...records].sort((a, b) => a.ts - b.ts);
  const integrityHash = sha256Hex(JSON.stringify(sorted));
  const chainHash = computeChainHash(sorted);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    recordCount: sorted.length,
    records: sorted,
    integrityHash,
    chainHash
  };
}

export function verifyAuditTrailIntegrity(trail: SignedAuditTrail): {
  valid: boolean;
  errors: readonly string[];
} {
  const errors: string[] = [];
  const expectedIntegrity = sha256Hex(JSON.stringify(trail.records));
  if (expectedIntegrity !== trail.integrityHash) {
    errors.push("integrity hash mismatch — records may have been tampered with");
  }

  const expectedChain = computeChainHash(trail.records);
  if (expectedChain !== trail.chainHash) {
    errors.push("chain hash mismatch — record ordering or content altered");
  }

  if (trail.recordCount !== trail.records.length) {
    errors.push(`record count mismatch: header says ${trail.recordCount}, found ${trail.records.length}`);
  }

  return { valid: errors.length === 0, errors };
}

export function applyRetentionPolicy(
  records: readonly EnterpriseAuditRecord[],
  policy: RetentionPolicy,
  now?: Date
): readonly EnterpriseAuditRecord[] {
  const nowMs = (now ?? new Date()).getTime();
  const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;

  const filtered = records.filter((r) => (nowMs - r.ts) <= maxAgeMs);
  if (filtered.length <= policy.maxRecords) {
    return filtered;
  }

  const sorted = [...filtered].sort((a, b) => b.ts - a.ts);
  return sorted.slice(0, policy.maxRecords);
}
