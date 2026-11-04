import { describe, it, expect } from "vitest";
import { scorePauseQuality } from "../../src/score/pauseQuality.js";
import type { PauseEvent, PauseQualityInput } from "../../src/score/pauseQuality.js";

describe("pause quality scoring", () => {
  const makePause = (overrides: Partial<PauseEvent> = {}): PauseEvent => ({
    timestamp: Date.now(),
    reason: "ambiguous_instruction",
    taskComplexity: "medium",
    resolved: true,
    resolutionTimeMs: 5000,
    humanOverrideAfterPause: false,
    wastedWorkPrevented: true,
    ...overrides,
  });

  it("reports no evaluation for no actions", () => {
    const result = scorePauseQuality({ pauses: [], totalActions: 0, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 0 });
    expect(result.overallScore).toBeNull();
  });

  it("scores well for ideal pause rate with relevant pauses", () => {
    const pauses = Array.from({ length: 5 }, () => makePause());
    const result = scorePauseQuality({ pauses, totalActions: 100, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 60000 });
    expect(result.overallScore).toBeGreaterThan(0.7);
    expect(result.pauseRate).toBe(0.05);
  });

  it("penalizes too many pauses", () => {
    const pauses = Array.from({ length: 30 }, () => makePause());
    const result = scorePauseQuality({ pauses, totalActions: 100, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 60000 });
    expect(result.frequencyScore).toBeLessThan(1.0);
  });

  it("penalizes too few pauses", () => {
    const result = scorePauseQuality({ pauses: [makePause()], totalActions: 1000, totalErrors: 5, errorsWithoutPriorPause: 5, taskDurationMs: 60000 });
    expect(result.frequencyScore).toBeLessThan(0.5);
    expect(result.missedPauses).toBe(5);
  });

  it("detects unnecessary pauses on low-complexity tasks", () => {
    const pauses = [makePause({ taskComplexity: "low", reason: "unknown" })];
    const result = scorePauseQuality({ pauses, totalActions: 50, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 60000 });
    expect(result.unnecessaryPauses).toBe(1);
  });

  it("rewards high-risk pauses as maturity signal", () => {
    const pauses = [makePause({ reason: "irreversible_action" }), makePause({ reason: "risk_threshold" })];
    const result = scorePauseQuality({ pauses, totalActions: 50, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 60000 });
    expect(result.maturitySignals.some(s => s.includes("high-risk"))).toBe(true);
  });

  it("computes average resolution time", () => {
    const pauses = [makePause({ resolutionTimeMs: 3000 }), makePause({ resolutionTimeMs: 7000 })];
    const result = scorePauseQuality({ pauses, totalActions: 50, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 60000 });
    expect(result.avgResolutionTimeMs).toBe(5000);
  });

  it("recommends when agent rarely pauses", () => {
    const result = scorePauseQuality({ pauses: [], totalActions: 500, totalErrors: 3, errorsWithoutPriorPause: 3, taskDurationMs: 60000 });
    expect(result.recommendations.some(r => r.includes("rarely pauses"))).toBe(true);
  });
});
