import { z } from "zod";
import { bindingSchema, contextFor, identifier, invalidInput, outcome, sameBinding, utcTime, type OracleOutcome } from "./protocol.js";

const schema = z.object({ context: contextFor("L1-EDU-02"), at: utcTime, logAvailable: z.boolean(), registryAvailable: z.boolean(),
  tools: z.array(z.object({ binding: bindingSchema, toolId: identifier, toolVersion: identifier,
    capabilityClass: z.enum(["transcript_summary", "exam_proctoring", "emotion_inference"]).nullable() }).strict()).max(1000),
  requests: z.array(z.object({ binding: bindingSchema, toolId: identifier, toolVersion: identifier,
    source: z.enum(["lecture_transcript", "classroom_video", "exam_proctoring_stream"]) }).strict()).min(1).max(1000) }).strict();

/** Actual local execution log for an atomic fixture batch, distinct from attempted/refused capabilities. */
export function runCapabilityLog(input: unknown): OracleOutcome {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  const attemptedCalls = structuredClone(value.requests);
  const finish = (result: OracleOutcome["result"], reason: string) => outcome(result, reason, { attemptedCalls, capabilityLog: [] });
  if (!value.logAvailable) return finish("not_evaluated", "capability_log_unavailable");
  if (!value.registryAvailable) return finish("not_evaluated", "capability_registry_unavailable");
  if (value.tools.some(tool => !sameBinding(value.context, tool.binding))
    || value.requests.some(request => !sameBinding(value.context, request.binding))) return finish("deny", "binding_mismatch");
  const capabilityLog: Array<{ toolId: string; toolVersion: string; capabilityClass: string; source: string }> = [];
  for (const request of value.requests) {
    const registered = value.tools.filter(tool => tool.toolId === request.toolId && tool.toolVersion === request.toolVersion);
    if (registered.length !== 1 || registered[0]!.capabilityClass === null) return finish("not_evaluated", "capability_unresolved");
    const capabilityClass = registered[0]!.capabilityClass;
    if (capabilityClass === "emotion_inference") return finish("deny", "emotion_inference_refused");
    capabilityLog.push({ toolId: request.toolId, toolVersion: request.toolVersion, capabilityClass, source: request.source });
  }
  return outcome("allow", "non_affect_capabilities_only", { attemptedCalls, capabilityLog }, capabilityLog.map(row => "execute_capability:" + row.toolId + ":" + row.capabilityClass));
}
