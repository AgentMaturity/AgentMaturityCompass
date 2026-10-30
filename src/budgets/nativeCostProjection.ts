import { displayEvidenceIdentifier as displayIdentifier } from "../session/evidenceIdentifier.js";
/** Versioned catalog estimates alongside observed cost. Never budget measurements or USD reservations. */
import { parseModelMetadataSnapshot, type ModelMetadataSnapshot } from "../llm/modelCatalog.js";
import { parseRequestHeaderMeta, type RequestHeaderMeta } from "../session/requestHeaderMeta.js";
import type { EvidenceEvent } from "../types.js";
import { budgetMeta, measuredUsage } from "./nativeBudgetUsage.js";

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const COMPONENTS = [
  ["inputTokens", "inputPer1kTokens"], ["outputTokens", "outputPer1kTokens"],
  ["cacheReadTokens", "cacheReadPer1kTokens"], ["cacheWriteTokens", "cacheWritePer1kTokens"]
] as const;
/** Invalid provenance cannot turn an amount into a measured request cost. */
function invalidUsage(usage: Record<string, unknown>): boolean {
  return (usage.reported !== undefined && typeof usage.reported !== "boolean")
    || (usage.complete !== undefined && typeof usage.complete !== "boolean")
    || (usage.complete === true && usage.reported !== true)
    || (usage.reported === true && (count(usage.inputTokens) === null || count(usage.outputTokens) === null))
    || COMPONENTS.some(([field]) => usage[field] != null && count(usage[field]) === null)
    || (usage.reasoningTokens != null && (count(usage.reasoningTokens) === null || count(usage.outputTokens) === null
      || Number(usage.reasoningTokens) > Number(usage.outputTokens)))
    || ["cost_usd", "costUsd", "total_cost_usd", "totalCostUsd"].some(field => usage[field] != null && !amount(usage[field]));
}
export interface NativeCostEstimate {
  /** Known component subtotal only; completeness must accompany any cost claim. */
  readonly estimatedCostUsd: number | null;
  readonly estimateComplete: boolean;
  readonly missingComponents: readonly string[];
  readonly catalogDigest: string | null;
}

/** Native counters are disjoint; reasoning is an output subset and total/alias fields are never added. */
export function estimateNativeUsage(metadata: unknown, value: unknown): NativeCostEstimate {
  const snapshot = parseModelMetadataSnapshot(metadata);
  const usage = object(value);
  const unavailable = (reason: string): NativeCostEstimate => ({ estimatedCostUsd: null, estimateComplete: false,
    missingComponents: [reason], catalogDigest: snapshot?.digest ?? null });
  if (!snapshot?.pricing) return unavailable("model-price");
  if (!usage || usage.reported !== true) return unavailable("reported-usage");
  if (invalidUsage(usage)) return unavailable("invalid-usage");
  let rates = snapshot.pricing;
  const tiers = rates.tiers;
  if (tiers !== null) {
    const inputs = [usage.inputTokens, usage.cacheReadTokens, usage.cacheWriteTokens].map(count);
    if (inputs.some(value => value === null)) return unavailable("tier-input-usage");
    const input = inputs.reduce<number>((sum, value) => sum + value!, 0);
    if (!Number.isSafeInteger(input)) return unavailable("invalid-usage");
    const tier = tiers.find(value => value.upToInputTokens === null || input <= value.upToInputTokens);
    if (!tier) return unavailable("price-tier");
    rates = { ...rates, ...tier };
  }
  let subtotal = 0, priced = 0;
  const missing: string[] = [];
  for (const [field, rateField] of COMPONENTS) {
    const tokens = count(usage[field]);
    const rate = rates[rateField];
    if (tokens === null) { missing.push(field); continue; }
    // A measured zero needs no rate. Missing counters are never replaced by zero.
    if (tokens !== 0 && rate === null) { missing.push(rateField); continue; }
    subtotal += tokens * (rate ?? 0) / 1000;
    priced++;
  }
  if (!Number.isFinite(subtotal)) return unavailable("cost-overflow");
  if (usage.complete !== true) missing.push("final-usage");
  return { estimatedCostUsd: priced === 0 ? null : subtotal, estimateComplete: priced > 0 && missing.length === 0,
    missingComponents: missing, catalogDigest: snapshot.digest };
}

interface NativeRequestCost extends NativeCostEstimate {
  readonly headerEventId: string | null;
  readonly outcomeEventId: string | null;
  readonly reportedCostUsd: number | null;
  /** Complete provider-reported cost wins; otherwise only complete indicative estimates are attributable. */
  readonly attributedCostUsd: number | null;
  readonly costBasis: "provider-reported" | "catalog-estimate" | "unavailable";
  readonly freshness: "current" | "stale" | "unknown";
  readonly asOf: string | null;
  readonly source: string | null;
}
export interface NativeCostProjection {
  readonly schemaVersion: 1;
  readonly basis: "pinned-catalog-estimates-and-reported-cost";
  readonly status: "complete" | "partial" | "unavailable" | "invalid";
  readonly reportedSubtotalUsd: number | null;
  readonly estimatedSubtotalUsd: number | null;
  readonly attributedSubtotalUsd: number | null;
  readonly completeRequests: number;
  readonly partialRequests: number;
  readonly unknownRequests: number;
  readonly requests: readonly NativeRequestCost[];
}
function freshness(snapshot: ModelMetadataSnapshot | null, now: number): NativeRequestCost["freshness"] {
  if (!snapshot?.pricing?.asOf || snapshot.pricing.freshness === "unknown" || snapshot.pricing.freshness === null) return "unknown";
  const age = now - Date.parse(snapshot.pricing.asOf);
  return !Number.isFinite(age) || age < 0 ? "unknown" : age > 30 * 86400_000 ? "stale" : "current";
}

/** Pure readback. Never look up today's catalog when replaying an older header without a snapshot. */
export function projectNativeCost(events: readonly EvidenceEvent[], sessionId: string, now = Date.now()): NativeCostProjection {
  const headers = new Map<string, RequestHeaderMeta>();
  const reports = new Map<string, NativeRequestCost>();
  const settled = new Set<string>();
  const seen = new Set<string>();
  let invalid = false;
  for (const event of events) {
    if (event.session_id !== sessionId || !["request/header", "request/response", "request/failure"].includes(event.event_type)) continue;
    if (displayIdentifier(event.id) === null) invalid = true;
    if (seen.has(event.id)) { invalid = true; continue; }
    seen.add(event.id);
    if (event.event_type === "request/header") {
      const header = parseRequestHeaderMeta(event.meta_json);
      if (!header) { invalid = true; continue; }
      headers.set(event.id, header);
      const metadata = header.modelMetadata ?? null;
      reports.set(event.id, { ...estimateNativeUsage(metadata, null), headerEventId: displayIdentifier(event.id), outcomeEventId: null,
        reportedCostUsd: null, attributedCostUsd: null, costBasis: "unavailable", freshness: freshness(metadata, now),
        asOf: metadata?.pricing?.asOf ?? null, source: metadata?.pricing?.source ?? null });
      continue;
    }
    let meta: Record<string, unknown>;
    try { meta = budgetMeta(event); } catch { invalid = true; continue; }
    const headerId = typeof meta.headerEventId === "string" ? meta.headerEventId : "";
    const header = headers.get(headerId);
    if (!header || settled.has(headerId) || meta.providerId !== header.providerId || meta.requestDigest !== header.requestDigest
        || meta.outcome !== (event.event_type === "request/response" ? "completed" : "failed")) { invalid = true; continue; }
    settled.add(headerId);
    const values = object(meta.usage);
    if ((meta.dispatchAttempted !== undefined && typeof meta.dispatchAttempted !== "boolean") || (values && (invalidUsage(values)
      || (values.reported === true && meta.dispatchAttempted === false)
      || (values.complete === true && event.event_type !== "request/response")))) { invalid = true; continue; }
    const estimate = estimateNativeUsage(header.modelMetadata, meta.usage);
    const measured = measuredUsage(meta.usage, true);
    const usage = object(meta.usage);
    const final = event.event_type === "request/response" && usage?.complete === true && meta.dispatchAttempted !== false;
    const reportedCostUsd = header.providerId === "stub" || usage?.reported !== true ? null : measured.costKnown ? measured.cost : null;
    const estimateComplete = header.providerId !== "stub" && final && estimate.estimateComplete;
    const attributedCostUsd = final && reportedCostUsd !== null ? reportedCostUsd : estimateComplete ? estimate.estimatedCostUsd : null;
    reports.set(headerId, { ...reports.get(headerId)!, ...estimate, estimateComplete,
      outcomeEventId: displayIdentifier(event.id), reportedCostUsd, attributedCostUsd,
      costBasis: final && reportedCostUsd !== null ? "provider-reported" : estimateComplete ? "catalog-estimate" : "unavailable" });
  }
  const requests: NativeRequestCost[] = [...reports.values()].map(report => invalid ? { ...report, estimatedCostUsd: null,
    reportedCostUsd: null, attributedCostUsd: null, estimateComplete: false, costBasis: "unavailable", missingComponents: ["invalid-evidence"] } : report);
  const subtotal = (field: "reportedCostUsd" | "estimatedCostUsd" | "attributedCostUsd"): number | null => {
    const values = requests.map(value => value[field]).filter((value): value is number => value !== null);
    const sum = values.reduce((a, b) => a + b, 0);
    return invalid || values.length === 0 || !Number.isFinite(sum) ? null : sum;
  };
  const completeRequests = invalid ? 0 : requests.filter(value => value.attributedCostUsd !== null).length;
  const partialRequests = invalid ? 0 : requests.filter(value => value.attributedCostUsd === null
    && (value.reportedCostUsd !== null || value.estimatedCostUsd !== null)).length;
  return { schemaVersion: 1, basis: "pinned-catalog-estimates-and-reported-cost",
    status: invalid ? "invalid" : requests.length > 0 && completeRequests === requests.length ? "complete"
      : completeRequests + partialRequests > 0 ? "partial" : "unavailable",
    reportedSubtotalUsd: subtotal("reportedCostUsd"), estimatedSubtotalUsd: subtotal("estimatedCostUsd"),
    attributedSubtotalUsd: subtotal("attributedCostUsd"), completeRequests, partialRequests,
    unknownRequests: requests.length - completeRequests - partialRequests, requests };
}

/** Render only self-consistent serialized views; old or malformed summaries stay unavailable. */
export function renderNativeCost(value: unknown): string {
  const unavailable = "Native cost: unavailable (older or invalid cost projection).";
  const row = object(value);
  if (!row || row.schemaVersion !== 1 || row.basis !== "pinned-catalog-estimates-and-reported-cost"
      || !["complete", "partial", "unavailable"].includes(String(row.status)) || !Array.isArray(row.requests)
      || ["reportedSubtotalUsd", "estimatedSubtotalUsd", "attributedSubtotalUsd"].some(key => row[key] !== null && !amount(row[key]))
      || ["completeRequests", "partialRequests", "unknownRequests"].some(key => count(row[key]) === null)) return unavailable;
  const evidenceIds = new Set<string>();
  let complete = 0, partial = 0, stale = 0;
  for (const value of row.requests) {
    const request = object(value);
    if (!request || typeof request.headerEventId !== "string" || displayIdentifier(request.headerEventId) !== request.headerEventId || evidenceIds.has(request.headerEventId)
      || ["reportedCostUsd", "estimatedCostUsd", "attributedCostUsd"].some(key => request[key] !== null && !amount(request[key]))
      || typeof request.estimateComplete !== "boolean" || !["current", "stale", "unknown"].includes(String(request.freshness))
      || !["provider-reported", "catalog-estimate", "unavailable"].includes(String(request.costBasis))) return unavailable;
    evidenceIds.add(request.headerEventId);
    if (request.outcomeEventId !== null && (typeof request.outcomeEventId !== "string" || displayIdentifier(request.outcomeEventId) !== request.outcomeEventId || evidenceIds.has(request.outcomeEventId))) return unavailable;
    if (typeof request.outcomeEventId === "string") evidenceIds.add(request.outcomeEventId);
    if ((request.outcomeEventId === null && (request.reportedCostUsd !== null || request.estimatedCostUsd !== null || request.estimateComplete))
      || (request.estimateComplete && request.costBasis === "unavailable")
      || (request.costBasis === "catalog-estimate" && request.reportedCostUsd !== null)) return unavailable;
    if ((request.estimateComplete && request.estimatedCostUsd === null)
      || (request.costBasis === "provider-reported" && (request.reportedCostUsd === null || request.attributedCostUsd !== request.reportedCostUsd))
      || (request.costBasis === "catalog-estimate" && (!request.estimateComplete || request.attributedCostUsd !== request.estimatedCostUsd))
      || (request.costBasis === "unavailable" && request.attributedCostUsd !== null)) return unavailable;
    if (request.attributedCostUsd !== null) complete++;
    else if (request.reportedCostUsd !== null || request.estimatedCostUsd !== null) partial++;
    if (request.freshness === "stale") stale++;
  }
  if (row.completeRequests !== complete || row.partialRequests !== partial || row.unknownRequests !== row.requests.length - complete - partial
    || row.status !== (row.requests.length > 0 && complete === row.requests.length ? "complete" : complete + partial > 0 ? "partial" : "unavailable")) return unavailable;
  for (const [field, total] of [["reportedCostUsd", "reportedSubtotalUsd"], ["estimatedCostUsd", "estimatedSubtotalUsd"], ["attributedCostUsd", "attributedSubtotalUsd"]]) {
    const values = row.requests.map(value => (value as Record<string, unknown>)[field!]).filter(value => value !== null) as number[];
    if (row[total!] !== (values.length === 0 ? null : values.reduce((a, b) => a + b, 0))) return unavailable;
  }
  const usd = (value: unknown) => value === null ? "unavailable" : `$${Number(value).toFixed(6)}`;
  return `Provider-reported cost subtotal: ${usd(row.reportedSubtotalUsd)}. Catalog estimate subtotal (indicative, not billing): ${usd(row.estimatedSubtotalUsd)}. `
    + `Cost coverage: ${row.completeRequests} complete, ${row.partialRequests} partial, ${row.unknownRequests} unknown requests; ${stale} stale snapshots (over 30 days). `
    + "Reported amounts take precedence per request; estimates do not change measured budget usage or establish a prospective USD ceiling.";
}
