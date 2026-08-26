import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/utils/json.js";
import {
  clamp01,
  labelDistribution,
  mean,
  nonEmpty,
  round,
  totalVariationDistance,
  unique,
  withAdditionalAlerts
} from "../src/watch/driftMath.js";
import type { LiveDriftAlert, LiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";

/**
 * The Family-B drift arithmetic (P5.2b, ADR-0025).
 *
 * These eight functions were byte-identical in all eight Family-B satellites —
 * 50 lines copied eight times — and now live once. The extraction is verified
 * by characterization hashes on the monitors themselves; what this file pins is
 * the part those hashes CANNOT protect: the two conventions that differ from
 * Family A and must not be quietly converged by a later tidy-up.
 *
 * Both reach `sha256Hex(canonicalize(...))`, so unifying either would change
 * every published receipt on one side of the split. That is a methodology
 * decision with a migration note, not a refactor.
 */
describe("the two conventions that separate Family B from Family A", () => {
  it("rounds to six places, where Family A rounds to four", () => {
    // 2/3 is the discriminating case: 0.666667 at 6dp, 0.6667 at 4dp.
    expect(round(2 / 3)).toBe(0.666667);
    expect(round(2 / 3)).not.toBe(0.6667);
    expect(round(1 / 3)).toBe(0.333333);
  });

  it("leaves evidence refs UNSORTED, where Family A sorts them", () => {
    // `canonicalize` maps arrays without sorting, so this ordering reaches the
    // receipt hash. Sorting here would change every Family-B receipt.
    expect(unique(["z", "a", "m"])).toEqual(["z", "a", "m"]);
    expect(canonicalize(unique(["z", "a"]))).not.toBe(canonicalize(unique(["a", "z"])));
  });
});

describe("the arithmetic itself", () => {
  it("clamps to the unit interval and treats non-finite as zero", () => {
    expect(clamp01(1.4)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(Number.NaN), "a NaN score is absent, not maximal").toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("means an empty set to the supplied fallback, not to zero or NaN", () => {
    expect(mean([])).toBe(0);
    expect(mean([], 1), "an empty window can mean 'perfect', per the caller").toBe(1);
    expect(mean([1, 2])).toBe(1.5);
  });

  it("treats blank and whitespace strings as empty", () => {
    expect(nonEmpty("x")).toBe(true);
    expect(nonEmpty("   "), "whitespace-only is the fail-closed case").toBe(false);
    expect(nonEmpty(undefined)).toBe(false);
  });

  it("distributes labels as rounded proportions, and empty as {}", () => {
    expect(labelDistribution([], () => "x")).toEqual({});
    expect(labelDistribution([1, 1, 2], (n) => `l${n}`)).toEqual({ l1: 0.666667, l2: 0.333333 });
  });

  it("measures total variation as half the L1 distance", () => {
    expect(totalVariationDistance({ a: 1 }, { a: 1 })).toBe(0);
    expect(totalVariationDistance({ a: 1 }, { b: 1 }), "disjoint is total").toBe(1);
    expect(totalVariationDistance({ a: 0.5, b: 0.5 }, { a: 1 })).toBe(0.5);
    expect(totalVariationDistance({}, {}), "two empty windows have not diverged").toBe(0);
  });
});

describe("adding alerts fails the receipt closed and rehashes it", () => {
  const receipt = (): LiveDriftReceipt => ({
    receiptId: "r1",
    agentId: "a",
    createdAt: "2026-08-20T10:00:00.000Z",
    baselineWindowId: "b",
    liveWindowId: "l",
    alerts: [],
    recommendation: "accept",
    failClosed: false,
    summary: "0 live drift alert(s), recommendation=accept",
    receiptHash: "stale-hash"
  } as unknown as LiveDriftReceipt);

  const alert = (): LiveDriftAlert => ({
    alertId: "x", metricId: "scoreMean0to1", severity: "high",
    message: "m", threshold: 1, observed: 0, evidenceRefs: [], signedEvidenceRefs: []
  } as unknown as LiveDriftAlert);

  it("returns the receipt untouched when there is nothing to add", () => {
    const original = receipt();
    expect(withAdditionalAlerts(original, [])).toBe(original);
  });

  it("fails closed, recommends alert, and replaces the stale hash", () => {
    const updated = withAdditionalAlerts(receipt(), [alert()]);

    expect(updated.failClosed).toBe(true);
    expect(updated.recommendation).toBe("alert");
    expect(updated.summary).toBe("1 live drift alert(s), recommendation=alert");
    expect(updated.receiptHash, "the pre-alert hash must not survive").not.toBe("stale-hash");
    expect(updated.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
