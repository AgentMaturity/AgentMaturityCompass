import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { normalizeEvidenceRefs } from "./evidenceRefs.js";
import type { LiveDriftAlert, LiveDriftReceipt } from "./liveDriftAlerts.js";

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
