import { verifyReceipt } from "../receipts/receipt.js";
import type { ParsedEvidenceEvent } from "../diagnostic/gates.js";
import { parseTraceLines } from "./traceSchema.js";

export type CorrelationAuditType =
  | "TRACE_RECEIPT_INVALID"
  | "TRACE_EVENT_HASH_NOT_FOUND"
  | "TRACE_BODY_HASH_MISMATCH"
  | "TRACE_AGENT_MISMATCH"
  | "TRACE_CORRELATION_LOW";

export interface CorrelationIssue {
  auditType: CorrelationAuditType;
  severity: "LOW" | "MED" | "HIGH" | "CRITICAL";
  message: string;
  relatedEventIds: string[];
}

export interface CorrelationMetrics {
  totalTraces: number;
  totalTracesWithReceipt: number;
  tracesWithoutReceipt: number;
  validReceipts: number;
  invalidReceipts: number;
  unmatchedReceipts: number;
  mismatchedAgentId: number;
  bodyHashMismatches: number;
  unknownAgentReceipts: number;
  correlationRatio: number;
  issues: CorrelationIssue[];
}

/**
 * The event types that carry an observed process's own output.
 *
 * Two vocabularies, because two observation generations write them and P5.3
 * deliberately kept both: `wrap`/`supervise` emit `stdout`/`stderr`
 * (../ledger/monitor.ts), while `amc adapters run` — the entry point P5.3 made
 * the supported one — emits `agent_stdout`/`agent_stderr`
 * (../adapters/adapterRunner.ts). This filter listed only the first pair, so the
 * supported path contributed no traces at all and its `correlationRatio` was
 * structurally zero, which is a precondition for OBSERVED_HARDENED in
 * `runTrustTier` (../forecast/forecastSignals.ts).
 *
 * It stays a whitelist rather than "any row with text": counting every row would
 * let a payload that merely quotes a trace line inflate the denominator.
 */
const TRACE_SOURCE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "stdout",
  "stderr",
  "agent_stdout",
  "agent_stderr"
]);

function traceSourceEvents(events: ParsedEvidenceEvent[]): ParsedEvidenceEvent[] {
  return events.filter((event) => TRACE_SOURCE_EVENT_TYPES.has(event.event_type));
}

export function correlateTracesAgainstEvidence(params: {
  events: ParsedEvidenceEvent[];
  monitorPublicKeys: string[];
  expectedAgentId: string;
}): CorrelationMetrics {
  const sourceEvents = traceSourceEvents(params.events);
  const eventByHash = new Map<string, ParsedEvidenceEvent>();
  for (const event of params.events) {
    eventByHash.set(event.event_hash, event);
  }

  const issues: CorrelationIssue[] = [];
  let totalTraces = 0;
  let totalTracesWithReceipt = 0;
  let tracesWithoutReceipt = 0;
  let validReceipts = 0;
  let invalidReceipts = 0;
  let unmatchedReceipts = 0;
  let mismatchedAgentId = 0;
  let bodyHashMismatches = 0;
  let unknownAgentReceipts = 0;

  for (const sourceEvent of sourceEvents) {
    const traces = parseTraceLines(sourceEvent.text);
    for (const trace of traces) {
      totalTraces += 1;
      if (!trace.receipt || trace.receipt.trim().length === 0) {
        tracesWithoutReceipt += 1;
        continue;
      }

      totalTracesWithReceipt += 1;
      let traceIsValid = true;
      const verified = verifyReceipt(trace.receipt, params.monitorPublicKeys);
      if (!verified.ok || !verified.payload) {
        traceIsValid = false;
        issues.push({
          auditType: "TRACE_RECEIPT_INVALID",
          severity: "HIGH",
          message: `Trace receipt signature invalid: ${verified.error ?? "unknown error"}`,
          relatedEventIds: [sourceEvent.id]
        });
      }

      if (verified.ok && verified.payload) {
        const payload = verified.payload;
        const matchedEvent = eventByHash.get(payload.event_hash);
        if (!matchedEvent) {
          traceIsValid = false;
          unmatchedReceipts += 1;
          issues.push({
            auditType: "TRACE_EVENT_HASH_NOT_FOUND",
            severity: "HIGH",
            message: "Trace receipt references an event hash that does not exist in the verified ledger window.",
            relatedEventIds: [sourceEvent.id]
          });
        } else {
          if (payload.body_sha256 !== matchedEvent.payload_sha256) {
            traceIsValid = false;
            bodyHashMismatches += 1;
            issues.push({
              auditType: "TRACE_BODY_HASH_MISMATCH",
              severity: "HIGH",
              message: "Trace receipt body hash does not match ledger payload hash.",
              relatedEventIds: [sourceEvent.id, matchedEvent.id]
            });
          }
          if (payload.agentId === "unknown") {
            unknownAgentReceipts += 1;
          } else if (payload.agentId !== trace.agentId) {
            traceIsValid = false;
            mismatchedAgentId += 1;
            issues.push({
              auditType: "TRACE_AGENT_MISMATCH",
              severity: "HIGH",
              message: `Trace agentId '${trace.agentId}' does not match receipt agentId '${payload.agentId}'.`,
              relatedEventIds: [sourceEvent.id, matchedEvent.id]
            });
          }
        }
      }

      if (traceIsValid) {
        validReceipts += 1;
      } else {
        invalidReceipts += 1;
      }
    }
  }

  const correlationRatio = validReceipts / Math.max(1, totalTracesWithReceipt);
  if (totalTracesWithReceipt > 0 && correlationRatio < 0.9) {
    issues.push({
      auditType: "TRACE_CORRELATION_LOW",
      severity: "HIGH",
      message: `Trace correlation ratio ${correlationRatio.toFixed(3)} is below 0.90 threshold.`,
      relatedEventIds: []
    });
  }

  if (params.expectedAgentId !== "default" && unknownAgentReceipts > 0) {
    issues.push({
      auditType: "TRACE_AGENT_MISMATCH",
      severity: "MED",
      message: `Found ${unknownAgentReceipts} receipt(s) with agentId='unknown'; agent attribution is weak for this window.`,
      relatedEventIds: []
    });
  }

  return {
    totalTraces,
    totalTracesWithReceipt,
    tracesWithoutReceipt,
    validReceipts,
    invalidReceipts,
    unmatchedReceipts,
    mismatchedAgentId,
    bodyHashMismatches,
    unknownAgentReceipts,
    correlationRatio,
    issues
  };
}
