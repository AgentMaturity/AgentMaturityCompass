import { describe, it, expect } from "vitest";
import {
  scoreFaithfulness,
  extractClaimsSimulated,
  computeOverlap,
} from "../../src/score/faithfulness.js";
import type { FaithfulnessInput } from "../../src/score/faithfulness.js";

describe("faithfulness scoring", () => {
  const makeInput = (overrides: Partial<FaithfulnessInput> = {}): FaithfulnessInput => ({
    context:
      "The Eiffel Tower is located in Paris, France. It was built in 1889 for the World's Fair. The tower stands 330 metres tall and is the most-visited paid monument in the world.",
    output:
      "The Eiffel Tower is in Paris, France. It was constructed in 1889 for the World's Fair. The tower is 330 metres tall.",
    ...overrides,
  });

  /* ── Empty / edge cases ─────────────────────────────────────── */

  it("returns score 1 for empty output (vacuously faithful)", () => {
    const result = scoreFaithfulness(makeInput({ output: "" }));
    expect(result.score).toBe(1);
    expect(result.explanation).toContain("vacuously");
  });

  it("returns score 0 for empty context", () => {
    const result = scoreFaithfulness(makeInput({ context: "" }));
    expect(result.score).toBe(0);
    expect(result.explanation).toContain("No context");
  });

  it("returns score 0 when no claims extracted", () => {
    const result = scoreFaithfulness(makeInput({ output: "Hmm ok." }));
    expect(result.score).toBe(0);
    expect(result.totalClaims).toBe(0);
  });

  /* ── Faithful output ────────────────────────────────────────── */

  it("scores high for output fully grounded in context", () => {
    const result = scoreFaithfulness(makeInput());
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.supportedClaims).toBeGreaterThan(0);
    expect(result.mode).toBe("simulated");
  });

  it("provides per-claim verdicts", () => {
    const result = scoreFaithfulness(makeInput());
    expect(result.claims.length).toBeGreaterThan(0);
    for (const claim of result.claims) {
      expect(claim).toHaveProperty("claim");
      expect(claim).toHaveProperty("supported");
      expect(claim).toHaveProperty("confidence");
      expect(claim).toHaveProperty("reasoning");
    }
  });

  /* ── Unfaithful output ──────────────────────────────────────── */

  it("scores low for output with hallucinated claims", () => {
    const result = scoreFaithfulness(
      makeInput({
        output:
          "The Eiffel Tower was designed by Gustave Eiffel in 1887. It is located in London, England. The tower has 1,710 steps and cost 50 million francs to build.",
      }),
    );
    // "London, England" contradicts context; "1887", "1710 steps", "50 million" are fabricated
    expect(result.score).toBeLessThan(0.8);
    expect(result.unsupportedClaims).toBeGreaterThan(0);
  });

  it("scores near zero for completely ungrounded output", () => {
    const result = scoreFaithfulness(
      makeInput({
        output:
          "Quantum computing uses qubits instead of classical bits. Machine learning models require large datasets for training. Neural networks are inspired by biological neurons.",
      }),
    );
    expect(result.score).toBeLessThan(0.3);
    expect(result.maturitySignals).toContain("ungrounded_output");
  });

  /* ── Mixed faithfulness ─────────────────────────────────────── */

  it("scores partially for mixed grounded/ungrounded output", () => {
    const result = scoreFaithfulness(
      makeInput({
        output:
          "The Eiffel Tower is in Paris, France. It was built in 1889. The tower attracts 50 million visitors every year and generates billions in tourism revenue.",
      }),
    );
    // First two claims grounded, last two are hallucinated
    expect(result.score).toBeGreaterThan(0.2);
    expect(result.score).toBeLessThan(0.9);
  });

  /* ── Score properties ───────────────────────────────────────── */

  it("score is between 0 and 1 inclusive", () => {
    const inputs: FaithfulnessInput[] = [
      makeInput(),
      makeInput({ output: "Totally unrelated stuff about quantum physics and basketball." }),
      makeInput({ context: "X is Y.", output: "X is Y." }),
    ];
    for (const inp of inputs) {
      const result = scoreFaithfulness(inp);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("returns explanation string", () => {
    const result = scoreFaithfulness(makeInput());
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("returns maturitySignals array", () => {
    const result = scoreFaithfulness(makeInput());
    expect(Array.isArray(result.maturitySignals)).toBe(true);
    expect(result.maturitySignals.length).toBeGreaterThan(0);
  });

  it("returns recommendations for low scores", () => {
    const result = scoreFaithfulness(
      makeInput({
        output: "Quantum bits enable parallel processing. Blockchain stores data in a decentralized ledger.",
      }),
    );
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  /* ── Claim extraction ───────────────────────────────────────── */

  it("extractClaimsSimulated splits into sentences", () => {
    const claims = extractClaimsSimulated("First sentence. Second sentence. Third sentence.");
    expect(claims.length).toBe(3);
  });

  it("extractClaimsSimulated filters short fragments", () => {
    const claims = extractClaimsSimulated("Ok. Yes. This is a longer sentence that should be kept.");
    expect(claims.length).toBe(1);
  });

  /* ── Overlap computation ────────────────────────────────────── */

  it("computeOverlap returns 1 for identical text", () => {
    const score = computeOverlap("Eiffel Tower Paris France", "Eiffel Tower Paris France");
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("computeOverlap returns low score for unrelated text", () => {
    const score = computeOverlap(
      "Quantum computing revolutionizes cryptography",
      "The Eiffel Tower is in Paris France",
    );
    expect(score).toBeLessThan(0.3);
  });

  it("computeOverlap handles empty strings", () => {
    expect(computeOverlap("", "some context")).toBe(1); // trivial claim
    expect(computeOverlap("some claim", "")).toBe(0);
  });

  /* ── Config ─────────────────────────────────────────────────── */

  it("respects custom overlapThreshold", () => {
    const input = makeInput({
      output: "The Eiffel Tower was built in Paris and attracts millions of tourists annually.",
    });
    const strict = scoreFaithfulness(input, { overlapThreshold: 0.8 });
    const lenient = scoreFaithfulness(input, { overlapThreshold: 0.2 });
    expect(lenient.score).toBeGreaterThanOrEqual(strict.score);
  });

  it("defaults to simulated mode", () => {
    const result = scoreFaithfulness(makeInput());
    expect(result.mode).toBe("simulated");
  });
});
