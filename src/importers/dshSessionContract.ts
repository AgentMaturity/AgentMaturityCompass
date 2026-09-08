/** Pinned physical DSH v2 import subset; no source-runtime reconstruction or migration. */
import { z } from "zod";

export const DSH_SOURCE_REVISION = "c389f96bf3a9b6807cb71ed6bdad5849be0df6d8";
export const DSH_IMPORT_LIMITS = { bytes: 32 * 1024 * 1024, lineBytes: 4 * 1024 * 1024, events: 100_000, depth: 128, expandedMembers: 500_000 } as const;
const integer = z.number().refine(value => Number.isSafeInteger(value) && !Object.is(value, -0));
const count = integer.refine(value => value >= 0);

export const dshHeaderSchema = z.object({
  type: z.literal("session"), version: z.literal(2), id: z.string().min(1), createdAt: count,
  isSeeded: z.boolean(), delegationDepth: count, cwd: z.string().optional(), parentSession: z.string().optional(),
  origin: z.literal("subagent").optional(), agentPreset: z.string().optional()
}).strict();
export const dshEventSchema = z.object({
  type: z.string().min(1), seq: count, time: integer, data: z.record(z.string(), z.unknown()),
  ignorable: z.literal(true).optional(),
  sourceEventSeqs: z.array(z.union([count, z.tuple([count, count])])).optional(),
  surfaceOp: z.union([z.literal("append"), z.object({ op: z.literal("replace"), start: count, end: count }).strict()]).optional()
}).strict();
export type DshHeader = z.infer<typeof dshHeaderSchema>;
export type DshEvent = z.infer<typeof dshEventSchema>;

// Vocabulary from packages/core/session/src/known-event-types.ts at the pin.
// Plugin records stay opaque metadata; recognizing a name is not a tool outcome.
export const DSH_KNOWN_EVENTS = new Set([
  "agent-preset/selected", "agent/inbox/spliced", "approval/asked", "approval/decided", "approval/policy",
  "assistant/attempt", "assistant/message", "command/done", "command/run", "compaction/end", "compaction/prune",
  "compaction/start", "compaction/summary", "feedback/message-delete", "feedback/message-put", "feedback/record",
  "goal/change", "hook/invoked", "hook/result", "llm/retry", "llm/retry-started", "model/selection", "permission/preset",
  "plan/mode", "request/context", "request/header", "sandbox/mode", "schedule/change", "session-log-deepseek/delivery-accepted",
  "session/end-seed", "session/title", "session/title-llm-request", "step/end", "step/start", "subagent/descriptor",
  "subagent/model-selection-policy", "team/member", "team/message/delivered", "team/message/queued", "team/task", "todo/write",
  "tool-workflow/agent-end", "tool-workflow/agent-start", "tool-workflow/run-end", "tool-workflow/run-start",
  "tool/call", "tool/code-dispatch", "tool/code-dispatch-start", "tool/result", "turn/end", "turn/start", "user/message",
  "web/deepseek-search-llm-request"
]);
export const DSH_SURFACE_EVENTS = new Set(["user/message", "assistant/message", "tool/result"]);
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requireValue(ok: boolean, message: string): asserts ok { if (!ok) throw new Error(`Malformed DSH v2 ${message}.`); }
function isCount(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0); }
function validateUsage(value: unknown): void {
  requireValue(record(value) && isCount(value.inputTokens) && isCount(value.outputTokens), "token usage");
  for (const key of ["totalTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"]) {
    requireValue(value[key] === undefined || isCount(value[key]), "token usage count");
  }
}
function message(value: unknown, role: string): Record<string, unknown> {
  requireValue(record(value) && value.role === role && typeof value.id === "string" && Array.isArray(value.content) && record(value.source), "message");
  return value;
}

export interface DshStreamSummary {
  records: number; chunks: number; firstTime: number | null; lastTime: number | null;
  finish: Record<string, unknown> | null; usage: unknown; completedStream: boolean;
}
/** Validate compact runs without flattening or joining their recorded deltas. */
export function summarizeDshStream(value: unknown): DshStreamSummary {
  requireValue(Array.isArray(value), "settled assistant stream");
  let chunks = 0;
  let firstTime: number | null = null;
  let lastTime: number | null = null;
  let finish: Record<string, unknown> | null = null;
  let usage: unknown = null;
  for (const item of value) {
    requireValue(record(item) && typeof item.type === "string", "stream record");
    requireValue(finish === null, "stream with records after terminal finish");
    if (item.type === "chunk") {
      requireValue(Number.isSafeInteger(item.time) && record(item.chunk) && typeof item.chunk.type === "string", "raw stream chunk");
      const chunk = item.chunk;
      requireValue(["block-start", "block-end", "usage", "finish", "text-delta", "reasoning-delta", "tool-call-delta"].includes(chunk.type as string), "unknown required stream chunk");
      if (chunk.type === "finish") {
        requireValue(record(chunk.reason) && typeof chunk.reason.kind === "string", "stream finish reason");
        finish = chunk.reason;
      }
      if (chunk.type === "usage") {
        validateUsage(chunk.usage);
        usage = chunk.usage;
      }
      const time = item.time as number;
      firstTime ??= time; lastTime = time; chunks++;
    } else {
      requireValue(["text-chunks", "reasoning-chunks", "tool-call-chunks"].includes(item.type), "unknown compact stream record");
      const members = item.type === "tool-call-chunks" ? item.args : item.texts;
      requireValue(Number.isSafeInteger(item.time0) && isCount(item.index) && Array.isArray(item.dt)
        && Array.isArray(members) && members.length > 0 && members.every(v => typeof v === "string")
        && item.dt.length === members.length - 1 && item.dt.every(v => Number.isSafeInteger(v)), "compact stream dimensions");
      if (item.type === "tool-call-chunks") requireValue(typeof item.id === "string" && (item.name === undefined || typeof item.name === "string"), "compact tool-call identity");
      let time = item.time0 as number;
      firstTime ??= time;
      for (const dt of item.dt) { time += dt as number; requireValue(Number.isSafeInteger(time), "compact stream timestamp overflow"); }
      lastTime = time; chunks += members.length;
    }
    requireValue(chunks <= DSH_IMPORT_LIMITS.expandedMembers, "stream expansion limit");
  }
  return { records: value.length, chunks, firstTime, lastTime, finish, usage, completedStream: finish !== null };
}

/** Validate fields used by projection; retain all other source payload fields. */
export function validateDshPayload(event: DshEvent): void {
  const d = event.data;
  if (["turn/start", "turn/end", "step/start", "step/end", "assistant/message", "assistant/attempt", "tool/call", "tool/result"].includes(event.type)) {
    requireValue(isCount(d.turn), "turn identity");
  }
  if (["step/start", "step/end", "assistant/message", "assistant/attempt", "tool/call", "tool/result"].includes(event.type)) requireValue(isCount(d.step), "step identity");
  if (event.type === "turn/end") requireValue(record(d.reason) && typeof d.reason.kind === "string", "turn outcome");
  if (event.type === "session/end-seed") requireValue(d.inherited === undefined || d.inherited === true, "inherited marker");
  if (event.type === "tool/call") requireValue(typeof d.callId === "string" && typeof d.name === "string" && typeof d.arguments === "string", "tool call");
  if (event.type === "user/message") message(d, "user");
  if (event.type === "assistant/message") {
    const msg = message(d.message, "assistant");
    const source = msg.source as Record<string, unknown>;
    requireValue(source.kind === "model" && typeof source.provider === "string" && typeof source.model === "string", "assistant provenance");
    requireValue(d.interrupted === undefined || d.interrupted === true, "assistant interruption marker");
    requireValue(event.sourceEventSeqs === undefined, "v2 assistant legacy delta references");
  }
  if (event.type === "assistant/message" || event.type === "assistant/attempt") summarizeDshStream(d.stream);
  if (event.type === "assistant/message" && d.usage !== undefined) validateUsage(d.usage);
  if (event.type === "tool/result") {
    const msg = message(d.message, "user");
    const source = msg.source as Record<string, unknown>;
    const blocks = msg.content as unknown[];
    const result = blocks[0];
    requireValue(blocks.length === 1 && record(result) && result.type === "tool-result" && typeof result.toolCallId === "string"
      && Array.isArray(result.content) && (result.isError === undefined || typeof result.isError === "boolean"), "tool result block");
    requireValue(source.kind === "tool" && source.callId === result.toolCallId, "tool result correlation");
    requireValue(d.error === undefined || (record(d.error) && typeof d.error.name === "string" && typeof d.error.code === "string"), "tool error identity");
  }
  if (event.type === "request/context") requireValue(typeof d.provider === "string" && typeof d.model === "string", "request route context");
  if (event.type === "request/header") requireValue(["initial", "resume", "change", "series"].includes(d.reason as string)
    && record(d.header) && record(d.header.config), "request header");
}
