/** Wire limits and input checks shared by the native SDK client and its turn (moved from nativeAgentClient.ts, P2-13). */
import { AMCNativeInputError, AMCNativeProtocolError } from "./nativeAgentErrors.js";

export type JsonObject = Record<string, unknown>;
export const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
export const STOP_REASONS = new Set(["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"]);
export const UPDATE_KINDS = new Set(["agent_message_chunk", "user_message_chunk", "tool_call", "tool_call_update", "plan"]);
export const MAX_FRAME_BYTES = 1024 * 1024;
export const MAX_TURN_BYTES = 8 * 1024 * 1024;
/** Hard retention ceilings, independently applied to each turn and each history replay. */
export const AMC_NATIVE_EVENT_LIMITS = Object.freeze({ maxEvents: 8192, maxBytes: MAX_TURN_BYTES });
export const MAX_WRITE_QUEUE_BYTES = 8 * 1024 * 1024;
export const MAX_WRITE_QUEUE_FRAMES = 64;

/** Lower the retention ceilings; no event is silently dropped when a ceiling is reached. @public */
export interface AMCNativeEventBufferOptions {
  readonly maxEvents?: number;
  readonly maxBytes?: number;
}

export function eventLimits(options: AMCNativeEventBufferOptions = {}): Required<AMCNativeEventBufferOptions> {
  if (!object(options)) throw new AMCNativeInputError("eventBuffer must be an object");
  // Read each ceiling as unknown: the caller's object is untrusted input, so a
  // non-integer is refused here rather than narrowed away by the declared type.
  const supplied: Readonly<Record<keyof Required<AMCNativeEventBufferOptions>, unknown>> =
    { maxEvents: options.maxEvents, maxBytes: options.maxBytes };
  const limits: { maxEvents: number; maxBytes: number } = { maxEvents: AMC_NATIVE_EVENT_LIMITS.maxEvents, maxBytes: AMC_NATIVE_EVENT_LIMITS.maxBytes };
  for (const key of ["maxEvents", "maxBytes"] as const) {
    const value = supplied[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > AMC_NATIVE_EVENT_LIMITS[key]) {
      throw new AMCNativeInputError(`${key} must be an integer between 1 and ${AMC_NATIVE_EVENT_LIMITS[key]}`);
    }
    limits[key] = value;
  }
  return Object.freeze(limits);
}

/** Only called on JSON data, never media Buffers or caller-owned capability objects. */
export function freezeJson<T>(value: T): T {
  const stack: unknown[] = [value];
  while (stack.length) {
    const item = stack.pop();
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) if (child !== null && typeof child === "object") stack.push(child);
  }
  return value;
}

export const asError = (error: unknown): Error => error instanceof Error ? error : new AMCNativeProtocolError("native client operation failed");

export function assertSignal(signal: AbortSignal | undefined): void {
  if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw new AMCNativeInputError("Cancellation requires an AbortSignal");
  }
}

/** ACP plans contain display text only; no entry grants execution authority. */
export function validPlanUpdate(update: JsonObject): boolean {
  return Array.isArray(update.entries) && update.entries.length <= 100
    && update.entries.every(entry => object(entry) && typeof entry.content === "string" && Buffer.byteLength(entry.content) <= 8192
      && ["low", "medium", "high"].includes(entry.priority as string)
      && ["pending", "in_progress", "completed"].includes(entry.status as string));
}
