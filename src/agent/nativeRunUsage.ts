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
/** Selected names from recorded rows, not current route configuration or remote identity proof. */
export interface NativeUsageRequest {
  readonly headerEventId: string | null;
  readonly outcomeEventId: string | null;
  readonly providerId: string | null;
  readonly model: string | null;
  readonly encoderId: string | null;
  readonly encoderVersion: number | null;
  readonly adapterId: string | null;
  readonly adapterVersion: number | null;
  readonly outcome: "pending" | "completed" | "failed";
  readonly dispatchAttempted: boolean | null;
  readonly usageStatus: "unavailable" | "partial" | "complete" | "synthetic" | "invalid";
  readonly cacheReadTokens: number | null;
}
export interface NativeRequestCache {
  readonly basis: "completed-requests-with-reported-cache-read";
  /** A hit means this completed request explicitly reported positive cache-read tokens. */
  readonly hitRequests: number;
  readonly eligibleRequests: number;
  readonly excludedRequests: number;
  readonly hitRate: number | null;
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
  /** Optional only for old serialized summaries. No credentials, params, endpoints or failure text. */
  readonly requestReports?: readonly NativeUsageRequest[];
  readonly requestCache?: NativeRequestCache;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/** Bounded identifier labels only. Unsafe/URL-shaped labels are withheld, never truncated into another identity. */
function displayIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)
    && !value.includes("//") && !/^(?:https?:|file:|sk[-_])/i.test(value) ? value : null;
}
function version(value: unknown): number | null {
  const parsed = count(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/** Fold matching recorded request outcomes once; step/end copies are never added. */
export function projectNativeRunUsage(events: readonly EvidenceEvent[], sessionId: string): NativeRunUsage {
  const headers = new Map<string, RequestHeaderMeta>();
  const requestReports = new Map<string, NativeUsageRequest>();
  const settled = new Set<string>();
  const issues: { eventId: string; code: string }[] = [];
  const totals = Object.fromEntries(TOKEN_FIELDS.map(key => [key, { observedTokens: null, reportedRequests: 0 }])) as Record<TokenField, { observedTokens: number | null; reportedRequests: number }>;
  let syntheticRequests = 0, reportedRequests = 0, completeRequests = 0;
  let eligibleRequests = 0, unreportedWriteRequests = 0, cacheRead = 0, cacheInput = 0;
  let hitRequests = 0;
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
      requestReports.set(event.id, {
        headerEventId: displayIdentifier(event.id), outcomeEventId: null,
        providerId: displayIdentifier(header.providerId), model: displayIdentifier(header.model),
        encoderId: displayIdentifier(header.encoderId), encoderVersion: version(header.encoderVersion),
        adapterId: null, adapterVersion: null, outcome: "pending", dispatchAttempted: null,
        usageStatus: header.providerId === "stub" ? "synthetic" : "unavailable", cacheReadTokens: null
      });
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
    const report: NativeUsageRequest = {
      ...requestReports.get(headerId)!, outcomeEventId: displayIdentifier(event.id),
      adapterId: displayIdentifier(meta.adapterId), adapterVersion: version(meta.adapterVersion),
      outcome: event.event_type === "request/response" ? "completed" : "failed",
      dispatchAttempted: typeof meta.dispatchAttempted === "boolean" ? meta.dispatchAttempted : null
    };
    requestReports.set(headerId, report);
    if (meta.dispatchAttempted !== undefined && typeof meta.dispatchAttempted !== "boolean") {
      requestReports.set(headerId, { ...report, usageStatus: "invalid" });
      issue(event.id, "USAGE_PROVENANCE_INVALID"); continue;
    }
    // The local recording demonstration is useful, but its zero tokens are not
    // observations about a remote provider or its cache.
    if (header.providerId === "stub") continue;
    const usage = object(meta.usage);
    if (usage === null) continue;
    if ((usage.reported !== undefined && typeof usage.reported !== "boolean")
        || (usage.complete !== undefined && typeof usage.complete !== "boolean")
        || (usage.complete === true && (usage.reported !== true || report.outcome !== "completed"))
        || (usage.reported === true && meta.dispatchAttempted === false)) {
      requestReports.set(headerId, { ...report, usageStatus: "invalid" });
      issue(event.id, "USAGE_PROVENANCE_INVALID"); continue;
    }
    // Historical 0/0 and compatibility placeholders cannot establish a report.
    // Preserve the evidence without inventing historical completeness.
    if (usage.reported !== true) continue;
    const values = Object.fromEntries(TOKEN_FIELDS.map(key => [key, count(usage[key])])) as Counts;
    if (values.inputTokens === null || values.outputTokens === null
        || TOKEN_FIELDS.some(key => usage[key] != null && values[key] === null)
        || (values.reasoningTokens !== null && values.reasoningTokens > values.outputTokens)) {
      requestReports.set(headerId, { ...report, usageStatus: "invalid" });
      issue(event.id, "USAGE_COUNTS_INVALID"); continue;
    }
    requestReports.set(headerId, { ...report, usageStatus: usage.complete === true ? "complete" : "partial",
      cacheReadTokens: values.cacheReadTokens });
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
    if (values.cacheReadTokens > 0) hitRequests++;
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
    issues,
    requestReports: [...requestReports.values()],
    requestCache: { basis: "completed-requests-with-reported-cache-read", hitRequests, eligibleRequests,
      excludedRequests: providerRequests - eligibleRequests,
      hitRate: !invalid && eligibleRequests > 0 ? hitRequests / eligibleRequests : null }
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

/** Validate the added serialized view before displaying names or a request denominator.
 * Historical summaries cannot acquire identity or hits from aggregate token totals.
 */
function hasReadableRequestReports(usage: NativeRunUsage): boolean {
  if (!Array.isArray(usage.requestReports) || usage.requestReports.length !== usage.requests) return false;
  const cache = object(usage.requestCache);
  if (!cache || cache.basis !== "completed-requests-with-reported-cache-read") return false;
  const headers = new Set<string>(), outcomes = new Set<string>();
  let eligible = 0, hits = 0, synthetic = 0, pending = 0, reported = 0, complete = 0;
  for (const value of usage.requestReports) {
    const row = object(value);
    if (!row) return false;
    for (const key of ["headerEventId", "outcomeEventId", "providerId", "model", "encoderId", "adapterId"]) {
      if (row[key] !== null && displayIdentifier(row[key]) !== row[key]) return false;
    }
    for (const key of ["encoderVersion", "adapterVersion"]) {
      if (row[key] !== null && version(row[key]) !== row[key]) return false;
    }
    for (const [key, seen] of [["headerEventId", headers], ["outcomeEventId", outcomes]] as const) {
      const id = row[key];
      if (typeof id === "string") {
        if (seen.has(id)) return false;
        seen.add(id);
      }
    }
    if (!["pending", "completed", "failed"].includes(String(row.outcome))
        || !["unavailable", "partial", "complete", "synthetic"].includes(String(row.usageStatus))
        || (row.dispatchAttempted !== null && typeof row.dispatchAttempted !== "boolean")
        || (row.cacheReadTokens !== null && count(row.cacheReadTokens) === null)) return false;
    if (row.outcome === "pending") {
      pending++;
      if (row.outcomeEventId !== null || row.dispatchAttempted !== null
          || !["unavailable", "synthetic"].includes(String(row.usageStatus))) return false;
    }
    if (row.usageStatus === "synthetic") {
      if (row.providerId !== "stub" || row.cacheReadTokens !== null) return false;
      synthetic++;
      continue;
    }
    if (row.providerId === "stub") return false;
    if (row.usageStatus === "complete" || row.usageStatus === "partial") {
      if (row.dispatchAttempted === false || row.outcome === "pending") return false;
      reported++;
    } else if (row.cacheReadTokens !== null) return false;
    if (row.usageStatus !== "complete") continue;
    if (row.outcome !== "completed") return false;
    complete++;
    if (row.cacheReadTokens === null) continue;
    eligible++;
    if (Number(row.cacheReadTokens) > 0) hits++;
  }
  return synthetic === usage.syntheticRequests && pending === usage.pendingRequests
    && reported === usage.reportedRequests && complete === usage.completeRequests
    && usage.unreportedRequests === usage.requests - synthetic - reported
    && eligible === usage.cache.eligibleRequests
    && usage.cache.excludedRequests === usage.requests - synthetic - eligible
    && cache.eligibleRequests === eligible && cache.hitRequests === hits
    && cache.excludedRequests === usage.requests - synthetic - eligible
    && cache.hitRate === (eligible === 0 ? null : hits / eligible);
}

function renderRequestReports(usage: NativeRunUsage): string[] {
  if (!hasReadableRequestReports(usage)) {
    return ["Recorded provider/model identity and request cache-hit rate: unavailable (older or malformed request projection); token share is not a substitute."];
  }
  const reports = usage.requestReports!;
  const cache = usage.requestCache!;
  const label = (value: string | number | null) => value === null ? "unavailable/withheld" : String(value);
  const lines = ["Recorded request identities (header + linked outcome; configured labels, not remote identity or capability proof):"];
  // Text remains bounded for long sessions; JSON preserves every request reference.
  const visible = reports.slice(0, 10);
  for (const report of visible) {
    lines.push(`  provider ${label(report.providerId)}; model ${label(report.model)}; encoder ${label(report.encoderId)}@${label(report.encoderVersion)}; adapter ${label(report.adapterId)}@${label(report.adapterVersion)}.`);
    lines.push(`    ${report.outcome}; usage ${report.usageStatus}; cache-read tokens ${report.cacheReadTokens === null ? "unreported" : report.cacheReadTokens}; dispatch attempted ${report.dispatchAttempted === null ? "unavailable" : report.dispatchAttempted ? "yes (recorded)" : "no (recorded)"}.`);
    lines.push(`    evidence: request/header ${label(report.headerEventId)}; outcome ${report.outcome === "pending" ? "pending" : label(report.outcomeEventId)}.`);
  }
  if (reports.length === 0) lines.push("  No request headers recorded; no provider/model identity inferred.");
  if (reports.length > visible.length) lines.push(`  ${reports.length - visible.length} further request identities omitted from text; use amc session show <session-id> --json for the full projection.`);
  if (cache.hitRate === null) lines.push("  Request cache-read hit rate: unavailable (no eligible completed request reported a cache-read count).");
  else lines.push(`  Request cache-read hit rate${cache.excludedRequests > 0 ? " (eligible subset)" : ""}: ${(cache.hitRate * 100).toFixed(2)}% (${cache.hitRequests}/${cache.eligibleRequests} eligible completed requests).`);
  lines.push(`  Request-rate basis: a hit means reported cache-read tokens > 0; ${cache.excludedRequests} provider requests excluded. Failed, partial, pending, missing-cache and synthetic requests do not supply hits or a denominator.`);
  lines.push(`  Recorded request outcomes: ${reports.filter(row => row.outcome === "failed").length} failed; ${reports.filter(row => row.usageStatus === "partial").length} partial usage reports (may overlap failures). No claim about server cache lookups, cost, latency or real-provider validation.`);
  return lines;
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
    `  Observed token subtotals: adapter-normalized input ${tokenText("inputTokens")}; output ${tokenText("outputTokens")}; cache read ${tokenText("cacheReadTokens")}; cache write ${tokenText("cacheWriteTokens")}.`,
    `  Cache-count coverage: read ${usage.totals.cacheReadTokens.reportedRequests}, write ${usage.totals.cacheWriteTokens.reportedRequests} reported requests; absent counts are not zero.`
  ];
  if (usage.cache.readShare === null) lines.push("  Cache-read share: unavailable (no positive eligible reported-input subtotal).");
  else lines.push(`  Cache-read share of reported input: ${(usage.cache.readShare * 100).toFixed(2)}% (${usage.cache.readTokens}/${usage.cache.inputTokens} tokens; ${usage.cache.eligibleRequests} complete reports).`);
  lines.push(`  Rate coverage: ${usage.cache.excludedRequests} provider requests excluded; ${usage.cache.unreportedWriteRequests} eligible reports omit cache-write counts. This is not an all-request hit probability or a cost estimate.`);
  if (usage.syntheticRequests > 0) lines.push(`  ${usage.syntheticRequests} local demonstration requests excluded from provider/cache measurements.`);
  lines.push(...renderRequestReports(usage));
  return lines.join("\n");
}
