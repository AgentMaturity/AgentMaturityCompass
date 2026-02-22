import { randomUUID } from 'node:crypto';
import { readGuardEvents } from '../enforce/evidenceEmitter.js';

export interface AuditEvent {
  eventId: string;
  timestamp: Date;
  actor: string;
  action: string;
  resource: string;
  outcome: string;
  severity: string;
  metadata?: Record<string, unknown>;
}

export interface SiemExportResult { formatted: string; format: string; byteSize: number; eventId: string; }
export interface SiemBatchResult { results: SiemExportResult[]; totalBytes: number; format: string; count: number; }

const severityToNum: Record<string, number> = {
  low: 3, medium: 5, high: 7, critical: 10, info: 1, warning: 5,
};

function formatCef(event: AuditEvent): string {
  const sev = severityToNum[event.severity.toLowerCase()] ?? 5;
  return `CEF:0|AMC|AgentWatch|1.0|${event.action}|${event.action}|${sev}|src=${event.actor} dst=${event.resource} outcome=${event.outcome}`;
}

function formatLeef(event: AuditEvent): string {
  return `LEEF:2.0|AMC|AgentWatch|1.0|${event.action}|src=${event.actor}\tdst=${event.resource}\tsev=${event.severity}`;
}

function formatJsonLd(event: AuditEvent): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SecurityEvent',
    eventId: event.eventId,
    timestamp: event.timestamp.toISOString(),
    actor: event.actor,
    action: event.action,
    resource: event.resource,
    outcome: event.outcome,
    severity: event.severity,
    metadata: event.metadata ?? {},
  });
}

export function exportEvent(event: AuditEvent, format: 'cef' | 'leef' | 'json-ld'): SiemExportResult {
  let formatted: string;
  switch (format) {
    case 'cef': formatted = formatCef(event); break;
    case 'leef': formatted = formatLeef(event); break;
    case 'json-ld': formatted = formatJsonLd(event); break;
  }
  return { formatted, format, byteSize: Buffer.byteLength(formatted, 'utf8'), eventId: event.eventId };
}

export function exportBatch(events: AuditEvent[], format: 'cef' | 'leef' | 'json-ld'): SiemBatchResult {
  const results = events.map(e => exportEvent(e, format));
  return { results, totalBytes: results.reduce((s, r) => s + r.byteSize, 0), format, count: results.length };
}

/** Backward-compatible wrapper */
export function exportToSiem(events: Array<{ action: string; risk: string }>, format?: string) {
  const fmt = format ?? 'splunk';
  return {
    events: events.map(e => ({ eventId: randomUUID(), category: e.action, severity: e.risk, timestamp: new Date() })),
    format: fmt,
    exported: true,
  };
}

/** MITRE ATT&CK category mapping */
export enum MITRECategory {
  execution = 'execution',
  credential_access = 'credential_access',
  exfiltration_risk = 'exfiltration_risk',
  defense_evasion = 'defense_evasion',
  lateral_movement = 'lateral_movement',
}

const MODULE_MITRE_MAP: Record<string, MITRECategory> = {
  E1: MITRECategory.execution,
  E2: MITRECategory.execution,
  E3: MITRECategory.credential_access,
  E4: MITRECategory.credential_access,
  E7: MITRECategory.defense_evasion,
  E10: MITRECategory.exfiltration_risk,
  S1: MITRECategory.execution,
  S2: MITRECategory.defense_evasion,
  S3: MITRECategory.lateral_movement,
};

function parseMetaJson(metaJson: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function mapToMITRE(moduleCode: string, _decision: string): MITRECategory {
  return MODULE_MITRE_MAP[moduleCode] ?? MITRECategory.execution;
}

/** Splunk HEC JSON format */
export function exportSplunk(events: AuditEvent[]): string {
  return events.map(e => JSON.stringify({
    time: Math.floor(e.timestamp.getTime() / 1000),
    sourcetype: 'amc:guard',
    event: {
      eventId: e.eventId,
      actor: e.actor,
      action: e.action,
      resource: e.resource,
      outcome: e.outcome,
      severity: e.severity,
      mitre: mapToMITRE(e.action, e.outcome),
      metadata: e.metadata ?? {},
    },
  })).join('\n');
}

/** Elastic ECS format */
export function exportElastic(events: AuditEvent[]): string {
  return events.map(e => JSON.stringify({
    '@timestamp': e.timestamp.toISOString(),
    event: { id: e.eventId, action: e.action, outcome: e.outcome, severity: severityToNum[e.severity.toLowerCase()] ?? 5 },
    agent: { name: e.actor },
    destination: { address: e.resource },
    threat: { technique: { name: mapToMITRE(e.action, e.outcome) } },
    labels: e.metadata ?? {},
  })).join('\n');
}

/** JSONL — one JSON object per line */
export function exportJsonl(events: AuditEvent[]): string {
  return events.map(e => JSON.stringify({
    eventId: e.eventId,
    timestamp: e.timestamp.toISOString(),
    actor: e.actor,
    action: e.action,
    resource: e.resource,
    outcome: e.outcome,
    severity: e.severity,
    metadata: e.metadata ?? {},
  })).join('\n');
}

/** Read recent guard events from SQLite and convert to AuditEvent[] */
export function readRecentGuardEvents(windowHours: number): AuditEvent[] {
  const rows = readGuardEvents(undefined, windowHours);
  return rows.map(r => ({
    eventId: r.id,
    timestamp: new Date(r.created_at),
    actor: r.agent_id,
    action: r.module_code,
    resource: r.module_code,
    outcome: r.decision,
    severity: r.severity,
    metadata: r.meta_json ? parseMetaJson(r.meta_json) : undefined,
  }));
}
