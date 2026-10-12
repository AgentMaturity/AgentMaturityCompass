import { z } from "zod";
import { openLedger, hashBinaryOrPath } from "../ledger/ledger.js";
import { redactBridgeText } from "./bridgeRedaction.js";
import { redactJsonLeaves } from "../dataflow/detectors.js";

export const bridgeTelemetryEventSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(["agent_process_started", "agent_stdout", "agent_stderr", "agent_process_exited"]),
  payload: z.union([z.string(), z.record(z.string(), z.unknown())]),
  correlationId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  provider: z.string().min(1).optional()
});

export type BridgeTelemetryEvent = z.infer<typeof bridgeTelemetryEventSchema>;

export function appendBridgeTelemetryEvent(params: {
  workspace: string;
  agentId: string;
  event: BridgeTelemetryEvent;
}): { eventId: string; sessionId: string } {
  const ledger = openLedger(params.workspace);
  try {
    const sessionId = params.event.sessionId;
    try {
      ledger.startSession({
        sessionId,
        runtime: "any",
        binaryPath: "amc-wrap",
        binarySha256: hashBinaryOrPath("amc-wrap", "1")
      });
    } catch {
      // Session already exists; continue append flow.
    }
    if (params.event.eventType === "agent_stdout" || params.event.eventType === "agent_stderr") {
      const text = typeof params.event.payload === "string" ? params.event.payload : JSON.stringify(params.event.payload);
      const eventId = ledger.appendEvidence({
        sessionId,
        runtime: "any",
        eventType: params.event.eventType,
        payload: redactBridgeText(text),
        payloadExt: "txt",
        inline: false,
        meta: {
          trustTier: "OBSERVED",
          agentId: params.agentId,
          correlationId: params.event.correlationId ?? null,
          runId: params.event.runId ?? null,
          provider: params.event.provider ?? null
        }
      });
      return { eventId, sessionId };
    }

    // Object payloads too (amc wrap's agent_process_started carries the wrapped command's arguments): every key and leaf.
    const payloadObj = typeof params.event.payload === "string" ? { message: redactBridgeText(params.event.payload) }
      : redactJsonLeaves(params.event.payload, redactBridgeText);
    const eventId = ledger.appendEvidence({
      sessionId,
      runtime: "any",
      eventType: params.event.eventType,
      payload: JSON.stringify(payloadObj),
      payloadExt: "json",
      inline: false,
      meta: {
        trustTier: "OBSERVED",
        agentId: params.agentId,
        correlationId: params.event.correlationId ?? null,
        runId: params.event.runId ?? null,
        provider: params.event.provider ?? null
      }
    });
    if (params.event.eventType === "agent_process_exited") {
      ledger.sealSession(sessionId);
    }
    return { eventId, sessionId };
  } finally {
    ledger.close();
  }
}
