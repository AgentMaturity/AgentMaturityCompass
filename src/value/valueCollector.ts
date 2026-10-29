import { mean } from "../experiments/stats.js";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { openLedger } from "../ledger/ledger.js";
import type { ValueContract } from "./valueContracts.js";
import { valueEventSchema, type ValueEvent } from "./valueEventSchema.js";

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : Number(mean(values).toFixed(6));
}

function trustScopeIdHash(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  return sha256Hex(`${scopeType}:${scopeId}`).slice(0, 16);
}

function buildValueEvent(params: {
  ts: number;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  kpiId: string;
  value: number;
  unit: string;
  sourceId: string;
  eventHashes?: string[];
  receiptIds?: string[];
  runIds?: string[];
  labels?: Record<string, string>;
}): ValueEvent {
  return valueEventSchema.parse({
    v: 1,
    eventId: `ve_${randomUUID().replace(/-/g, "")}`,
    ts: params.ts,
    scope: {
      type: params.scopeType,
      idHash: trustScopeIdHash(params.scopeType, params.scopeId)
    },
    kpiId: params.kpiId,
    value: Number(params.value.toFixed(6)),
    unit: params.unit,
    source: {
      sourceId: params.sourceId,
      trustKind: "OBSERVED",
      signatureValid: true
    },
    evidenceRefs: {
      eventHashes: params.eventHashes ?? [],
      receiptIds: params.receiptIds ?? [],
      runIds: params.runIds ?? []
    },
    labels: params.labels ?? {}
  });
}

function collectCostUsd(events: ReturnType<ReturnType<typeof openLedger>["getEventsBetween"]>): {
  value: number;
  evidence: string[];
} {
  let tokens = 0;
  const evidence: string[] = [];
  for (const event of events) {
    if (event.event_type !== "llm_response") {
      continue;
    }
    const meta = parseMeta(event.meta_json);
    const usage = meta.usage;
    if (usage && typeof usage === "object") {
      const row = usage as Record<string, unknown>;
      tokens += numeric(row.total_tokens) ?? numeric(row.totalTokens) ?? 0;
      tokens += numeric(row.input_tokens) ?? numeric(row.inputTokens) ?? 0;
      tokens += numeric(row.output_tokens) ?? numeric(row.outputTokens) ?? 0;
    }
    evidence.push(event.event_hash);
  }
  const costUsd = tokens * 0.000002;
  return {
    value: Number(costUsd.toFixed(6)),
    evidence
  };
}

function collectSessionCycleHours(ledger: ReturnType<typeof openLedger>, startTs: number, endTs: number): {
  value: number | null;
  runIds: string[];
} {
  const sessions = ledger.getSessionsBetween(startTs, endTs);
  const durations = sessions
    .map((session) => {
      const end = session.ended_ts ?? session.started_ts;
      return (end - session.started_ts) / (60 * 60 * 1000);
    })
    .filter((value) => Number.isFinite(value) && value >= 0);
  return {
    value: average(durations),
    runIds: sessions.map((session) => `${session.session_id}#${session.started_ts}`)
  };
}

function countAudit(events: ReturnType<ReturnType<typeof openLedger>["getEventsBetween"]>, predicate: (auditType: string) => boolean): {
  value: number;
  evidence: string[];
} {
  const evidence: string[] = [];
  let count = 0;
  for (const event of events) {
    if (event.event_type !== "audit") {
      continue;
    }
    const meta = parseMeta(event.meta_json);
    const auditType = typeof meta.auditType === "string" ? meta.auditType : "";
    if (!predicate(auditType)) {
      continue;
    }
    count += 1;
    evidence.push(event.event_hash);
  }
  return {
    value: count,
    evidence
  };
}

function metricAverage(events: ReturnType<ReturnType<typeof openLedger>["getEventsBetween"]>, metricId: string): {
  value: number | null;
  evidence: string[];
} {
  const values: number[] = [];
  const evidence: string[] = [];
  for (const event of events) {
    const meta = parseMeta(event.meta_json);
    if (event.event_type === "metric") {
      const eventMetricId = typeof meta.metricId === "string" ? meta.metricId : "";
      if (eventMetricId !== metricId) {
        continue;
      }
      const measured = numeric(meta.value);
      if (measured !== null) {
        values.push(measured);
      }
      evidence.push(event.event_hash);
      continue;
    }
    const candidate = numeric(meta[metricId]);
    if (candidate !== null) {
      values.push(candidate);
      evidence.push(event.event_hash);
    }
  }
  return {
    value: average(values),
    evidence
  };
}

export function collectObservedValueEvents(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  contract: ValueContract;
  startTs: number;
  endTs: number;
}): ValueEvent[] {
  const ledger = openLedger(params.workspace);
  try {
    const events = ledger.getEventsBetween(params.startTs, params.endTs);
    const out: ValueEvent[] = [];

    for (const kpi of params.contract.valueContract.kpis) {
      const kpiId = kpi.kpiId;
      if (kpiId === "cost_usd") {
        const collected = collectCostUsd(events);
        out.push(
          buildValueEvent({
            ts: params.endTs,
            scopeType: params.scopeType,
            scopeId: params.scopeId,
            kpiId,
            value: collected.value,
            unit: "usd",
            sourceId: "bridge.receipts",
            eventHashes: collected.evidence
          })
        );
        continue;
      }

      if (kpiId === "cycle_time_hours" || kpiId === "resolution_time_hours" || kpiId === "review_time_hours") {
        const collected = collectSessionCycleHours(ledger, params.startTs, params.endTs);
        if (collected.value !== null) {
          out.push(
            buildValueEvent({
              ts: params.endTs,
              scopeType: params.scopeType,
              scopeId: params.scopeId,
              kpiId,
              value: collected.value,
              unit: "hours",
              sourceId: "bridge.receipts",
              runIds: collected.runIds
            })
          );
        }
        continue;
      }

      if (kpiId === "build_success_rate") {
        const success = countAudit(events, (auditType) => auditType === "BUILD_SUCCESS").value;
        const fail = countAudit(events, (auditType) => auditType === "BUILD_FAILURE").value;
        const total = success + fail;
        if (total > 0) {
          out.push(
            buildValueEvent({
              ts: params.endTs,
              scopeType: params.scopeType,
              scopeId: params.scopeId,
              kpiId,
              value: success / total,
              unit: "ratio",
              sourceId: "toolhub.receipts"
            })
          );
        }
        continue;
      }

      if (kpiId === "defects_escaped" || kpiId === "security_findings_count") {
        const collected = countAudit(events, (auditType) =>
          kpiId === "defects_escaped"
            ? auditType.includes("DEFECT")
            : auditType.includes("SECURITY") || auditType.includes("ASSURANCE_FINDING")
        );
        out.push(
          buildValueEvent({
            ts: params.endTs,
            scopeType: params.scopeType,
            scopeId: params.scopeId,
            kpiId,
            value: collected.value,
            unit: "count",
            sourceId: "toolhub.receipts",
            eventHashes: collected.evidence
          })
        );
        continue;
      }

      if (kpiId === "first_response_time_minutes") {
        const collected = metricAverage(events, "firstResponseMinutes");
        if (collected.value !== null) {
          out.push(
            buildValueEvent({
              ts: params.endTs,
              scopeType: params.scopeType,
              scopeId: params.scopeId,
              kpiId,
              value: collected.value,
              unit: "minutes",
              sourceId: "toolhub.receipts",
              eventHashes: collected.evidence
            })
          );
        }
        continue;
      }

      const collected = metricAverage(events, kpiId);
      if (collected.value !== null) {
        out.push(
          buildValueEvent({
            ts: params.endTs,
            scopeType: params.scopeType,
            scopeId: params.scopeId,
            kpiId,
            value: collected.value,
            unit: kpi.unit,
            sourceId: "toolhub.receipts",
            eventHashes: collected.evidence
          })
        );
      }
    }

    return out;
  } finally {
    ledger.close();
  }
}
