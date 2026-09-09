import { parseRequestHeaderMeta, type RequestHeaderMeta } from "../session/requestHeaderMeta.js";
import type { EvidenceEvent } from "../types.js";

const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"] as const;
type TokenField = typeof TOKEN_FIELDS[number];
type Counts = Record<TokenField, number | null>;
export interface NativeUsageMetric {
  /** Sum of explicitly reported counts only; null when no request reported it. */
  readonly observedTokens: number | null;
  readonly reportedRequests: number;
}
export interface NativeRunUsage {
  readonly scope: "recorded-session";
  readonly status: "recorded" | "partial" | "unavailable" | "invalid";
  readonly requests: number;
  readonly syntheticRequests: number;
  readonly reportedRequests: number;
  readonly completeRequests: number;
  readonly unreportedRequests: number;
  readonly pendingRequests: number;
  readonly totals: Readonly<Record<TokenField, NativeUsageMetric>>;
  readonly cache: {
    /** A token share over the eligible reports, not a request-hit probability. */
    readonly basis: "reported-input-token-subtotal";
    readonly readShare: number | null;
    readonly readTokens: number | null;
    readonly inputTokens: number | null;
    readonly eligibleRequests: number;
    readonly excludedRequests: number;
    readonly unreportedWriteRequests: number;
  };
  /** Schema/link problems, not proof of malicious tampering or a chain verdict. */
  readonly issues: readonly { readonly eventId: string; readonly code: string }[];
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Fold matching recorded request outcomes once; step/end copies are never added. */
export function projectNativeRunUsage(events: readonly EvidenceEvent[], sessionId: string): NativeRunUsage {
  const headers = new Map<string, RequestHeaderMeta>();
  const settled = new Set<string>();
  const issues: { eventId: string; code: string }[] = [];
  const totals = Object.fromEntries(TOKEN_FIELDS.map(key => [key, { observedTokens: null, reportedRequests: 0 }])) as Record<TokenField, { observedTokens: number | null; reportedRequests: number }>;
  let syntheticRequests = 0, reportedRequests = 0, completeRequests = 0;
  let eligibleRequests = 0, unreportedWriteRequests = 0, cacheRead = 0, cacheInput = 0;
  const issue = (eventId: string, code: string) => { issues.push({ eventId, code }); };
  const sum = (before: number, value: number, id: string): number => {
    const next = before + value;
    if (!Number.isSafeInteger(next)) { issue(id, "USAGE_TOTAL_OVERFLOW"); return before; }
    return next;
  };
  for (const event of events) {
    if (event.session_id !== sessionId) continue;
    if (event.event_type === "request/header") {
      const header = parseRequestHeaderMeta(event.meta_json);
      if (header === null || headers.has(event.id)) { issue(event.id, "USAGE_HEADER_INVALID_OR_DUPLICATE"); continue; }
      headers.set(event.id, header);
      if (header.providerId === "stub") syntheticRequests++;
      continue;
    }
    if (event.event_type !== "request/response" && event.event_type !== "request/failure") continue;
    let meta: Record<string, unknown> | null;
    try { meta = object(JSON.parse(event.meta_json)); } catch { meta = null; }
    const headerId = typeof meta?.headerEventId === "string" ? meta.headerEventId : "";
    const header = headers.get(headerId);
    if (!meta || !header || settled.has(headerId) || meta.requestDigest !== header.requestDigest || meta.providerId !== header.providerId
        || meta.outcome !== (event.event_type === "request/response" ? "completed" : "failed")) {
      issue(event.id, "USAGE_OUTCOME_LINK_INVALID_OR_DUPLICATE"); continue;
    }
    settled.add(headerId);
    // The local recording demonstration is useful, but its zero tokens are not
    // observations about a remote provider or its cache.
    if (header.providerId === "stub") continue;
    const usage = object(meta.usage);
    if (usage === null) continue;
    if ((usage.reported !== undefined && typeof usage.reported !== "boolean")
        || (usage.complete !== undefined && typeof usage.complete !== "boolean")) {
      issue(event.id, "USAGE_PROVENANCE_INVALID"); continue;
    }
    // Historical 0/0 and compatibility placeholders cannot establish a report.
    // Preserve the evidence without inventing historical completeness.
    if (usage.reported !== true) continue;
    const values = Object.fromEntries(TOKEN_FIELDS.map(key => [key, count(usage[key])])) as Counts;
    if (values.inputTokens === null || values.outputTokens === null
        || TOKEN_FIELDS.some(key => usage[key] != null && values[key] === null)
        || (values.reasoningTokens !== null && values.reasoningTokens > values.outputTokens)) {
      issue(event.id, "USAGE_COUNTS_INVALID"); continue;
    }
    reportedRequests++;
    for (const key of TOKEN_FIELDS) {
      const value = values[key];
      if (value === null) continue;
      const metric = totals[key];
      metric.observedTokens = sum(metric.observedTokens ?? 0, value, event.id);
      metric.reportedRequests++;
    }
    if (usage.complete !== true) continue;
    completeRequests++;
    if (values.cacheReadTokens === null) continue;
    eligibleRequests++;
    if (values.cacheWriteTokens === null) unreportedWriteRequests++;
    cacheRead = sum(cacheRead, values.cacheReadTokens, event.id);
    // This denominator is deliberately named a REPORTED subtotal. An omitted
    // write field stays null above and is counted explicitly below, not called
    // measured zero. No all-input/all-request hit-rate claim is made from it.
    cacheInput = sum(cacheInput, values.inputTokens, event.id);
    cacheInput = sum(cacheInput, values.cacheReadTokens, event.id);
    if (values.cacheWriteTokens !== null) cacheInput = sum(cacheInput, values.cacheWriteTokens, event.id);
  }
  const requests = headers.size;
  const providerRequests = requests - syntheticRequests;
  const invalid = issues.length > 0;
  if (invalid) for (const key of TOKEN_FIELDS) { totals[key].observedTokens = null; totals[key].reportedRequests = 0; }
  return {
    scope: "recorded-session",
    status: invalid ? "invalid" : reportedRequests === 0 ? "unavailable" : completeRequests < providerRequests ? "partial" : "recorded",
    requests, syntheticRequests, reportedRequests, completeRequests,
    unreportedRequests: providerRequests - reportedRequests,
    pendingRequests: [...headers.keys()].filter(id => !settled.has(id)).length,
    totals,
    cache: { basis: "reported-input-token-subtotal", readShare: !invalid && eligibleRequests > 0 && cacheInput > 0 ? cacheRead / cacheInput : null,
      readTokens: !invalid && eligibleRequests > 0 ? cacheRead : null, inputTokens: !invalid && eligibleRequests > 0 ? cacheInput : null,
      eligibleRequests, excludedRequests: providerRequests - eligibleRequests, unreportedWriteRequests },
    issues
  };
}

function isReadableUsage(value: unknown): value is NativeRunUsage {
  const row = object(value), totals = object(row?.totals), cache = object(row?.cache);
  if (!row || row.scope !== "recorded-session" || !["recorded", "partial", "unavailable", "invalid"].includes(String(row.status))
      || !totals || !cache || cache.basis !== "reported-input-token-subtotal" || !Array.isArray(row.issues)) return false;
  for (const key of ["requests", "syntheticRequests", "reportedRequests", "completeRequests", "unreportedRequests", "pendingRequests"]) {
    if (count(row[key]) === null) return false;
  }
  for (const key of TOKEN_FIELDS) {
    const metric = object(totals[key]);
    if (!metric || count(metric.reportedRequests) === null || (metric.observedTokens !== null && count(metric.observedTokens) === null)) return false;
  }
  for (const key of ["eligibleRequests", "excludedRequests", "unreportedWriteRequests"]) if (count(cache[key]) === null) return false;
  for (const key of ["readTokens", "inputTokens"]) if (cache[key] !== null && count(cache[key]) === null) return false;
  if (cache.readShare !== null && (typeof cache.readShare !== "number" || !Number.isFinite(cache.readShare) || cache.readShare < 0 || cache.readShare > 1)) return false;
  if (Number(row.syntheticRequests) > Number(row.requests) || Number(row.reportedRequests) > Number(row.requests) - Number(row.syntheticRequests)
      || Number(row.completeRequests) > Number(row.reportedRequests) || Number(row.pendingRequests) > Number(row.requests)) return false;
  return true;
}

/** Same read-back projection in one-shot output, session inspection and chat. */
export function renderNativeRunUsage(value: unknown): string {
  if (value === undefined) return "Recorded session usage: unavailable (this summary contains no usage projection).";
  if (!isReadableUsage(value)) return "Recorded session usage: unavailable (unsupported or malformed usage projection).";
  const usage = value;
  if (usage.status === "invalid") return "Recorded session usage: unavailable because request metadata is invalid or inconsistent. Run amc agent-loop verify for this session and inspect its request records; no cache rate was computed.";
  const tokenText = (field: TokenField) => usage.totals[field].observedTokens === null ? "unreported" : String(usage.totals[field].observedTokens);
  const lines = [
    `Recorded session usage (${usage.status}; cumulative, not a verification): ${usage.reportedRequests}/${usage.requests - usage.syntheticRequests} provider requests reported usage; ${usage.completeRequests} complete, ${usage.pendingRequests} pending.`,
    `  Observed token subtotals: uncached input ${tokenText("inputTokens")}; output ${tokenText("outputTokens")}; cache read ${tokenText("cacheReadTokens")}; cache write ${tokenText("cacheWriteTokens")}.`,
    `  Cache-count coverage: read ${usage.totals.cacheReadTokens.reportedRequests}, write ${usage.totals.cacheWriteTokens.reportedRequests} reported requests; absent counts are not zero.`
  ];
  if (usage.cache.readShare === null) lines.push("  Cache-read share: unavailable (no positive eligible reported-input subtotal).");
  else lines.push(`  Cache-read share of reported input: ${(usage.cache.readShare * 100).toFixed(2)}% (${usage.cache.readTokens}/${usage.cache.inputTokens} tokens; ${usage.cache.eligibleRequests} complete reports).`);
  lines.push(`  Rate coverage: ${usage.cache.excludedRequests} provider requests excluded; ${usage.cache.unreportedWriteRequests} eligible reports omit cache-write counts. This is not an all-request hit probability or a cost estimate.`);
  if (usage.syntheticRequests > 0) lines.push(`  ${usage.syntheticRequests} local demonstration requests excluded from provider/cache measurements.`);
  return lines.join("\n");
}
