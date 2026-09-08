/** Passive callback telemetry, versioned independently of any provider session format. */
import { z } from "zod";

export type CallbackAttributeValue = string | number | boolean | readonly string[] | readonly number[] | readonly boolean[];
export interface CallbackAttributes { [name: string]: CallbackAttributeValue | undefined }
export interface CallbackSpanOptions { name: string; attributes?: CallbackAttributes }
export type CallbackSpanStatus = { status: "ok" } | { status: "error"; error?: { name: string; message: string } };
/** Structurally compatible with pinned Pi TelemetryContext; no Pi runtime dependency. */
export interface CallbackTelemetryContext {
  startSpan<T>(options: CallbackSpanOptions, callback: (span: CallbackTelemetrySpan) => T | Promise<T>): Promise<T>;
}
export interface CallbackTelemetrySpan extends CallbackTelemetryContext {
  setAttributes(attributes: CallbackAttributes): void;
  addEvent(name: string, attributes?: CallbackAttributes): void;
  setStatus(status: CallbackSpanStatus): void;
}

export const CALLBACK_TELEMETRY_FORMAT = "amc-callback-telemetry";
export const CALLBACK_TELEMETRY_VERSION = 1;
const valueSchema = z.union([z.string().max(4096), z.number().finite(), z.boolean(),
  z.array(z.string().max(4096)).max(64), z.array(z.number().finite()).max(64), z.array(z.boolean()).max(64)]);
const attributesSchema = z.record(z.string(), valueSchema).refine(value => Object.keys(value).length <= 128, "too many attributes");
const timeSchema = z.number().finite().nonnegative().max(8.64e15).nullable();
const statusSchema = z.union([z.object({ status: z.literal("ok") }).strict(), z.object({
  status: z.literal("error"), error: z.object({ name: z.string().max(4096), message: z.string().max(4096) }).strict().optional()
}).strict()]);
export const callbackSpanSchema = z.object({
  id: z.string().max(100), parentId: z.string().max(100).nullable(), name: z.string().min(1).max(4096),
  attributes: attributesSchema,
  events: z.array(z.object({ name: z.string().min(1).max(4096), attributes: attributesSchema,
    timestamp: timeSchema }).strict()).max(256),
  status: statusSchema, explicitStatus: z.boolean(),
  settlement: z.enum(["pending", "fulfilled", "rejected", "closed-before-settlement"]),
  rejectionKind: z.enum(["error", "aborted", "unknown"]).nullable(),
  endSequence: z.number().int().positive().nullable(), timestamp: timeSchema,
  durationMs: z.number().finite().nonnegative().nullable()
}).strict();
export type CallbackSpanRecord = z.infer<typeof callbackSpanSchema>;
export const callbackTelemetryDocumentSchema = z.object({
  format: z.literal(CALLBACK_TELEMETRY_FORMAT), version: z.literal(CALLBACK_TELEMETRY_VERSION),
  captureId: z.string().uuid(), recordedAt: z.string().datetime(),
  source: z.object({ contract: z.literal("pi-telemetry@b2602be77cb7b0de45dd616407fd210daa48aa75"),
    trust: z.literal("SELF_REPORTED"), signed: z.literal(false), evaluation: z.literal("NOT_EVALUATED") }).strict(),
  spans: z.array(callbackSpanSchema).max(4096),
  stats: z.object({ admittedSpans: z.number().int().nonnegative(), droppedSpans: z.number().int().nonnegative(),
    droppedRecordingCalls: z.number().int().nonnegative(), filteredAttributes: z.number().int().nonnegative(),
    flushFailures: z.number().int().nonnegative(), exportedSpans: z.number().int().nonnegative() }).strict(),
  losses: z.array(z.string().max(512)).max(30)
}).strict();
export type CallbackTelemetryDocument = z.infer<typeof callbackTelemetryDocumentSchema>;

/** Operational attributes only. Content and credentials are excluded by default. */
export const DEFAULT_CALLBACK_ATTRIBUTES: readonly string[] = Object.freeze([
  "pi.session.id", "pi.lane.name", "pi.operation.id", "pi.operation.kind", "pi.operation.recovery", "pi.operation.outcome",
  "pi.turn.id", "pi.step.kind", "pi.step.attempt", "pi.step.outcome", "pi.compaction.reason", "pi.checkpoint.kind",
  "pi.tool.name", "pi.tool.call_id", "pi.tool.replay", "pi.tool.recovery", "pi.tool.is_error",
  "pi.hook.name", "pi.hook.registration_id", "pi.hook.outcome", "pi.sleep.delay_ms", "pi.sleep.outcome", "pi.event.type",
  "pi.session.item_count", "pi.session.item_kinds", "pi.session.first_seq", "pi.session.last_seq",
  "pi.error.code", "pi.error.type", "pi.ai.operation", "pi.ai.provider", "pi.ai.model", "pi.ai.api", "pi.ai.streaming", "pi.ai.deferred",
  "pi.ai.response.model", "pi.ai.response.id", "pi.ai.response.stop_reason", "pi.ai.http.status_code", "pi.ai.error.type",
  "pi.ai.usage.input_tokens", "pi.ai.usage.output_tokens", "pi.ai.usage.cache_read_tokens", "pi.ai.usage.cache_write_tokens",
  "pi.ai.usage.reasoning_tokens", "pi.ai.usage.total_tokens", "pi.ai.usage.cost", "pi.ai.stream.chunk_count", "pi.ai.stream.time_to_first_chunk_ms",
  "amc.source.timestamp", "amc.source.duration_ms"
]);
