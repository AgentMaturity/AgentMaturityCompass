import { describe, expect, test } from "vitest";
import {
  createConsortiumPool,
  addMember,
  submitContribution,
  computeAggregateStats,
  type ConsortiumEntry,
} from "../src/benchmarks/consortium.js";

describe("consortium pool", () => {
  test("creates an empty pool", () => {
    const pool = createConsortiumPool();
    expect(pool.members).toEqual([]);
    expect(pool.contributions).toEqual([]);
  });

  test("adds members with pseudonymized org names", () => {
    const pool = createConsortiumPool();
    const member = addMember(pool, "Acme Corp");
    expect(member.orgPseudonym).toMatch(/^org-/);
    expect(member.orgPseudonym).not.toContain("Acme");
    expect(pool.members.length).toBe(1);
  });

  test("submits contributions and increments count", () => {
    const pool = createConsortiumPool();
    const member = addMember(pool, "TestOrg");
    const entries: ConsortiumEntry[] = [
      {
        agentPseudonym: "agent-abc",
        compositeScore: 75,
        layerScores: { L0: 80, L1: 70 },
        trustLabel: "MEDIUM TRUST",
        questionsAnswered: 235,
        amcVersion: "1.0.0",
      },
    ];
    const contribution = submitContribution(pool, member.memberId, entries);
    expect(contribution.digest).toBeDefined();
    expect(contribution.entries.length).toBe(1);
    expect(member.contributionCount).toBe(1);
  });

  test("rejects contributions from unknown members", () => {
    const pool = createConsortiumPool();
    expect(() =>
      submitContribution(pool, "nonexistent", []),
    ).toThrow("Unknown member");
  });
});

describe("computeAggregateStats", () => {
  test("computes statistics across all contributions", () => {
    const pool = createConsortiumPool();
    const m1 = addMember(pool, "Org A");
    const m2 = addMember(pool, "Org B");

    submitContribution(pool, m1.memberId, [
      { agentPseudonym: "a1", compositeScore: 80, layerScores: { L0: 90, L1: 70 }, trustLabel: "HIGH TRUST", questionsAnswered: 235, amcVersion: "1.0.0" },
      { agentPseudonym: "a2", compositeScore: 60, layerScores: { L0: 70, L1: 50 }, trustLabel: "MEDIUM TRUST", questionsAnswered: 235, amcVersion: "1.0.0" },
    ]);
    submitContribution(pool, m2.memberId, [
      { agentPseudonym: "b1", compositeScore: 90, layerScores: { L0: 95, L1: 85 }, trustLabel: "HIGH TRUST", questionsAnswered: 235, amcVersion: "1.0.0" },
    ]);

    const stats = computeAggregateStats(pool);
    expect(stats.totalContributions).toBe(2);
    expect(stats.totalAgents).toBe(3);
    expect(stats.totalMembers).toBe(2);
    expect(stats.scoreDistribution.mean).toBeCloseTo(76.667, 0);
    expect(stats.scoreDistribution.min).toBe(60);
    expect(stats.scoreDistribution.max).toBe(90);
    expect(stats.trustLabelDistribution["HIGH TRUST"]).toBe(2);
    expect(stats.trustLabelDistribution["MEDIUM TRUST"]).toBe(1);
    expect(stats.layerDistributions.L0).toBeDefined();
    expect(stats.layerDistributions.L1).toBeDefined();
  });

  test("handles empty pool gracefully", () => {
    const pool = createConsortiumPool();
    const stats = computeAggregateStats(pool);
    expect(stats.totalAgents).toBe(0);
    expect(stats.scoreDistribution.mean).toBe(0);
  });
});
