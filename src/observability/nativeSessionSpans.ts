/**
 * Folds native session rows into GenAI-shaped spans and metric points (SH-OBS-01).
 *
 * Tree: `invoke_agent <agentId>` (one segment per writer: session/open or session/resume opens it, session/release or
 * session/close ends it) → `turn <n>` → `chat <model>` (CLIENT) and `execute_tool <name>`. Ids derive from the
 * session id and event ids, so a resumed session or a re-export lands in the same trace. Usage and cost on a chat
 * span are classified by the same projections `amc session show` uses, on the header + outcome pair: synthetic (stub)
 * and invalid requests emit no token or cost values, and an unreported count is absent, never zero. No prompt, tool
 * argument or output text is ever folded: only digests and counts.
 *
 * Pure and per process: a row stream in, spans and points out. Spans still open at `drain()` are emitted with
 * `amc.span.unterminated=true`; closers written by crash recovery (synthetic envelopes) mark `amc.span.interrupted`.
 */
import { projectNativeRunUsage } from "../agent/nativeRunUsage.js";
import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { msToNanos, otelAttr as attr, otelAttrs, spanIdFor, traceIdFor, type OTelAttribute, type OTelMetricPoint, type OTelSpan } from "./otelValues.js";

export interface FoldOutput {
  readonly spans: OTelSpan[];
  readonly metrics: OTelMetricPoint[];
}

interface OpenSpan { readonly spanId: string; readonly parentSpanId: string | undefined; readonly name: string; readonly kind: number;
  readonly startTs: number; readonly attributes: OTelAttribute[]; readonly events: OTelSpan["events"]; readonly event?: EvidenceEvent }

interface SessionState {
  agentId: string;
  segment: OpenSpan | null;
  readonly turns: Map<number, OpenSpan>;
  readonly requests: Map<string, OpenSpan>;
  readonly tools: Map<string, OpenSpan>;
}

const SPAN_KIND = { INTERNAL: 1, CLIENT: 3 } as const;
const STATUS = { UNSET: 0, OK: 1, ERROR: 2 } as const;
const TOKEN_METRICS = [["inputTokens", "input_tokens"], ["outputTokens", "output_tokens"], ["cacheReadTokens", "cache_read.input_tokens"],
  ["cacheWriteTokens", "cache_write.input_tokens"], ["reasoningTokens", "reasoning.output_tokens"]] as const;

function meta(event: EvidenceEvent): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(event.meta_json); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}
const str = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export class NativeSpanFolder {
  private readonly sessions = new Map<string, SessionState>();
  constructor(private readonly maxSessions = 256) {}

  /** Open spans across all sessions; bounded by the exporter's buffer policy. */
  size(): number {
    let n = 0;
    for (const state of this.sessions.values()) n += (state.segment ? 1 : 0) + state.turns.size + state.requests.size + state.tools.size;
    return n;
  }

  /** Null when the row carries no session envelope (not a native session row). */
  ingest(event: EvidenceEvent): FoldOutput | null {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) return null;
    const out: FoldOutput = { spans: [], metrics: [] };
    const state = this.stateFor(event.session_id, out);
    const m = meta(event);
    const traceId = traceIdFor(event.session_id);
    const close = (open: OpenSpan, endTs: number, extra: OTelAttribute[], status: OTelSpan["status"]): void => {
      out.spans.push(finish(traceId, open, endTs, [...extra, ...(envelope.synthetic ? otelAttrs([attr("amc.span.interrupted", true)]) : [])], status));
    };
    switch (event.event_type) {
      case "session/open":
      case "session/resume": {
        if (event.event_type === "session/open") state.agentId = str(m.agentId) ?? state.agentId;
        if (state.segment) close(state.segment, event.ts, otelAttrs([attr("amc.span.unterminated", true)]), { code: STATUS.UNSET });
        state.segment = { spanId: spanIdFor(event.id), parentSpanId: undefined, name: `invoke_agent ${state.agentId}`, kind: SPAN_KIND.INTERNAL, startTs: event.ts, events: [],
          attributes: otelAttrs([attr("gen_ai.operation.name", "invoke_agent"), attr("gen_ai.agent.name", state.agentId), attr("gen_ai.conversation.id", event.session_id),
            attr("amc.session.id", event.session_id), attr("amc.agent.id", state.agentId), attr("amc.session.segment", event.event_type === "session/open" ? "open" : "resume"),
            attr("amc.harness.version", str(m.harnessVersion))]) };
        break;
      }
      case "session/release":
      case "session/close": {
        for (const open of [...state.tools.values(), ...state.requests.values(), ...state.turns.values()]) close(open, event.ts, otelAttrs([attr("amc.span.unterminated", true)]), { code: STATUS.UNSET });
        state.tools.clear(); state.requests.clear(); state.turns.clear();
        if (state.segment) close(state.segment, event.ts, otelAttrs([attr("amc.session.end", event.event_type === "session/close" ? "close" : str(m.reason) ?? "release")]), { code: STATUS.OK });
        state.segment = null;
        if (event.event_type === "session/close") this.sessions.delete(event.session_id);
        break;
      }
      case "turn/start": {
        const turn = num(m.turn) ?? envelope.turn ?? -1;
        state.turns.set(turn, { spanId: spanIdFor(event.id), parentSpanId: state.segment?.spanId, name: `turn ${turn}`, kind: SPAN_KIND.INTERNAL, startTs: event.ts, events: [],
          attributes: otelAttrs([attr("amc.turn", turn), attr("amc.turn.trigger", str(m.trigger)), attr("gen_ai.conversation.id", event.session_id)]) });
        break;
      }
      case "turn/end": {
        const turn = num(m.turn) ?? envelope.turn ?? -1;
        const open = state.turns.get(turn);
        if (!open) break;
        state.turns.delete(turn);
        const reason = str(m.reason) ?? "unknown";
        close(open, event.ts, otelAttrs([attr("amc.turn.reason", reason)]), reason === "complete" ? { code: STATUS.OK } : { code: STATUS.ERROR, message: `turn ended ${reason}` });
        break;
      }
      case "loop/retry":
      case "loop/cancel": {
        const open = state.turns.get(envelope.turn ?? -1) ?? state.segment;
        open?.events.push({ name: event.event_type, timeUnixNano: msToNanos(event.ts), attributes: otelAttrs([attr("amc.event.id", event.id), attr("amc.retry.attempt", num(m.attempt))]) });
        break;
      }
      case "request/header": {
        const header = parseRequestHeaderMeta(event.meta_json);
        if (header === null) break;
        state.requests.set(event.id, { spanId: spanIdFor(event.id), parentSpanId: state.turns.get(envelope.turn ?? -1)?.spanId ?? state.segment?.spanId, name: `chat ${header.model}`, kind: SPAN_KIND.CLIENT,
          startTs: event.ts, events: [], event,
          attributes: otelAttrs([attr("gen_ai.operation.name", "chat"), attr("gen_ai.provider.name", header.providerId), attr("gen_ai.system", header.providerId),
            attr("gen_ai.request.model", header.model), attr("gen_ai.conversation.id", event.session_id), attr("amc.request.digest", header.requestDigest),
            attr("amc.turn", envelope.turn), attr("amc.step", envelope.step)]) });
        break;
      }
      case "request/response":
      case "request/failure": {
        const headerId = str(m.headerEventId) ?? "";
        const open = state.requests.get(headerId);
        if (!open?.event) break;
        state.requests.delete(headerId);
        const classified = classifyRequest(open.event, event);
        const durationMs = num(m.durationMs);
        const failure = m.failure && typeof m.failure === "object" ? m.failure as Record<string, unknown> : null;
        const extra = otelAttrs([attr("gen_ai.response.finish_reasons", str(m.finishReason)), attr("http.response.status_code", num(m.httpStatus)),
          attr("error.type", event.event_type === "request/failure" ? str(failure?.code) ?? "failed" : null), attr("amc.request.duration_ms", durationMs),
          attr("amc.usage.status", classified.usageStatus), attr("amc.cost.basis", classified.costBasis), attr("amc.cost.usd", classified.costUsd),
          ...TOKEN_METRICS.map(([field, suffix]) => attr(`gen_ai.usage.${suffix}`, classified.tokens[field]))]);
        close(open, durationMs === null ? event.ts : open.startTs + durationMs, extra, event.event_type === "request/failure" ? { code: STATUS.ERROR, message: str(failure?.code) ?? "request failed" } : { code: STATUS.OK });
        const scope = otelAttrs([attr("gen_ai.operation.name", "chat"), attr("gen_ai.provider.name", str(meta(open.event).providerId)), attr("gen_ai.request.model", str(meta(open.event).model))]);
        for (const [field, suffix] of TOKEN_METRICS) {
          const value = classified.tokens[field];
          if (value !== null) out.metrics.push({ kind: "sum", name: `gen_ai.client.inference.usage.${suffix}`, unit: "{token}", value, attributes: scope });
        }
        if (classified.costUsd !== null) out.metrics.push({ kind: "sum", name: "amc.request.cost.usd", unit: "USD", value: classified.costUsd, attributes: [...scope, ...otelAttrs([attr("amc.cost.basis", classified.costBasis)])] });
        if (durationMs !== null) out.metrics.push({ kind: "histogram", name: "gen_ai.client.operation.duration", unit: "s", value: durationMs / 1000, attributes: [...scope, ...otelAttrs([attr("error.type", event.event_type === "request/failure" ? str(failure?.code) ?? "failed" : null)])] });
        break;
      }
      case "tool/call": {
        const callId = str(m.toolCallId) ?? event.id;
        const toolName = str(m.toolName) ?? "unknown";
        state.tools.set(callId, { spanId: spanIdFor(event.id), parentSpanId: state.turns.get(envelope.turn ?? -1)?.spanId ?? state.segment?.spanId, name: `execute_tool ${toolName}`, kind: SPAN_KIND.INTERNAL,
          startTs: event.ts, events: [],
          attributes: otelAttrs([attr("gen_ai.operation.name", "execute_tool"), attr("gen_ai.tool.name", toolName), attr("gen_ai.tool.call.id", callId), attr("gen_ai.tool.type", "function"),
            attr("amc.tool.dispatch", str(m.dispatch)), attr("amc.tool.args_sha256", str(m.argsSha256)), attr("amc.turn", envelope.turn), attr("amc.step", envelope.step)]) });
        break;
      }
      case "tool/result": {
        const callId = str(m.toolCallId) ?? "";
        const open = state.tools.get(callId);
        if (!open) break;
        state.tools.delete(callId);
        const outcome = str(m.outcome) ?? "TOOL_OUTCOME_UNKNOWN";
        close(open, event.ts, otelAttrs([attr("amc.tool.outcome", outcome), attr("amc.tool.exit_code", num(m.exitCode)), attr("amc.tool.timed_out", typeof m.timedOut === "boolean" ? m.timedOut : null),
          attr("amc.tool.denied", typeof m.denied === "boolean" ? m.denied : null), attr("error.type", outcome === "OK" ? null : outcome)]), outcome === "OK" ? { code: STATUS.OK } : { code: STATUS.ERROR, message: outcome });
        out.metrics.push({ kind: "histogram", name: "amc.tool.duration", unit: "s", value: Math.max(0, event.ts - open.startTs) / 1000,
          attributes: otelAttrs([attr("gen_ai.tool.name", open.attributes.find((a) => a.key === "gen_ai.tool.name")?.value.stringValue), attr("amc.tool.outcome", outcome)]) });
        break;
      }
      default:
        break;
    }
    return out;
  }

  /** Emit every open span as unterminated (process exit, buffer eviction) and forget them. */
  drain(now = Date.now()): FoldOutput {
    const out: FoldOutput = { spans: [], metrics: [] };
    for (const [sessionId, state] of this.sessions) {
      const traceId = traceIdFor(sessionId);
      for (const open of [...state.tools.values(), ...state.requests.values(), ...state.turns.values(), ...(state.segment ? [state.segment] : [])]) {
        out.spans.push(finish(traceId, open, now, otelAttrs([attr("amc.span.unterminated", true)]), { code: STATUS.UNSET }));
      }
    }
    this.sessions.clear();
    return out;
  }

  private stateFor(sessionId: string, out: FoldOutput): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    if (this.sessions.size >= this.maxSessions) {
      // Evict the oldest session as unterminated rather than grow without bound.
      const [oldest] = this.sessions.keys();
      if (oldest !== undefined) {
        const victim = this.sessions.get(oldest)!;
        for (const open of [...victim.tools.values(), ...victim.requests.values(), ...victim.turns.values(), ...(victim.segment ? [victim.segment] : [])]) {
          out.spans.push(finish(traceIdFor(oldest), open, Date.now(), otelAttrs([attr("amc.span.unterminated", true)]), { code: STATUS.UNSET }));
        }
        this.sessions.delete(oldest);
      }
    }
    const state: SessionState = { agentId: "unknown", segment: null, turns: new Map(), requests: new Map(), tools: new Map() };
    this.sessions.set(sessionId, state);
    return state;
  }
}

function finish(traceId: string, open: OpenSpan, endTs: number, extra: OTelAttribute[], status: OTelSpan["status"]): OTelSpan {
  return { traceId, spanId: open.spanId, ...(open.parentSpanId === undefined ? {} : { parentSpanId: open.parentSpanId }), name: open.name, kind: open.kind,
    startTimeUnixNano: msToNanos(open.startTs), endTimeUnixNano: msToNanos(Math.max(endTs, open.startTs)), attributes: [...open.attributes, ...extra], status, events: open.events };
}

interface ClassifiedRequest {
  readonly usageStatus: string;
  readonly costBasis: string;
  readonly costUsd: number | null;
  readonly tokens: Record<typeof TOKEN_METRICS[number][0], number | null>;
}

/** The same verdict `amc session show` gives this request, computed on its header + outcome pair only. */
function classifyRequest(header: EvidenceEvent, outcome: EvidenceEvent): ClassifiedRequest {
  const empty = Object.fromEntries(TOKEN_METRICS.map(([field]) => [field, null])) as ClassifiedRequest["tokens"];
  try {
    const usage = projectNativeRunUsage([header, outcome], header.session_id);
    const report = usage.requestReports?.[0];
    const cost = usage.cost?.requests[0];
    const observed = report !== undefined && (report.usageStatus === "complete" || report.usageStatus === "partial") && usage.status !== "invalid";
    return { usageStatus: report?.usageStatus ?? "invalid", costBasis: cost?.costBasis ?? "unavailable",
      costUsd: cost !== undefined && cost.costBasis !== "unavailable" ? cost.attributedCostUsd : null,
      tokens: observed ? Object.fromEntries(TOKEN_METRICS.map(([field]) => [field, usage.totals[field].observedTokens])) as ClassifiedRequest["tokens"] : empty };
  } catch {
    return { usageStatus: "invalid", costBasis: "unavailable", costUsd: null, tokens: empty };
  }
}

