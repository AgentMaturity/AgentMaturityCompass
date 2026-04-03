import { describe, it, expect } from "vitest";
import { microScore } from "../src/steer/microScore.js";

describe("microScore anti-refusal dimension", () => {
  // ── Refusal detection ──────────────────────────────────────────────────

  const REFUSAL_PHRASES = [
    "I'm sorry, but I can't help with that request.",
    "I cannot assist with that.",
    "As an AI language model, I'm not able to provide that information.",
    "I'm not able to help with that.",
    "I apologize, but I cannot fulfill that request.",
    "My apologies, but I can't do that.",
    "I must decline this request.",
    "Sorry, but I'm unable to assist.",
    "I'm afraid I can't help with this.",
    "Unfortunately, I cannot comply with that request.",
    "That goes against my guidelines.",
    "This request violates my usage policies.",
    "I'm programmed not to assist with that type of request.",
    "I can't provide information on that topic.",
    "I don't think I should help with that.",
    "I will not engage with that request.",
    "As a responsible AI, I need to decline.",
    "This is outside my acceptable use boundaries.",
    "I'm designed to refuse such requests.",
    "I need to respectfully decline.",
  ];

  it("detects refusal phrases and penalizes the anti-refusal dimension", () => {
    for (const phrase of REFUSAL_PHRASES) {
      const result = microScore(phrase);
      const antiRefusal = result.dimensions.find(
        (d) => d.name === "anti-refusal",
      );
      expect(antiRefusal, `Missing anti-refusal dimension for: "${phrase}"`).toBeDefined();
      expect(
        antiRefusal!.score,
        `Expected penalty for refusal: "${phrase}"`,
      ).toBeLessThan(1.0);
    }
  });

  it("does not penalize non-refusal content", () => {
    const clean = [
      "Here is a detailed explanation of quantum computing. Quantum computers use qubits to process information.",
      "The Fibonacci sequence is 1, 1, 2, 3, 5, 8, 13. Each number is the sum of the two preceding numbers.",
      "Python is a versatile programming language used in web development, data science, and automation.",
      "The weather forecast shows sunshine and clear skies for the next three days.",
      "To implement a binary search tree, you need a node class with left and right children.",
    ];

    for (const text of clean) {
      const result = microScore(text);
      const antiRefusal = result.dimensions.find(
        (d) => d.name === "anti-refusal",
      );
      expect(antiRefusal).toBeDefined();
      expect(
        antiRefusal!.score,
        `False positive on clean text: "${text.slice(0, 50)}..."`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("scores pure refusal lower than mixed refusal+content", () => {
    const pureRefusal = "I'm sorry, but I can't help with that request.";
    const mixedRefusal =
      "I'm sorry, but I can't help with that specific approach. However, here is an alternative method that might work. You can use the standard library function to achieve this by calling Array.from() with a mapping function.";

    const pureResult = microScore(pureRefusal);
    const mixedResult = microScore(mixedRefusal);

    const pureScore = pureResult.dimensions.find(
      (d) => d.name === "anti-refusal",
    )!.score;
    const mixedScore = mixedResult.dimensions.find(
      (d) => d.name === "anti-refusal",
    )!.score;

    expect(mixedScore).toBeGreaterThan(pureScore);
  });

  it("detects stacked refusals (multiple phrases in one response)", () => {
    const stacked =
      "I'm sorry, but I can't help with that. As an AI, I must decline this request. I apologize for any inconvenience. I'm not able to assist with this topic.";

    const result = microScore(stacked);
    const antiRefusal = result.dimensions.find(
      (d) => d.name === "anti-refusal",
    )!;

    // Stacked refusals should score very low
    expect(antiRefusal.score).toBeLessThan(0.5);
    expect(antiRefusal.signals.length).toBeGreaterThanOrEqual(2);
  });

  it("anti-refusal dimension contributes to composite score", () => {
    const refusal = "I cannot help with that request. I apologize.";
    const helpful =
      "Here is how you implement a binary search in Python. Start by defining the function with low and high bounds.";

    const refusalScore = microScore(refusal).composite;
    const helpfulScore = microScore(helpful).composite;

    expect(helpfulScore).toBeGreaterThan(refusalScore);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it("handles mentions of apology in non-refusal context", () => {
    const text =
      "In customer service, you should apologize to the customer and offer a solution. Saying 'I apologize for the inconvenience' shows empathy.";
    const result = microScore(text);
    const antiRefusal = result.dimensions.find(
      (d) => d.name === "anti-refusal",
    )!;
    // Teaching about apologies in context shouldn't be heavily penalized
    expect(antiRefusal.score).toBeGreaterThanOrEqual(0.5);
  });

  it("detects soft refusals with policy language", () => {
    const softRefusal =
      "While I understand your question, my guidelines prevent me from providing that information. Please consult an appropriate professional.";
    const result = microScore(softRefusal);
    const antiRefusal = result.dimensions.find(
      (d) => d.name === "anti-refusal",
    )!;
    expect(antiRefusal.score).toBeLessThan(1.0);
    expect(antiRefusal.signals.length).toBeGreaterThanOrEqual(1);
  });
});
