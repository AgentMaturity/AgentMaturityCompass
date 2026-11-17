import { DataFlowRefused } from "../dataflow/purposePolicy.js";
import { parseRequestHeaderMeta, type RequestHeaderMeta } from "../session/requestHeaderMeta.js";
import { extractEnvelope } from "../session/sessionTypes.js";
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
  TRANSPORT: ["The connection to the model provider failed.", "Check that the address below is right and its server is running (a local Ollama needs ollama serve and the model pulled with ollama pull), then run the task again. When the connection never opened, the budget counts the request as costing nothing."],
  EMPTY_RESPONSE: ["The provider returned no usable completed reply.", "Inspect the recorded failed attempt and configured retry policy. No task completion is implied by an empty response."],
  ABORTED: ["The request ended without a completed provider response.", "Inspect the recorded cancellation/termination cause and any partial output before a deliberate continuation. Do not infer zero usage or completion."],
  AMC_NATIVE_BUDGET_REFUSED: ["AMC's signed budget for this agent refused the model request before sending it.", "Run amc budgets status --agent <agent>: it names the limit that was reached and the command, or the wait, that lets you continue (docs/BUDGETS.md, Missing Usage and Recovery)."],
  DATA_FLOW_REFUSED: ["Protected-data admission refused this model request before it was sent (P2-02).", "Inspect the recorded refusal reason, processor and purpose, then the signed processor registry (.amc/dataflow/processors.yaml) the operator maintains. Do not retry the same request or remove the registry to bypass admission."],
  AMC_RESIDENCY_EGRESS_BLOCKED: ["AMC's residency check refused the model request before sending it.", "Run amc residency status in the workspace folder to see what the registry declares; an owner declares the destination, with its region, and signs the registry with amc residency init --file <registry.yaml> (docs/OPS_HARDENING.md, Residency routing). Do not remove the registry to bypass the check."],
  AMC_EVIDENCE_INTEGRITY: ["Workspace evidence failed verification before budget admission.", "Run amc verify and amc budgets verify. Rows written with AMC_NO_SIGN=1, or edited rows, make signed budgets unverifiable in this workspace. Do not reset budgets to bypass this."],
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
  /** For TRANSPORT and TIMEOUT: the provider address the request went to (from the signed header's route), when recorded. */
  readonly origin?: string;
  /** For AMC_NATIVE_BUDGET_REFUSED: AMC's own refusal text, which names the limit and the next step. */
  readonly budgetCause?: string;
  /** For DATA_FLOW_REFUSED: the recorded refusal's reason and registry identifiers, never the refused content. */
  readonly dataFlow?: { readonly reason: string; readonly processorId: string | null; readonly purposeId: string | null };
  /** For AMC_RESIDENCY_EGRESS_BLOCKED: the refusal's fixed reason and detail codes and the channel it was checked on. */
  readonly residency?: { readonly reason: string; readonly detail: string; readonly channel: "provider" };
}
function own(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && "value" in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
}
function position(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function httpStatus(value: unknown): number | null { return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null; }

/** A provider origin (scheme, host, port) or null; never a path, query or credential. */
function safeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.origin : null; } catch { return null; }
}
/** A recorded residency refusal's codes when both are fixed-code shaped (lower case and underscores), else null. */
function safeResidency(value: unknown): NativeRunDiagnostic["residency"] | null {
  const reason = own(value, "reason"), detail = own(value, "detail"), code = (text: unknown): text is string => typeof text === "string" && /^[a-z_]{1,64}$/.test(text);
  // LlmRuntime checks a model request on the provider channel only (src/llm/adapter/llmRuntime.ts).
  return code(reason) && code(detail) ? { reason, detail, channel: "provider" } : null;
}
/** AMC's own budget refusal text (never a provider's), one line, printable characters only. */
function safeBudgetCause(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.replace(/[^\x20-\x7e]/g, " ").slice(0, 700);
}
/** The live refusal's own text when AMC's budget refused, else null. */
export function liveBudgetRefusalCause(error: unknown): string | null {
  return own(error, "code") === "AMC_NATIVE_BUDGET_REFUSED" ? safeBudgetCause(own(error, "message")) : null;
}

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
  if (error instanceof DataFlowRefused) return nativeFailureGuidance(error.code);
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
  // Per turn, the protected-data refusal that ended its latest request attempt; a later request header clears it.
  const refusals = new Map<number, DataFlowRefused | null>();
  const rows: NativeRunDiagnostic[] = [];
  for (const event of events) {
    if (event.session_id !== sessionId) continue;
    const at = event.event_type === "request/header" || event.event_type === "audit" ? position(extractEnvelope(event.meta_json)?.turn) : null;
    if (event.event_type === "audit") {
      let refusal: DataFlowRefused | null = null;
      try { refusal = DataFlowRefused.fromEvidence(JSON.parse(event.meta_json)); } catch { /* not a refusal row */ }
      if (refusal !== null && at !== null) refusals.set(at, refusal);
      continue;
    }
    if (event.event_type === "request/header") {
      if (at !== null) refusals.set(at, null);
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
    const origin = valid && (code === "TRANSPORT" || code === "TIMEOUT") ? safeOrigin(header?.physicalRoute?.baseUrl) : null;
    const budgetCause = valid && code === "AMC_NATIVE_BUDGET_REFUSED" ? safeBudgetCause(own(failure, "message")) : null;
    const residency = valid && code === "AMC_RESIDENCY_EGRESS_BLOCKED" ? safeResidency(own(meta, "residency")) : null;
    rows.push({ eventId: event.id, source: "request-failure", turn, step,
      guidance: nativeFailureGuidance(valid ? code : "METADATA_UNAVAILABLE", valid ? own(failure, "status") : undefined),
      ...(origin === null ? {} : { origin }), ...(budgetCause === null ? {} : { budgetCause }), ...(residency === null ? {} : { residency }) });
    if (turn !== null) failureTurns.add(turn);
  }
  for (const event of events) {
    if (event.session_id !== sessionId || event.event_type !== "turn/end") continue;
    const ending = readTurnEndMeta(event.meta_json);
    if (!ending || ending.reason !== "error") continue;
    const refusal = refusals.get(ending.turn);
    if (refusal) {
      rows.push({ eventId: event.id, source: "turn-error", turn: ending.turn, step: null, guidance: nativeFailureGuidance(refusal.code),
        dataFlow: { reason: refusal.reason, processorId: refusal.processorId, purposeId: refusal.purposeId } });
      continue;
    }
    if (failureTurns.has(ending.turn)) continue;
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
    const origin = safeOrigin(own(raw, "origin")), cause = safeBudgetCause(own(raw, "budgetCause"));
    if (origin !== null) lines.push(`  address: ${origin}`);
    if (cause !== null) lines.push(`  why: ${cause}`);
    // Re-validated from the projection, so only a known reason and registry-shaped identifiers reach the terminal.
    const flow = own(raw, "dataFlow"), refusal = flow === undefined ? null
      : DataFlowRefused.from({ reason: own(flow, "reason"), processorId: own(flow, "processorId"), purposeId: own(flow, "purposeId") });
    if (refusal) lines.push(`  refused: ${refusal.reason}; processor ${refusal.processorId ?? "none"}; purpose ${refusal.purposeId ?? "none"}`);
    const residency = safeResidency(own(raw, "residency"));
    if (residency) lines.push(`  residency: ${residency.reason}; ${residency.detail}; channel ${residency.channel}`);
  }
  return lines.join("\n");
}
