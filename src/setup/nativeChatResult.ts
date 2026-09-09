import type { NativeValidationStatus } from "../agent/nativeValidation.js";
import type { TurnEndReason } from "../session/sessionTypes.js";

/** Only the fields chat actually displays, not a fabricated full run summary. */
export interface NativeChatChildSummary {
  readonly sessionId: string;
  readonly driverStatus: "idle" | "failed";
  readonly assistantText: readonly string[];
  readonly endings: readonly { readonly reason: TurnEndReason }[];
  readonly validation?: { readonly status: NativeValidationStatus };
  readonly usage?: unknown;
  readonly diagnostics?: unknown;
}
export type NativeChatResult =
  | { readonly ok: true; readonly summary: NativeChatChildSummary }
  | { readonly ok: false; readonly code: "OUTPUT_TRUNCATED" | "RESULT_INVALID" | "RESULT_STATE_INVALID" | "SESSION_MISMATCH" | "FORK_IDENTITY_INVALID"; readonly message: string };

const ENDINGS: ReadonlySet<string> = new Set<TurnEndReason>(["complete", "cancelled", "error", "interrupted", "max_steps", "max_tokens", "blocked"]);
const VALIDATION: ReadonlySet<string> = new Set<NativeValidationStatus>(["not-requested", "pending", "passed", "failed", "unavailable"]);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Check the closed child's protocol before changing chat's known session.
 * This is not signature verification, writer acquisition or recovery. A valid
 * failed/cancelled summary remains such; exit code is handled separately.
 */
export function parseNativeChatResult(input: {
  readonly stdout: string;
  readonly truncated: boolean;
  readonly requestedSessionId: string | null;
  readonly forkFrom: string | null;
}): NativeChatResult {
  if (input.truncated) return { ok: false, code: "OUTPUT_TRUNCATED", message: "The child output exceeded the display limit. Its partial summary cannot establish a session reference." };
  const invalid = (): NativeChatResult => ({ ok: false, code: "RESULT_INVALID", message: "The child returned a malformed or unsupported recorded-run summary." });
  let row: Record<string, unknown> | null;
  try { row = object(JSON.parse(input.stdout)); } catch { return invalid(); }
  if (!row || typeof row.sessionId !== "string" || !row.sessionId.trim() || row.sessionId.trim() !== row.sessionId
      || /[\x00-\x1f\x7f-\x9f]/.test(row.sessionId) || !Array.isArray(row.assistantText)
      || !row.assistantText.every(block => typeof block === "string")) return invalid();
  if (row.driverStatus !== "idle" && row.driverStatus !== "failed") return {
    ok: false, code: "RESULT_STATE_INVALID", message: "The closed child did not return a supported terminal driver state. No running or unknown state is treated as a completed command."
  };
  if (input.forkFrom !== null) {
    if (row.sessionId === input.forkFrom || (input.requestedSessionId !== null && row.sessionId === input.requestedSessionId)) return {
      ok: false, code: "FORK_IDENTITY_INVALID", message: "The fork result names an existing parent/current session rather than a distinct child. The queued fork was not accepted."
    };
  } else if (input.requestedSessionId !== null && row.sessionId !== input.requestedSessionId) return {
    ok: false, code: "SESSION_MISMATCH", message: "The resumed child result does not match the explicitly requested session. Chat will not switch to the returned identity."
  };
  const endings: { reason: TurnEndReason }[] = [];
  if (row.endings !== undefined) {
    if (!Array.isArray(row.endings)) return invalid();
    for (const item of row.endings) {
      const ending = object(item);
      if (!ending || typeof ending.reason !== "string" || !ENDINGS.has(ending.reason)) return invalid();
      endings.push({ reason: ending.reason as TurnEndReason });
    }
  }
  let validation: NativeChatChildSummary["validation"];
  if (row.validation !== undefined) {
    const value = object(row.validation);
    if (!value || typeof value.status !== "string" || !VALIDATION.has(value.status)) return invalid();
    validation = { status: value.status as NativeValidationStatus };
  }
  return { ok: true, summary: {
    sessionId: row.sessionId, driverStatus: row.driverStatus,
    assistantText: [...row.assistantText] as string[], endings,
    ...(validation === undefined ? {} : { validation }),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.diagnostics === undefined ? {} : { diagnostics: row.diagnostics })
  } };
}
