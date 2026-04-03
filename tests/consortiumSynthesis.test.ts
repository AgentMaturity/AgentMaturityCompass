/**
 * AMC-445: CONSORTIUM mode — hive-mind synthesis
 */
import { describe, expect, test } from "vitest";
import {
  createConsortiumPool,
  addMember,
  submitContribution,
  synthesizeConsortiumInsights,
  renderConsortiumSynthesisMarkdown,
} from "../src/benchmarks/consortium.js";

describe("synthesizeConsortiumInsights", () => {
  test("builds cross-member consensus and outlier insights", () => {
    const pool = createConsortiumPool();
    const m1 = addMember(pool, "Org A");
    const m2 = addMember(pool, "Org B");
    const m3 = addMember(pool, "Org C");

    submitContribution(pool, m1.memberId, [
      {
        agentPseudonym: "a1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
        amcVersion: "1.0.0",
      },
    ]);
    submitContribution(pool, m2.memberId, [
      {
        agentPseudonym: "b1",
        compositeScore: 82,
        layerScores: { reliability: 84, security: 80 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
        amcVersion: "1.0.0",
      },
    ]);
    submitContribution(pool, m3.memberId, [
      {
        agentPseudonym: "c1",
        compositeScore: 42,
        layerScores: { reliability: 40, security: 44 },
        trustLabel: "LOW TRUST",
        questionsAnswered: 235,
        amcVersion: "1.0.0",
      },
    ]);

    const synthesis = synthesizeConsortiumInsights(pool);
    expect(synthesis.memberCount).toBe(3);
    expect(synthesis.consensusTrustLabel).toBe("HIGH TRUST");
    expect(synthesis.topStrengths.length).toBeGreaterThan(0);
    expect(synthesis.outliers.length).toBe(1);
    expect(synthesis.outliers[0]?.memberId).toBe(m3.memberId);
  });

  test("handles empty pool gracefully", () => {
    const synthesis = synthesizeConsortiumInsights(createConsortiumPool());
    expect(synthesis.memberCount).toBe(0);
    expect(synthesis.outliers).toEqual([]);
    expect(synthesis.topStrengths).toEqual([]);
  });
});

describe("renderConsortiumSynthesisMarkdown", () => {
  test("renders shareable markdown report", () => {
    const pool = createConsortiumPool();
    const member = addMember(pool, "Org A");
    submitContribution(pool, member.memberId, [
      {
        agentPseudonym: "a1",
        compositeScore: 84,
        layerScores: { reliability: 86, security: 82 },
        trustLabel: "HIGH TRUST",
        questionsAnswered: 235,
        amcVersion: "1.0.0",
      },
    ]);

    const markdown = renderConsortiumSynthesisMarkdown(
      synthesizeConsortiumInsights(pool),
    );
    expect(markdown).toContain("# Consortium Synthesis");
    expect(markdown).toContain("Consensus Trust Label");
    expect(markdown).toContain("reliability");
  });
});
