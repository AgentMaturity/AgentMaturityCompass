import { describe, it, expect } from "vitest";
import { QualitySignalStore } from "../../src/outcomes/qualitySignals.js";

describe("QualitySignalStore", () => {
  it("records and retrieves ratings", () => {
    const store = new QualitySignalStore({ workspace: "/tmp/test-quality", agentId: "test" });
    const rating = store.rate("trace-1", "good", ["fast", "accurate"]);
    expect(rating.score).toBe("good");
    expect(rating.tags).toEqual(["fast", "accurate"]);
    expect(rating.traceId).toBe("trace-1");
  });

  it("generates a quality report", () => {
    const store = new QualitySignalStore({ workspace: "/tmp/test-quality2", agentId: "test" });
    store.rate("t1", "good", ["accurate"]);
    store.rate("t2", "good", ["fast"]);
    store.rate("t3", "bad", ["hallucination"]);
    store.rate("t4", "neutral");

    const report = store.generateReport(7);
    expect(report.totalRatings).toBe(4);
    expect(report.goodPct).toBe(50);
    expect(report.badPct).toBe(25);
    expect(report.satisfactionScore).toBeGreaterThan(50);
    expect(report.topNegativeTags).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: "hallucination", count: 1 }),
    ]));
  });

  it("detects quality degradation alert", () => {
    const store = new QualitySignalStore({ workspace: "/tmp/test-quality3", agentId: "test", alertThreshold: 90 });
    store.rate("t1", "good");
    store.rate("t2", "bad");
    store.rate("t3", "bad");
    store.rate("t4", "bad");

    const report = store.generateReport(7);
    expect(report.alerts.length).toBeGreaterThan(0);
    expect(report.satisfactionScore).toBeLessThan(90);
  });

  it("retrieves rating by trace ID", () => {
    const store = new QualitySignalStore({ workspace: "/tmp/test-quality4", agentId: "test" });
    store.rate("specific-trace", "good", ["tag1"]);
    const found = store.getRating("specific-trace");
    expect(found).toBeDefined();
    expect(found!.score).toBe("good");
  });

  it("handles empty state", () => {
    const store = new QualitySignalStore({ workspace: "/tmp/test-quality-empty", agentId: "empty" });
    const report = store.generateReport(30);
    expect(report.totalRatings).toBe(0);
    expect(report.satisfactionScore).toBe(50);
    expect(report.alerts.length).toBeGreaterThan(0);
  });
});
