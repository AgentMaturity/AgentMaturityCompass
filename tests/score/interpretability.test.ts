import { describe, it, expect } from "vitest";
import { scoreInterpretability } from "../../src/score/interpretability.js";
import type { InterpretabilityEvent } from "../../src/score/interpretability.js";

describe("interpretability scoring", () => {
  const makeEvent = (overrides: Partial<InterpretabilityEvent> = {}): InterpretabilityEvent => ({
    actionId: "a1",
    timestamp: Date.now(),
    hasExplanation: true,
    explanationLength: 50,
    actionMatchesExplanation: true,
    statedConfidence: 0.85,
    actualOutcome: "success",
    hasAttribution: true,
    attributionSources: 2,
    isRefusal: false,
    refusalHasReason: false,
    ...overrides,
  });

  it("reports no evaluation for no events", () => {
    const result = scoreInterpretability([]);
    expect(result.overallScore).toBeNull();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("scores high for well-explained, faithful, calibrated actions", () => {
    const events = Array.from({ length: 10 }, () => makeEvent());
    const result = scoreInterpretability(events);
    expect(result.overallScore).toBeGreaterThan(0.8);
    expect(result.explanationCoverage).toBe(1.0);
    expect(result.faithfulnessScore).toBe(1.0);
  });

  it("penalizes unexplained actions", () => {
    const events = [makeEvent({ hasExplanation: false }), makeEvent({ hasExplanation: false }), makeEvent()];
    const result = scoreInterpretability(events);
    expect(result.explanationCoverage).toBeCloseTo(1 / 3, 1);
  });

  it("penalizes unfaithful explanations", () => {
    const events = [makeEvent({ actionMatchesExplanation: false }), makeEvent({ actionMatchesExplanation: false }), makeEvent()];
    const result = scoreInterpretability(events);
    expect(result.faithfulnessScore).toBeCloseTo(1 / 3, 1);
  });

  it("detects poor confidence calibration", () => {
    const events = [
      makeEvent({ statedConfidence: 0.95, actualOutcome: "failure" }),
      makeEvent({ statedConfidence: 0.90, actualOutcome: "failure" }),
    ];
    const result = scoreInterpretability(events);
    expect(result.calibrationError).toBeGreaterThan(0.5);
    expect(result.calibrationScore).toBeLessThan(0.5);
  });

  it("scores good calibration when confidence matches outcomes", () => {
    const events = [
      makeEvent({ statedConfidence: 0.9, actualOutcome: "success" }),
      makeEvent({ statedConfidence: 0.1, actualOutcome: "failure" }),
    ];
    const result = scoreInterpretability(events);
    expect(result.calibrationScore).toBeGreaterThan(0.8);
  });

  it("scores refusal transparency", () => {
    const events = [
      makeEvent({ isRefusal: true, refusalHasReason: true }),
      makeEvent({ isRefusal: true, refusalHasReason: false }),
    ];
    const result = scoreInterpretability(events);
    expect(result.refusalTransparency).toBe(0.5);
  });

  it("does not evaluate refusal transparency when no refusals", () => {
    const events = [makeEvent()];
    const result = scoreInterpretability(events);
    expect(result.refusalTransparency).toBeNull();
  });

  it("penalizes lack of attribution", () => {
    const events = [makeEvent({ hasAttribution: false }), makeEvent({ hasAttribution: false })];
    const result = scoreInterpretability(events);
    expect(result.attributionScore).toBe(0);
  });

  it("recommends chain-of-thought when coverage is low", () => {
    const events = Array.from({ length: 10 }, () => makeEvent({ hasExplanation: false }));
    const result = scoreInterpretability(events);
    expect(result.recommendations.some(r => r.includes("chain-of-thought"))).toBe(true);
  });

  it("flags confabulation when faithfulness is low", () => {
    const events = Array.from({ length: 5 }, () => makeEvent({ actionMatchesExplanation: false }));
    const result = scoreInterpretability(events);
    expect(result.recommendations.some(r => r.includes("confabulation"))).toBe(true);
  });
});
