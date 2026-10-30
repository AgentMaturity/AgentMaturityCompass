/** Independent DSH v4 import profile; historical v2 payloads are never migrated. */
import { z } from "zod";
import { dshHeaderSchema, dshEventSchema, record, summarizeDshStream, validateDshPayload } from "./dshSessionContract.js";
import { SourceFormatError } from "./sourceFormatError.js";

export const DSH_SOURCE_REVISION_V4 = "22ddee3792402c3e70ec5f86a63c3e3e895a2f60";
const count = z.number().refine(value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0));
export const dshHeaderSchemaV4 = dshHeaderSchema.extend({ version: z.literal(4) });
export const dshEventSchemaV4 = dshEventSchema.extend({
  // Unknown ignorable records may contain opaque JSON payloads.
  data: z.unknown(),
  surfaceOp: z.union([z.literal("append"), z.object({ op: z.literal("replace"), startSeq: count, endSeq: count }).strict()]).optional()
});
export type DshHeaderV4 = z.infer<typeof dshHeaderSchemaV4>;
export type DshEventV4 = z.infer<typeof dshEventSchemaV4>;

// Pinned packages/core/session/src/known-event-types.ts. No names borrowed from v2.
export const DSH_KNOWN_EVENTS_V4 = new Set([
  "agent-preset/selected", "agent/inbox/spliced", "approval/asked", "approval/decided", "approval/policy",
  "assistant/attempt", "assistant/message", "command/done", "command/run", "compaction/end", "compaction/prune",
  "compaction/start", "compaction/summary", "deliverables/presented", "developer/message", "feedback/message-delete",
  "feedback/message-put", "feedback/record", "goal/change", "hook/invoked", "hook/result", "image/offload",
  "job/registered", "job/settled", "llm/retry", "llm/retry-started", "model/selection", "permission/preset", "plan/mode",
  "request/context", "request/header", "sandbox/mode", "schedule/change", "session-log-deepseek/delivery-accepted",
  "session/end-seed", "session/title", "session/title-llm-request", "step/end", "step/start", "subagent/catalog",
  "subagent/descriptor", "subagent/model-selection-policy", "system/message", "team/member", "team/message/delivered",
  "team/message/queued", "team/task", "todo/write", "tool-workflow/agent-end", "tool-workflow/agent-start",
  "tool-workflow/run-end", "tool-workflow/run-start", "tool/call", "tool/ptc-dispatch", "tool/ptc-dispatch-start",
  "tool/result", "turn/end", "turn/start", "user/message", "web/deepseek-search-llm-request", "working-directory/change", "workspace/changes"
]);
export const DSH_SURFACE_EVENTS_V4 = new Set(["system/message", "developer/message", "user/message", "assistant/message", "tool/result"]);
export function refuseDshV4(message: string): never {
  throw new SourceFormatError(`DSH v4 session import refused: ${message}`, { code: "DSH_SESSION_REFUSED", format: "dsh-session",
    detectedVersion: 4, supported: "dsh-session v4", sourceRevision: DSH_SOURCE_REVISION_V4 });
}
export function requireDshV4(ok: unknown, message: string): asserts ok { if (!ok) refuseDshV4(message); }
function dshV4Message(value: unknown, role: string): Record<string, unknown> {
  requireDshV4(record(value) && value.role === role && typeof value.id === "string" && value.id.length > 0
    && Array.isArray(value.content) && record(value.source) && typeof value.source.kind === "string"
    && value.source.kind.length > 0 && value.source.kind !== "plugin", `malformed ${role}-role message or producer source.`);
  requireDshV4(!(value.content as unknown[]).some(block => record(block) && block.type === "tool-result"), "retired tool-result wrapper.");
  return value;
}

/** Validate only admitted operational projections; other known payloads remain opaque context. */
export function validateDshPayloadV4(event: DshEventV4): void {
  requireDshV4(record(event.data), `malformed known event data at seq ${event.seq}.`);
  const d = event.data;
  if (["assistant/attempt", "system/message", "developer/message"].includes(event.type)) {
    requireDshV4(count.safeParse(d.turn).success && count.safeParse(d.step).success
      && (event.type === "assistant/attempt" || ((d.turn as number) > 0 && (d.step as number) > 0)), "malformed v4 turn/step identity.");
  }
  if (event.type === "tool/result") {
    requireDshV4(count.safeParse(d.turn).success && count.safeParse(d.step).success, "malformed tool turn/step identity.");
    const msg = dshV4Message(d.message, "tool"), source = msg.source as Record<string, unknown>;
    requireDshV4(typeof msg.toolCallId === "string" && msg.toolCallId.length > 0 && source.kind === "tool" && source.callId === msg.toolCallId, "tool-role result correlation mismatch.");
    requireDshV4(msg.isError === undefined || typeof msg.isError === "boolean", "malformed tool-role error flag.");
    requireDshV4(d.error === undefined || (msg.isError === true && record(d.error) && typeof d.error.name === "string" && typeof d.error.code === "string"), "tool error metadata requires an error result.");
  } else {
    // These settled stream/operational shapes are identical at both pins. Reuse
    // their validators, never the v2 decoder or v2 tool-message interpretation.
    if (["user/message", "assistant/message", "system/message", "developer/message"].includes(event.type)) {
      dshV4Message(event.type === "user/message" ? d : d.message, event.type.split("/")[0]!);
    }
    if (event.type === "request/header") requireDshV4(record(d.header) && !Object.hasOwn(d.header, "system"), "retired request header.system.");
    try {
      if (event.type === "assistant/attempt") summarizeDshStream(d.stream);
      else if (event.type !== "system/message" && event.type !== "developer/message") validateDshPayload({ ...event, data: d, surfaceOp: undefined });
    } catch { refuseDshV4(`malformed operational payload at seq ${event.seq}.`); }
  }
  if (event.type === "subagent/catalog") {
    requireDshV4([0, 1, 2].includes(d.version as number) && typeof d.childId === "string" && count.safeParse(d.childCreatedAt).success
      && ["continuable", "one-shot", "external", "unknown"].includes(d.mode as string)
      && ((d.version === 2) === (d.mode === "external")) && !(d.version === 0 && d.mode === "unknown")
      && (d.label === undefined || typeof d.label === "string") && (d.mode !== "continuable" || typeof d.label === "string"), "malformed child catalog relationship.");
  }
}
