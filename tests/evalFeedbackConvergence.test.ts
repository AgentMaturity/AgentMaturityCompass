import { describe, it, expect } from "vitest";
import {
  evaluateFeedbackConvergence,
  simulateConvergence,
  SYNTHETIC_PROFILES,
} from "../src/steer/research/eval_feedback_convergence.js";

describe("eval_feedback_convergence", () => {
  it("simulates convergence trace with correct length", () => {
    const result = simulateConvergence(SYNTHETIC_PROFILES[0]!, 30);
    expect(result.trace).toHaveLength(30);
    expect(result.profile.name).toBe("creative_high_temp");
  });

  it("trace points have valid fields", () => {
    const result = simulateConvergence(SYNTHETIC_PROFILES[0]!, 20);
    for (const point of result.trace) {
      expect(point.step).toBeGreaterThanOrEqual(0);
      expect(typeof point.adjustedTemp).toBe("number");
      expect(typeof point.adjustedTopP).toBe("number");
      expect(point.distanceToTarget).toBeGreaterThanOrEqual(0);
    }
  });

  it("evaluates all synthetic profiles", () => {
    const result = evaluateFeedbackConvergence(SYNTHETIC_PROFILES, 30);
    expect(result.convergenceResults).toHaveLength(SYNTHETIC_PROFILES.length);
    expect(result.convergenceRate).toBeGreaterThanOrEqual(0);
    expect(result.convergenceRate).toBeLessThanOrEqual(1);
  });

  it("convergence rate and mean steps are valid", () => {
    const result = evaluateFeedbackConvergence(SYNTHETIC_PROFILES, 50);
    expect(result.meanStepsToConverge).toBeGreaterThanOrEqual(0);
    expect(typeof result.allSeparated).toBe("boolean");
  });

  it("deterministic with same seed", () => {
    const a = simulateConvergence(SYNTHETIC_PROFILES[1]!, 20, 123);
    const b = simulateConvergence(SYNTHETIC_PROFILES[1]!, 20, 123);
    expect(a.trace).toEqual(b.trace);
    expect(a.finalDistance).toBe(b.finalDistance);
  });

  it("different profiles produce different traces", () => {
    const a = simulateConvergence(SYNTHETIC_PROFILES[0]!, 20);
    const b = simulateConvergence(SYNTHETIC_PROFILES[1]!, 20);
    // At least one trace point should differ
    const differs = a.trace.some(
      (p, i) => p.adjustedTemp !== b.trace[i]!.adjustedTemp,
    );
    expect(differs).toBe(true);
  });
});
