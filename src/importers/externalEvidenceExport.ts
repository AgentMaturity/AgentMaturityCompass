import type { ProductionTrace } from "../agents/traceIngestion.js";
import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import type { NeutralImportCandidate } from "./neutralImporter.js";
import { createImportedExternalEvidence, type ExternalEvidenceEvent, type ExternalEvidenceProfile } from "../standard/externalEvidenceProfile.js";

/** A bounded, operational projection; redacted source artifacts remain the fuller source of record. */
export function neutralExternalEvidenceProfiles(input: {
  candidate: NeutralImportCandidate;
  traces: Array<ProductionTrace | AMCTraceV1>;
  ingestedAt: string;
}): ExternalEvidenceProfile[] {
  const { candidate } = input;
  const chunks = Math.max(1, Math.ceil(input.traces.length / 1000));
  return Array.from({ length: chunks }, (_, chunk) => {
    const losses = [
      "This is an operational trace projection. The retained redacted source contains fields omitted here.",
      "Trace aggregation does not establish individual tool-call/result pairing or causal parents. No such edges are inferred.",
      "Session grouping identifies this source projection. Original session identities, when present, are attributes, not verified ancestry.",
      "Payload contents, nested metadata, usage and cost are omitted. Import completion does not measure task success or maturity."
    ];
    if (candidate.redactionCount > 0) losses.push("Known sensitive source fields were redacted before normalization.");
    if (chunks > 1) losses.push(`The source projection is split into ${chunks} independently bounded parts without inferred cross-part ancestry.`);
    let precisionLoss = false;
    const events: ExternalEvidenceEvent[] = input.traces.slice(chunk * 1000, (chunk + 1) * 1000).map((trace, offset) => {
      const attributes: ExternalEvidenceEvent["attributes"] = {};
      const keep = (name: string, value: unknown) => {
        if (typeof value === "string") {
          // Avoid sliced surrogate pairs and any caller-supplied malformed Unicode.
          const bounded = Array.from(value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, "\uFFFD")).slice(0, 1024).join("");
          attributes[name] = bounded;
          if (bounded !== value) precisionLoss = true;
        } else if (typeof value === "boolean" || (typeof value === "number" && Number.isSafeInteger(value))) attributes[name] = value;
      };
      const raw = trace as unknown as Record<string, unknown>;
      keep("sourceTraceId", raw.traceId); keep("sourceSessionId", raw.sessionId);
      keep("agentId", raw.agentId); keep("agentType", raw.agentType);
      const metadata = "metadata" in trace ? trace.metadata : null;
      const meta = metadata !== null && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
      for (const key of ["entryType", "entryId", "parentId", "role", "stopReason", "sourceFormat", "onCurrentPath", "ancestryComplete", "status", "settlement", "rejectionKind"])
        keep(`source.${key}`, meta[key]);
      const callback = meta.callbackTelemetry !== null && typeof meta.callbackTelemetry === "object" ? meta.callbackTelemetry as Record<string, unknown> : {};
      for (const key of ["spanId", "parentSpanId", "settlement", "rejectionKind", "cancelled", "outcome"])
        keep(`callback.${key}`, callback[key]);
      const time = "timestamp" in trace ? trace.timestamp : trace.ts;
      const date = typeof time === "number" && Number.isSafeInteger(time) && time >= 0 && time <= 253402300799999 ? new Date(time) : null;
      if (time !== null && time !== undefined && date === null) precisionLoss = true;
      const ms = "durationMs" in trace ? trace.durationMs : null;
      const ns = typeof ms === "number" ? ms * 1_000_000 : null;
      const durationNs = ns !== null && Number.isSafeInteger(ns) && ns >= 0 ? ns : null;
      if (ns !== null && durationNs === null) precisionLoss = true;
      const cancelled = callback.cancelled === true || meta.rejectionKind === "AbortError" || meta.status === "cancelled" || meta.stopReason === "aborted";
      const failed = "error" in trace && trace.error === true;
      return {
        id: `trace-${chunk * 1000 + offset}`, parentId: null, toolCallId: null,
        kind: cancelled ? "cancel" : failed ? "error" : "metadata",
        outcome: cancelled ? "cancelled" : failed ? "failure" : "unknown",
        sourceTime: date?.toISOString() ?? null, durationNs, cost: null, attributes
      };
    });
    if (precisionLoss) losses.push("Some operational strings were bounded or malformed Unicode replaced; durations not exactly representable as safe integer nanoseconds remain null.");
    return createImportedExternalEvidence({
      source: { producer: candidate.sourceFormat?.name ?? "neutral-artifact", version: String(candidate.sourceFormat?.version ?? "unversioned"),
        originalSha256: candidate.digest, mediaType: candidate.format === "jsonl" ? "application/x-ndjson" : candidate.format === "yaml" ? "application/yaml" : "application/json" },
      session: { id: `import:${candidate.digest}:${chunk}`, parentSessionId: null },
      normalizer: "amc-neutral-external/1", ingestedAt: input.ingestedAt, losses, events
    });
  });
}
