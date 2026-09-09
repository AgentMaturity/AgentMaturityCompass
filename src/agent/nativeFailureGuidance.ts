import { parseRequestHeaderMeta, type RequestHeaderMeta } from "../session/requestHeaderMeta.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import type { EvidenceEvent } from "../types.js";

const GUIDANCE = {
  AUTH: ["The provider refused authentication or access.", "Re-run amc agent-loop guide with the same provider, model, credential reference and credential paths. Check account/model access and the selected reference; never paste a key into --credential."],
  MISSING_CREDENTIAL: ["The selected credential reference could not be resolved.", "Use amc agent-loop guide with the original provider/model/reference and credential paths. Follow its local reference-setup action; local presence alone is not remote authentication proof."],
  INVALID_CREDENTIAL: ["The selected credential reference was unusable.", "Inspect the reference and private credential store through amc agent-loop guide with the original options. Do not put a credential value in CLI arguments or logs."],
  QUOTA: ["The provider reported exhausted account quota or balance.", "Inspect the provider account's allowance and model access before another deliberate run. Waiting or repeating the same request is not evidence that quota has been restored."],
  RATE_LIMIT: ["The provider reported a request-rate limit.", "Inspect the recorded failed attempts and the route's retry policy. Respect the provider delay; do not manually replay a task while its existing attempt is unresolved."],
  CONTEXT_WINDOW_EXCEEDED: ["The request exceeded the model's context window.", "Review the recorded history and deliberately use the existing compaction workflow or a model with sufficient context. Preserve evidence and permissions; do not silently drop history or automatically retry."],
  INVALID_REQUEST: ["The provider rejected the request shape or content.", "Inspect the selected model/protocol and request metadata in this session. Correct the request before another deliberate run; do not relax policy checks to make it pass."],
  SERVER: ["The provider reported a server error.", "Inspect recorded retry attempts and settlement before continuing. A partial reply is not a completed task; the existing retry policy remains authoritative."],
  TIMEOUT: ["The provider request or stream timed out.", "Inspect this session's failed attempt, retained partial output and budget status before a deliberate resume. A timeout does not prove zero usage or that no work occurred."],
  TRANSPORT: ["The provider connection failed.", "Inspect the selected origin, connection and recorded request settlement. Do not assume zero usage or automatically replay a task whose effects are unknown."],
  EMPTY_RESPONSE: ["The provider returned no usable completed reply.", "Inspect the recorded failed attempt and configured retry policy. No task completion is implied by an empty response."],
  ABORTED: ["The request ended without a completed provider response.", "Inspect the recorded cancellation/termination cause and any partial output before a deliberate continuation. Do not infer zero usage or completion."],
  AMC_NATIVE_BUDGET_REFUSED: ["Signed native budget admission refused this dispatch.", "Inspect amc budgets verify and amc budgets status --agent <recorded-agent>. Preserve pending reservations and unknown usage. budgets reset does not restore allowance; policy changes require explicit review, not an automatic bypass."],
  METADATA_UNAVAILABLE: ["Recorded failure metadata is missing or inconsistent.", "Inspect amc session show <session-id> and separately run amc agent-loop verify <session-id>. Do not infer a provider failure class or repair history implicitly."],
  UNKNOWN: ["The native operation failed without a supported public failure classification.", "Inspect the session with amc session show <session-id>, then amc agent-loop verify <session-id>; use amc doctor for local setup. Preserve the evidence and avoid automatic retries or policy changes."]
} as const;

export interface NativeFailureGuidance {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly summary: string;
  readonly nextAction: string;
}
export interface NativeRunDiagnostic {
  readonly eventId: string;
  readonly source: "request-failure" | "turn-error";
  readonly turn: number | null;
  readonly step: number | null;
  readonly guidance: NativeFailureGuidance;
}
function own(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && "value" in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
}
function position(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function httpStatus(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null; }

/** Only fixed public wording is returned; raw exception messages never escape. */
export function nativeFailureGuidance(code: unknown, status?: unknown): NativeFailureGuidance {
  const known = typeof code === "string" && Object.hasOwn(GUIDANCE, code) ? code as keyof typeof GUIDANCE : null;
  const observed = httpStatus(status);
  if (known) return { code: known, httpStatus: observed, summary: GUIDANCE[known][0], nextAction: GUIDANCE[known][1] };
  if (typeof code === "string" && /^HTTP_[1-5][0-9]{2}$/.test(code)) return {
    code, httpStatus: observed, summary: "The provider returned an unclassified HTTP failure.",
    nextAction: "Inspect the selected origin/model and this session's request metadata. An HTTP status alone does not prove a policy or credential problem; do not automatically repeat the task."
  };
  return { code: "UNKNOWN", httpStatus: observed, summary: GUIDANCE.UNKNOWN[0], nextAction: GUIDANCE.UNKNOWN[1] };
}

export function liveNativeFailureGuidance(error: unknown): NativeFailureGuidance {
  const code = own(error, "code");
  if (code === "AMC_NATIVE_BUDGET_REFUSED") return nativeFailureGuidance(code);
  const failure = own(error, "failure");
  return own(failure, "code") === code && typeof code === "string"
    ? nativeFailureGuidance(code, own(failure, "status")) : nativeFailureGuidance("UNKNOWN");
}
export function renderNativeFailureGuidance(guidance: NativeFailureGuidance): string {
  // Reconstruct fixed text even for a serialized child projection; never trust
  // its free-text summary/nextAction fields as terminal output or instructions.
  const safe = nativeFailureGuidance(own(guidance, "code"), own(guidance, "httpStatus"));
  return `${safe.code}${safe.httpStatus === null ? "" : ` (HTTP ${safe.httpStatus})`}: ${safe.summary}\n  Next: ${safe.nextAction}`;
}

/** Read-back diagnostic facts, never a verification verdict or retry instruction. */
export function projectNativeRunDiagnostics(events: readonly EvidenceEvent[], sessionId: string): NativeRunDiagnostic[] {
  const headers = new Map<string, RequestHeaderMeta>();
  const invalidHeaders = new Set<string>();
  const settled = new Set<string>(), failureTurns = new Set<number>();
  const rows: NativeRunDiagnostic[] = [];
  for (const event of events) {
    if (event.session_id !== sessionId) continue;
    if (event.event_type === "request/header") {
      const header = parseRequestHeaderMeta(event.meta_json);
      if (!header || headers.has(event.id) || invalidHeaders.has(event.id)) { invalidHeaders.add(event.id); headers.delete(event.id); }
      else headers.set(event.id, header);
      continue;
    }
    if (event.event_type !== "request/failure" && event.event_type !== "request/response") continue;
    let meta: unknown;
    try { meta = JSON.parse(event.meta_json); } catch { meta = null; }
    const headerId = own(meta, "headerEventId"), header = typeof headerId === "string" ? headers.get(headerId) : undefined;
    const linked = header !== undefined && typeof headerId === "string" && !settled.has(headerId)
      && own(meta, "requestDigest") === header.requestDigest && own(meta, "providerId") === header.providerId;
    if (typeof headerId === "string") settled.add(headerId);
    if (event.event_type !== "request/failure") continue;
    const turn = position(own(meta, "turn")), step = position(own(meta, "step"));
    const failure = own(meta, "failure"), code = own(failure, "code");
    const valid = linked && own(meta, "outcome") === "failed" && typeof code === "string"
      && (own(meta, "finishReason") === "error" || own(meta, "finishReason") === "aborted");
    rows.push({ eventId: event.id, source: "request-failure", turn, step,
      guidance: nativeFailureGuidance(valid ? code : "METADATA_UNAVAILABLE", valid ? own(failure, "status") : undefined) });
    if (turn !== null) failureTurns.add(turn);
  }
  for (const event of events) {
    if (event.session_id !== sessionId || event.event_type !== "turn/end") continue;
    const ending = readTurnEndMeta(event.meta_json);
    if (!ending || ending.reason !== "error" || failureTurns.has(ending.turn)) continue;
    rows.push({ eventId: event.id, source: "turn-error", turn: ending.turn, step: null, guidance: nativeFailureGuidance("UNKNOWN") });
  }
  return rows;
}

export function renderNativeRunDiagnostics(value: unknown): string {
  if (value === undefined) return "Recorded failure diagnostics: unavailable in this older summary.";
  if (!Array.isArray(value)) return "Recorded failure diagnostics: unavailable (unsupported projection).";
  if (value.length === 0) return "Recorded failure diagnostics: no failed-attempt or error-ending rows projected; this is not proof of task success.";
  const lines = ["Recorded failure diagnostics (cumulative; a retry may later succeed; not a verification):"];
  for (const raw of value) {
    const eventId = own(raw, "eventId"), source = own(raw, "source"), turn = position(own(raw, "turn")), step = position(own(raw, "step"));
    if (typeof eventId !== "string" || (source !== "request-failure" && source !== "turn-error")) {
      lines.push("  An unsupported diagnostic row is unavailable; inspect the original session evidence."); continue;
    }
    // JSON escaping prevents a recorded ID from injecting terminal controls.
    lines.push(`  ${source} ${JSON.stringify(eventId)} · turn ${turn ?? "unknown"} · step ${step ?? "unknown"}`);
    const guidance = own(raw, "guidance");
    lines.push(`  ${renderNativeFailureGuidance(nativeFailureGuidance(own(guidance, "code"), own(guidance, "httpStatus")))}`);
  }
  return lines.join("\n");
}
