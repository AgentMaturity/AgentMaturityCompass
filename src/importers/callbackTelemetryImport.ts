/** Strict callback format import. Local signatures cannot upgrade source-reported telemetry. */
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { callbackTelemetryDocumentSchema, type CallbackSpanRecord, type CallbackTelemetryDocument } from "./callbackTelemetryContract.js";

export interface ParsedCallbackTelemetry {
  document: CallbackTelemetryDocument;
  format: { name: "callback-telemetry"; version: 1; mappingVersion: 1; captureId: string; spanCount: number;
    pendingSpans: number; missingParents: number; sourceTrust: "SELF_REPORTED" };
}
export function parseCallbackTelemetry(value: unknown): ParsedCallbackTelemetry {
  const parsed = callbackTelemetryDocumentSchema.safeParse(value);
  if (!parsed.success) throw new Error("Unsupported or malformed AMC callback telemetry document; no generic fallback is permitted.");
  const document = parsed.data, byId = new Map<string, CallbackSpanRecord>();
  const ends = new Set<number>();
  for (const span of document.spans) {
    if (!span.id.startsWith(`${document.captureId}:`) || !/^\d+$/.test(span.id.slice(document.captureId.length + 1)) || byId.has(span.id)) {
      throw new Error("Callback telemetry contains ambiguous span identities.");
    }
    const terminal = span.settlement === "fulfilled" || span.settlement === "rejected";
    if ((span.settlement === "rejected") !== (span.rejectionKind !== null)) throw new Error("Callback rejection metadata disagrees with settlement.");
    if (terminal !== (span.endSequence !== null) || (span.endSequence !== null && ends.has(span.endSequence))) {
      throw new Error("Callback telemetry has inconsistent settlement sequence metadata.");
    }
    if (span.endSequence !== null) ends.add(span.endSequence);
    byId.set(span.id, span);
  }
  const visited = new Set<string>();
  for (const span of document.spans) {
    const path = new Set<string>(); let current: string | null = span.id;
    while (current !== null && byId.has(current) && !visited.has(current)) {
      if (path.has(current)) throw new Error("Callback telemetry contains cyclic ancestry.");
      path.add(current); current = byId.get(current)!.parentId;
    }
    for (const id of path) visited.add(id);
  }
  return { document, format: { name: "callback-telemetry", version: 1, mappingVersion: 1, captureId: document.captureId,
    spanCount: document.spans.length, pendingSpans: document.spans.filter(span => ["pending", "closed-before-settlement"].includes(span.settlement)).length,
    missingParents: document.spans.filter(span => span.parentId !== null && !byId.has(span.parentId)).length, sourceTrust: "SELF_REPORTED" } };
}
/** null means another format. A recognized unsupported version always throws. */
export function parseDetectedCallbackTelemetry(text: string): ParsedCallbackTelemetry | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch {
    if (/"format"\s*:\s*"amc-callback-telemetry"/.test(text)) throw new Error("Malformed callback telemetry document.");
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value) || (value as { format?: unknown }).format !== "amc-callback-telemetry") return null;
  return parseCallbackTelemetry(value);
}
export function callbackTelemetryWarnings(parsed: ParsedCallbackTelemetry): string[] {
  return [...parsed.document.losses,
    ...(parsed.format.pendingSpans ? [`${parsed.format.pendingSpans} callback spans have no final source outcome.`] : []),
    ...(parsed.format.missingParents ? [`${parsed.format.missingParents} parent spans are absent from this batch; lineage is incomplete.`] : []),
    "Callback telemetry is SELF_REPORTED and NOT_EVALUATED; import or artifact signing supplies no independent observation."];
}
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
export function callbackTelemetryTraces(parsed: ParsedCallbackTelemetry, agentId: string): ProductionTrace[] {
  return parsed.document.spans.map(span => {
    const attrs = span.attributes, pending = ["pending", "closed-before-settlement"].includes(span.settlement);
    const outcome = string(attrs["pi.operation.outcome"] ?? attrs["pi.step.outcome"] ?? attrs["pi.ai.response.stop_reason"] ?? attrs["pi.sleep.outcome"]);
    const cancelled = outcome === "aborted" || span.rejectionKind === "aborted";
    const failed = span.settlement === "rejected" || span.status.status === "error" || attrs["pi.tool.is_error"] === true
      || ["error", "failed", "aborted"].includes(outcome ?? "");
    const usage = Object.fromEntries(["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens", "cost"]
      .map(name => [name, number(attrs[`pi.ai.usage.${name}`])]));
    return { traceId: `callback:${span.id}`, agentId, agentType: "imported-callback-telemetry", input: null, output: null,
      timestamp: span.timestamp, durationMs: span.durationMs,
      ...(string(attrs["pi.session.id"]) === undefined ? {} : { sessionId: String(attrs["pi.session.id"]) }),
      ...(pending && !failed ? {} : { error: failed }),
      ...(failed ? { errorMessage: cancelled ? "source callback reported cancellation" : "source callback reported failure" } : {}),
      metadata: { sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED", sourceFormat: parsed.format,
        callbackTelemetry: { captureId: parsed.document.captureId, spanId: span.id, parentSpanId: span.parentId,
          name: span.name, attributes: attrs, events: span.events, status: span.status, explicitStatus: span.explicitStatus,
          settlement: span.settlement, rejectionKind: span.rejectionKind, endSequence: span.endSequence, cancelled,
          outcome: outcome ?? (pending ? "unknown" : span.name.startsWith("pi.event.") ? "event-delivered" : span.settlement),
          passiveEvent: span.name.startsWith("pi.event."), usageAggregation: "not-aggregated-may-overlap-parent-or-event-reports" },
        usage, providerId: string(attrs["pi.ai.provider"]), model: string(attrs["pi.ai.response.model"] ?? attrs["pi.ai.model"]), tool: string(attrs["pi.tool.name"]),
        timeProvenance: { timestamp: span.timestamp === null ? "absent-or-invalid" : "source", duration: span.durationMs === null ? "absent-or-invalid" : "source",
          inferredDuration: false, captureTime: parsed.document.recordedAt },
        normalizationLosses: callbackTelemetryWarnings(parsed) }
    };
  });
}
