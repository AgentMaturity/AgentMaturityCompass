import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { normalizeEvidenceRefs } from "./evidenceRefs.js";
import type {
  LiveDriftAlert,
  LiveDriftMetricId,
  LiveDriftReceipt,
  LiveDriftSampleRow,
  LiveDriftSeverity,
  LiveDriftWindow,
} from "./liveDriftAlerts.js";

/**
 * The distribution-monitor arithmetic, shared by the Family-B satellites (P5.2b).
 *
 * These eight functions were **byte-identical in all eight** files —
 * aiReputationClaude, awesomeAgentMemory, ctfAgentBenchmark, darwinGodelMachine,
 * agentReadingTest, garage, llmFighter, railScore — 50 lines copied eight times.
 * Verified by hashing each function body, not by reading them.
 *
 * WHY THE DEFAULTS HERE ARE NOT THE ONES IN `proofDelegatedMonitor.ts`. This
 * family rounds to SIX places and leaves `unique` UNSORTED; the Family-A
 * monitors round to four and sort. Both reach `sha256Hex(canonicalize(...))`,
 * because `canonicalize` maps arrays without sorting them — so element order
 * and rounding are both published-artifact behaviour.
 *
 * Unifying the two families would therefore change every `receiptHash` and
 * `rowProofHash` on one side of the split. That is a methodology decision with
 * a migration note, not a refactor, so the two arithmetics stay separate and
 * this module is deliberately Family-B only. `tests/driftMath.test.ts` pins
 * both properties so a later "tidy-up" cannot quietly converge them.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Six places — the Family-B convention. Family A uses four. */
export function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function mean(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Deliberately NOT sorted — see the module note. */
export function unique(values: unknown): string[] {
  return normalizeEvidenceRefs(values);
}

export function boolMean(values: boolean[]): number {
  return values.length === 0 ? 0 : round(values.filter(Boolean).length / values.length);
}

/** Nearest-rank percentile over the finite values, zero for an empty window. */
export function percentile(values: number[], p: number): number {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length === 0) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((p / 100) * finite.length) - 1));
  return round(finite[index]!);
}

/**
 * Relative increase, floored at zero.
 *
 * A non-finite or non-positive baseline cannot express a ratio, so it reports
 * the boolean fact instead: 1 when live is higher, 0 otherwise. That keeps a
 * cold-start window from reading as an infinite regression.
 */
export function ratioIncrease(baseline: number, live: number): number {
  if (!Number.isFinite(baseline) || !Number.isFinite(live) || baseline <= 0) return live > baseline ? 1 : 0;
  return round(Math.max(0, (live - baseline) / baseline));
}

export function labelDistribution<T>(rows: T[], labelFor: (row: T) => string): Record<string, number> {
  if (rows.length === 0) return {};
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFor(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].map(([label, count]) => [label, round(count / rows.length)]));
}

export function totalVariationDistance(left: Record<string, number>, right: Record<string, number>): number {
  const labels = new Set([...Object.keys(left), ...Object.keys(right)]);
  let total = 0;
  for (const label of labels) {
    total += Math.abs((left[label] ?? 0) - (right[label] ?? 0));
  }
  return round(total / 2);
}

/**
 * Lift a domain window into the engine's window shape.
 *
 * Identical in all eight Family-B satellites apart from the parameter type —
 * measured at 0.997 normalised similarity — so the row mapper is a callback and
 * the rest is generic.
 */
export function toLiveDriftWindow<T>(
  window: { windowId: string; startedAt: string; endedAt: string; rows: T[] },
  toRow: (row: T) => LiveDriftSampleRow,
): LiveDriftWindow {
  return {
    windowId: window.windowId,
    startedAt: window.startedAt,
    endedAt: window.endedAt,
    rows: window.rows.map(toRow),
  };
}

/** The window pair every Family-B alert draws its evidence refs from. */
export interface DriftAlertSource {
  readonly sourceRefs?: string[];
  readonly baselineWindow: { readonly rows: ReadonlyArray<{ evidenceRefs?: unknown; signedEvidenceRefs?: unknown }> };
  readonly liveWindow: { readonly rows: ReadonlyArray<{ evidenceRefs?: unknown; signedEvidenceRefs?: unknown }> };
}

/**
 * The Family-B alert builder, closed over the two things that actually vary.
 *
 * This function was 236 lines across the eight satellites at 0.988 normalised
 * similarity — the same body eight times, differing only in the `alertId` slug
 * and which DEFAULT_* constants seed the evidence refs.
 *
 * REF ORDER IS LOAD-BEARING. `unique` here does not sort and `canonicalize`
 * maps arrays without sorting, so this exact sequence — caller refs, then the
 * defaults, then baseline rows, then live rows — reaches the receipt hash.
 * `defaultRefs` must be given in the order the original file listed them.
 */
export function createDriftAlertBuilder(alertPrefix: string, defaultRefs: readonly string[]) {
  return function buildAlert(
    input: DriftAlertSource,
    metricId: LiveDriftMetricId,
    observed: number,
    threshold: number,
    message: string,
    severity: LiveDriftSeverity,
  ): LiveDriftAlert {
    const evidenceRefs = unique([
      ...(input.sourceRefs ?? []),
      ...defaultRefs,
      ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
      ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.evidenceRefs)),
    ]);
    const signedEvidenceRefs = unique([
      ...input.baselineWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
      ...input.liveWindow.rows.flatMap((row) => normalizeEvidenceRefs(row.signedEvidenceRefs)),
    ]);
    return {
      alertId: `${alertPrefix}:${metricId}:${sha256Hex(canonicalize({ metricId, observed, threshold, message })).slice(0, 12)}`,
      metricId,
      severity,
      message,
      threshold,
      observed: round(observed),
      evidenceRefs,
      signedEvidenceRefs,
    };
  };
}

export function withAdditionalAlerts(receipt: LiveDriftReceipt, additionalAlerts: LiveDriftAlert[]): LiveDriftReceipt {
  if (additionalAlerts.length === 0) return receipt;
  const { receiptHash: _receiptHash, ...withoutHash } = receipt;
  const alerts = [...receipt.alerts, ...additionalAlerts];
  const updatedWithoutHash = {
    ...withoutHash,
    alerts,
    recommendation: "alert" as const,
    failClosed: true,
    summary: `${alerts.length} live drift alert(s), recommendation=alert`,
  };
  return {
    ...updatedWithoutHash,
    receiptHash: sha256Hex(canonicalize(updatedWithoutHash)),
  };
}
