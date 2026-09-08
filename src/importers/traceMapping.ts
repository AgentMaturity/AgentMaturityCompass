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

export function traceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8.64e15) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]!) return null;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function duration(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function toProductionTrace(row: Record<string, unknown>, fallback: { agentId: string; index: number; source: string }): ProductionTrace {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const error = Boolean(row.error) || typeof row.errorMessage === "string" || /error|failed|timeout|denied|blocked/i.test(String(row.status ?? row.outcome ?? ""));
  const sourceTime = row.timestamp ?? row.ts;
  const sourceDuration = row.durationMs ?? row.duration_ms ?? row.latencyMs;
  const timestamp = traceTimestamp(sourceTime);
  const durationMs = duration(sourceDuration);
  return {
    traceId: String(row.traceId ?? row.id ?? row.request_id ?? `${fallback.source}:${fallback.index}`),
    agentId: String(row.agentId ?? row.agent_id ?? fallback.agentId),
    agentType: String(row.agentType ?? row.agent_type ?? row.role ?? "imported-agent"),
    input: row.input ?? row.prompt ?? row.request ?? null,
    output: row.output ?? row.response ?? row.result ?? null,
    durationMs,
    timestamp,
    spanCount: typeof row.spanCount === "number" ? row.spanCount : undefined,
    sessionId: typeof row.sessionId === "string" ? row.sessionId : typeof row.session_id === "string" ? row.session_id : undefined,
    error,
    errorMessage: String(row.errorMessage ?? row.error ?? row.message ?? (error ? row.status ?? "imported trace reported failure" : "")) || undefined,
    metadata: {
      ...metadata,
      timeProvenance: {
        timestamp: timestamp !== null ? "source" : sourceTime == null ? "absent" : "invalid",
        duration: durationMs !== null ? "source" : sourceDuration == null ? "absent" : "invalid",
        inferredDuration: false
      },
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
