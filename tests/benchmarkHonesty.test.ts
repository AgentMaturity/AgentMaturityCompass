import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRONTIER_BASELINES } from "../src/benchmarks/frontierBaseline.js";

/**
 * G1-26/G1-27: benchRunner reported maturity-derived arithmetic as latency,
 * cost and reliability benchmarks, and frontierBaseline shipped hand-written
 * scores for named third-party models carrying a measuredAt date, an amcVersion
 * and a questionsAnswered count — published as if those models had been assessed.
 */
describe("frontier baselines are not presented as measurements", () => {
  it("marks every hand-written baseline unverified", () => {
    expect(FRONTIER_BASELINES.length).toBeGreaterThan(0);
    for (const baseline of FRONTIER_BASELINES) {
      expect(baseline.verified).toBe(false);
      // A fabricated measurement date is the part that made these read as real.
      expect(baseline.measuredAt).toBeNull();
    }
  });

  it("documents that no frontier model was assessed", () => {
    const source = readFileSync(
      new URL("../src/benchmarks/frontierBaseline.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("ILLUSTRATIVE REFERENCE POINTS — NOT MEASUREMENTS");
    expect(source).not.toContain('measuredAt: "2026-03-15"');
  });
});

describe("bench categories describe what they actually compute", () => {
  const source = readFileSync(new URL("../src/benchmarks/benchRunner.ts", import.meta.url), "utf8");

  it("no longer claims to measure response time", () => {
    expect(source).not.toContain("Evidence processing speed and response time");
    expect(source).not.toContain("agents with high integrity process evidence faster");
    expect(source).toContain("not a timing measurement");
  });

  it("no longer claims to measure cost or reliability", () => {
    expect(source).toContain("not a cost or token measurement");
    expect(source).toContain("not an uptime or error-rate measurement");
  });
});
