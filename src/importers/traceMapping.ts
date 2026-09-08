/**
 * Generic row → ProductionTrace mapping for the universal importer.
 *
 * Split from neutralImporter.ts alongside the Pi v3 extension (AMC-1507) so
 * the two mappers sit side by side: this one reads the top-level keys that
 * generic trace/event rows carry; format-aware mappers (piSessionImport.ts)
 * read the shapes their format documents. Both derive from REDACTED rows.
 */
import type { ProductionTrace } from "../agents/traceIngestion.js";
import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import type { NeutralImportCategory } from "./neutralImporter.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function traceTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

export function toProductionTrace(row: Record<string, unknown>, fallback: { agentId: string; index: number; source: string }): ProductionTrace {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const error = Boolean(row.error) || typeof row.errorMessage === "string" || /error|failed|timeout|denied|blocked/i.test(String(row.status ?? row.outcome ?? ""));
  return {
    traceId: String(row.traceId ?? row.id ?? row.request_id ?? `${fallback.source}:${fallback.index}`),
    agentId: String(row.agentId ?? row.agent_id ?? fallback.agentId),
    agentType: String(row.agentType ?? row.agent_type ?? row.role ?? "imported-agent"),
    input: row.input ?? row.prompt ?? row.request ?? null,
    output: row.output ?? row.response ?? row.result ?? null,
    durationMs: Number(row.durationMs ?? row.duration_ms ?? row.latencyMs ?? 0),
    timestamp: traceTimestamp(row.timestamp ?? row.ts),
    spanCount: typeof row.spanCount === "number" ? row.spanCount : undefined,
    sessionId: typeof row.sessionId === "string" ? row.sessionId : typeof row.session_id === "string" ? row.session_id : undefined,
    error,
    errorMessage: String(row.errorMessage ?? row.error ?? row.message ?? (error ? row.status ?? "imported trace reported failure" : "")) || undefined,
    metadata: {
      ...metadata,
      tool: row.tool ?? row.toolName ?? metadata.tool,
      model: row.model ?? metadata.model,
      providerId: row.providerId ?? row.provider ?? metadata.providerId
    }
  };
}

export function tracesFromCandidate(category: NeutralImportCategory, redacted: unknown, agentId: string, source: string): Array<AMCTraceV1 | ProductionTrace> {
  if (category !== "trace-jsonl" && category !== "event-log" && category !== "run-directory") {
    return [];
  }
  if (Array.isArray(redacted)) {
    return redacted
      .filter(isRecord)
      .map((row, index) => toProductionTrace(row, { agentId, index, source }));
  }
  if (isRecord(redacted)) {
    const rows = [redacted.traces, redacted.events, redacted.runs, redacted.spans]
      .find((value): value is unknown[] => Array.isArray(value));
    if (rows) {
      return rows
        .filter(isRecord)
        .map((row, index) => toProductionTrace(row, { agentId, index, source }));
    }
  }
  return [];
}
