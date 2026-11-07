/**
 * `amc usage` (SH-OBS-02): usage and cost across native sessions, from verified signed rows, with unknowns kept unknown.
 *
 * Folding is per request: each `request/header` is paired with its settlement and classified by the same projections
 * `amc session show` uses (`projectNativeRunUsage`, which carries `projectNativeCost`), on that pair alone. A request is
 * attributed to a bucket by its header timestamp, so a session that crosses midnight or switches model lands in the
 * right buckets. A bucket that holds an invalid request claims no token total and an invalid cost projection.
 */
import type { NativeRunUsage, NativeUsageMetric } from "../agent/nativeRunUsage.js";
import { projectNativeRunUsage } from "../agent/nativeRunUsage.js";
import { budgetMeta, budgetSessionAgent, localDayStart, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { foldNativeRequestCosts, type NativeCostProjection } from "../budgets/nativeCostProjection.js";
import { nearestRank } from "../experiments/stats.js";
import { verifyMonitorTrustRoot } from "../persistence/sessionStoreVerification.js";
import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";
import type { EvidenceEvent } from "../types.js";

export type UsageBucketKey = "day" | "session" | "model" | "provider" | "agent";
const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"] as const;
type TokenField = typeof TOKEN_FIELDS[number];

export interface UsageReportOptions {
  readonly workspace: string;
  readonly since: number;
  readonly until: number;
  readonly by: UsageBucketKey;
  readonly agentId?: string;
  /** Day buckets in UTC instead of the local calendar day budgets use. */
  readonly utc?: boolean;
  readonly expectedMonitorFingerprint?: string;
}

export interface UsageBucket {
  readonly key: string;
  readonly requests: number;
  readonly syntheticRequests: number;
  readonly reportedRequests: number;
  readonly unreportedRequests: number;
  readonly failedRequests: number;
  readonly pendingRequests: number;
  readonly invalidRequests: number;
  /** Null observed tokens mean "not reported", never zero. */
  readonly tokens: Readonly<Record<TokenField, NativeUsageMetric>>;
  readonly cost: NativeCostProjection;
  readonly latency: { readonly p50Ms: number | null; readonly p95Ms: number | null; readonly measuredRequests: number };
}

export interface UsageReport {
  readonly schema: "amc.usage-report/v1";
  readonly by: UsageBucketKey;
  readonly window: { readonly since: number; readonly until: number; readonly dayBasis: "local" | "utc" };
  readonly verification: "signed-rows (anchored)" | "signed-rows (unanchored)";
  readonly buckets: readonly UsageBucket[];
  readonly totals: UsageBucket;
}

interface FoldedRequest {
  readonly key: string;
  readonly usage: NativeRunUsage;
  readonly durationMs: number | null;
}

function dayKey(ts: number, utc: boolean): string {
  if (utc) return new Date(ts).toISOString().slice(0, 10);
  const date = new Date(localDayStart(ts));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function bucketOf(key: string, folded: readonly FoldedRequest[]): UsageBucket {
  const invalid = folded.some((request) => request.usage.status === "invalid");
  const tokens = Object.fromEntries(TOKEN_FIELDS.map((field) => [field, { observedTokens: null as number | null, reportedRequests: 0 }])) as Record<TokenField, { observedTokens: number | null; reportedRequests: number }>;
  let synthetic = 0, reported = 0, unreported = 0, failed = 0, pending = 0;
  const durations: number[] = [];
  for (const { usage, durationMs } of folded) {
    synthetic += usage.syntheticRequests; reported += usage.reportedRequests; unreported += usage.unreportedRequests; pending += usage.pendingRequests;
    if (usage.requestReports?.[0]?.outcome === "failed") failed += 1;
    if (durationMs !== null) durations.push(durationMs);
    if (invalid) continue;
    for (const field of TOKEN_FIELDS) {
      const metric = usage.totals[field];
      if (metric.observedTokens === null) continue;
      tokens[field].observedTokens = (tokens[field].observedTokens ?? 0) + metric.observedTokens;
      tokens[field].reportedRequests += metric.reportedRequests;
    }
  }
  return { key, requests: folded.length, syntheticRequests: synthetic, reportedRequests: reported, unreportedRequests: unreported, failedRequests: failed, pendingRequests: pending,
    invalidRequests: folded.filter((request) => request.usage.status === "invalid").length, tokens,
    cost: foldNativeRequestCosts(folded.flatMap((request) => request.usage.cost?.requests ?? []), invalid),
    latency: { p50Ms: durations.length ? nearestRank(durations, 0.5) : null, p95Ms: durations.length ? nearestRank(durations, 0.95) : null, measuredRequests: durations.length } };
}

/** Pure fold over already-verified rows; `buildUsageReport` reads and verifies them first. */
export function foldUsageReport(rows: readonly EvidenceEvent[], options: Omit<UsageReportOptions, "workspace" | "expectedMonitorFingerprint">, verification: UsageReport["verification"]): UsageReport {
  const owners = new Map<string, string>();
  for (const row of rows) if (row.event_type === "session/open") owners.set(row.session_id, budgetSessionAgent(rows, row.session_id));
  const settlements = new Map<string, EvidenceEvent>();
  for (const row of rows) {
    if (row.event_type !== "request/response" && row.event_type !== "request/failure") continue;
    const headerId = budgetMeta(row).headerEventId;
    if (typeof headerId === "string" && !settlements.has(headerId)) settlements.set(headerId, row);
  }
  const folded: FoldedRequest[] = [];
  for (const header of rows) {
    if (header.event_type !== "request/header" || header.ts < options.since || header.ts > options.until) continue;
    const agent = owners.get(header.session_id) ?? null;
    if (agent === null || (options.agentId !== undefined && agent !== options.agentId)) continue;
    const settled = settlements.get(header.id);
    const usage = projectNativeRunUsage(settled ? [header, settled] : [header], header.session_id);
    const parsed = parseRequestHeaderMeta(header.meta_json);
    const settledMeta = settled ? budgetMeta(settled) : {};
    const durationMs = typeof settledMeta.durationMs === "number" && Number.isFinite(settledMeta.durationMs) && settledMeta.durationMs >= 0 ? settledMeta.durationMs : null;
    const key = options.by === "day" ? dayKey(header.ts, options.utc === true) : options.by === "session" ? header.session_id : options.by === "agent" ? agent
      : options.by === "provider" ? parsed?.providerId ?? "(invalid header)" : parsed ? `${parsed.providerId}/${parsed.model}` : "(invalid header)";
    folded.push({ key, usage, durationMs });
  }
  const groups = new Map<string, FoldedRequest[]>();
  for (const request of folded) groups.set(request.key, [...(groups.get(request.key) ?? []), request]);
  const buckets = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, members]) => bucketOf(key, members));
  return { schema: "amc.usage-report/v1", by: options.by, window: { since: options.since, until: options.until, dayBasis: options.utc ? "utc" : "local" },
    verification, buckets, totals: bucketOf("total", folded) };
}

/**
 * Read every native row through the verified budget reader (chain, signatures, envelopes, seals: fails closed with
 * `BudgetEvidenceIntegrityError`), pin the monitor key when a fingerprint is given, then fold.
 */
export function buildUsageReport(options: UsageReportOptions): UsageReport {
  const rows = readBudgetEvents(options.workspace);
  const errors: string[] = [];
  const root = verifyMonitorTrustRoot(options.workspace, options.expectedMonitorFingerprint ?? null, errors);
  if (errors.length > 0) throw new Error(`monitor key did not verify against the pin: ${errors.join("; ")}`);
  return foldUsageReport(rows, options, root.anchored ? "signed-rows (anchored)" : "signed-rows (unanchored)");
}

const usd = (value: number | null): string => value === null ? "unavailable" : `$${value.toFixed(6)}`;
const tok = (metric: NativeUsageMetric): string => metric.observedTokens === null ? "unreported" : `${metric.observedTokens} (${metric.reportedRequests} req)`;

export function renderUsageReport(report: UsageReport): string {
  const lines = [`Usage by ${report.by} from ${new Date(report.window.since).toISOString()} to ${new Date(report.window.until).toISOString()} (${report.verification}; day basis ${report.window.dayBasis})`];
  const render = (bucket: UsageBucket): void => {
    lines.push(`  ${bucket.key}`);
    lines.push(`    requests ${bucket.requests}: ${bucket.reportedRequests} reported, ${bucket.unreportedRequests} unreported, ${bucket.syntheticRequests} synthetic, ${bucket.failedRequests} failed, ${bucket.pendingRequests} pending${bucket.invalidRequests ? `, ${bucket.invalidRequests} INVALID (totals withheld)` : ""}`);
    lines.push(`    tokens: input ${tok(bucket.tokens.inputTokens)}; output ${tok(bucket.tokens.outputTokens)}; cache read ${tok(bucket.tokens.cacheReadTokens)}; cache write ${tok(bucket.tokens.cacheWriteTokens)}`);
    lines.push(`    cost: reported ${usd(bucket.cost.reportedSubtotalUsd)}; catalog estimate ${usd(bucket.cost.estimatedSubtotalUsd)}; ${bucket.cost.status} (${bucket.cost.unknownRequests} unknown requests)`);
    lines.push(`    latency: p50 ${bucket.latency.p50Ms === null ? "unavailable" : `${bucket.latency.p50Ms} ms`}; p95 ${bucket.latency.p95Ms === null ? "unavailable" : `${bucket.latency.p95Ms} ms`} over ${bucket.latency.measuredRequests} measured requests`);
  };
  if (report.buckets.length === 0) lines.push("  no native requests in this window");
  for (const bucket of report.buckets) render(bucket);
  lines.push("  ---");
  render(report.totals);
  lines.push("  Unreported counts are not zero; catalog estimates are indicative, not billing; failed requests keep their reported usage when the provider reported it.");
  return lines.join("\n");
}
