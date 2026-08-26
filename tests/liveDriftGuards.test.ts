import { describe, expect, it } from "vitest";
import {
  guardedDelta,
  guardedDivergence,
  guardedDrop,
  guardedRatio
} from "../src/watch/liveDriftAlerts.js";

/**
 * The four guarded metric helpers lifted out of `runLiveScoreBehaviorDrift`
 * (P5.2b, ADR-0025) — 176 inline expressions across 866 lines, now four
 * functions.
 *
 * The characterization hashes prove the extraction changed nothing. What they
 * could NOT prove is that the guard and the clamp do anything at all: mutation
 * testing showed that removing the `present` check, un-clamping the drop, and
 * clamping the signed delta ALL passed the existing suite, because no fixture
 * has a domain with zero rows and none has a negative delta.
 *
 * That gap predates the extraction — it was simply untestable while the logic
 * lived inline 176 times. These are the cases that close it.
 */
describe("the evidence guard actually guards", () => {
  it("returns 0 for a domain that contributed no rows, whatever the distributions say", () => {
    // Without the guard this would report a full divergence of 1 for a domain
    // the run never exercised — every unexercised domain would alert.
    expect(guardedDivergence(false, { a: 1 }, { b: 1 })).toBe(0);
    expect(guardedDivergence(true, { a: 1 }, { b: 1 }), "and the real distance when it did").toBe(1);
  });

  it("suppresses drops, deltas and ratios alike when the domain is absent", () => {
    expect(guardedDrop(false, 1, 0)).toBe(0);
    expect(guardedDelta(false, 1, 0)).toBe(0);
    expect(guardedRatio(false, 100, 200)).toBe(0);
  });
});

describe("drop and delta are not the same helper", () => {
  it("clamps a drop at zero, because a metric that improved has not dropped", () => {
    expect(guardedDrop(true, 0.9, 0.4), "0.9 -> 0.4 is a 0.5 drop").toBe(0.5);
    expect(guardedDrop(true, 0.4, 0.9), "0.4 -> 0.9 is an improvement, not a negative drop").toBe(0);
  });

  it("keeps the sign on a delta, because direction is the point", () => {
    // These metrics report a shift that can go either way — a sentiment mean, a
    // VPIP percentage. Clamping them would erase what they exist to convey.
    expect(guardedDelta(true, 0.9, 0.4)).toBe(0.5);
    expect(guardedDelta(true, 0.4, 0.9), "the negative direction survives").toBe(-0.5);
  });

  it("disagrees on exactly the case that separates them", () => {
    expect(guardedDrop(true, 0.4, 0.9)).not.toBe(guardedDelta(true, 0.4, 0.9));
  });
});

describe("the ratio reads (after, before) and is NOT driftMath's ratioIncrease", () => {
  it("computes (after - before) / before", () => {
    // Call sites pass `liveDistribution.X` first: this is (after, before).
    expect(guardedRatio(true, 150, 100), "150 after 100 is a 50% increase").toBe(0.5);
  });

  it("keeps a negative ratio, where driftMath's namesake clamps it at zero", () => {
    // The trap: `driftMath.ratioIncrease` takes (baseline, live) and clamps.
    // Same name, reversed arguments, different result. Importing the wrong one
    // compiles cleanly and silently inverts every latency and cost ratio.
    expect(guardedRatio(true, 100, 150), "an improvement reads negative here").toBe(-0.333333);
  });

  it("reports a zero-or-absent baseline as a boolean, not an infinity", () => {
    expect(guardedRatio(true, 5, 0), "something after nothing").toBe(1);
    expect(guardedRatio(true, 0, 0)).toBe(0);
    expect(guardedRatio(true, Number.NaN, 100)).toBe(0);
  });
});
