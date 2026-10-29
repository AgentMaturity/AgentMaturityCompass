import { describe, expect, test } from "vitest";
import { scoreMemoryIntegrity, type MemoryEvent } from "../src/score/memoryIntegrity.js";
import { scoreMemoryDepth, type MemoryDepthEvent } from "../src/score/memoryDepth.js";
import { assessMemoryMaturity, detectMemoryPoisoning, scoreMemoryContinuity, verifyMemoryHashChain, verifyMemoryPersistence } from "../src/score/memoryMaturity.js";

const memoryEvent = (type: MemoryEvent["type"]): MemoryEvent => ({
  sessionId: "session", timestamp: 1, type, key: "fact", source: "agent", confidence: 0.9,
});
const depthEvent = (eventType: MemoryDepthEvent["eventType"]): MemoryDepthEvent => ({ timestamp: 1, eventType });
const entry = (knownPoisoned: boolean, content = "weekly summary complete") => ({
  entryId: "entry", sessionId: "session", ts: 1, content,
  prevHash: "GENESIS_MEMORY", entryHash: "hash", knownPoisoned,
});

describe("AXE-27 unavailable memory ratios", () => {
  test("empty integrity evidence is not evaluated", () => {
    expect(scoreMemoryIntegrity({ events: [], sessionCount: 0, totalDurationMs: 0 })).toMatchObject({
      overallScore: null, consistencyScore: null, poisoningResistanceScore: null,
      outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test("integrity scores only observed dimensions", () => {
    expect(scoreMemoryIntegrity({ events: [memoryEvent("recovery")], sessionCount: 1, totalDurationMs: 1 })).toMatchObject({
      consistencyScore: null, decayScore: null, poisoningResistanceScore: null,
      recoveryScore: 1, overallScore: 1,
      metricOutcomes: { consistencyScore: "not_evaluated", poisoningResistanceScore: "not_evaluated", recoveryScore: "measured" },
    });
  });

  test("store evidence cannot fabricate recovery success", () => {
    expect(scoreMemoryIntegrity({ events: [memoryEvent("store")], sessionCount: 1, totalDurationMs: 1 })).toMatchObject({
      recoveryScore: null, metricOutcomes: { recoveryScore: "not_evaluated" },
    });
  });

  test("empty memory depth does not fabricate a score", () => {
    expect(scoreMemoryDepth({ events: [] })).toMatchObject({ overallScore: null, outcome: "not_evaluated", sampleSize: 0 });
  });

  test("unobserved depth dimensions remain unavailable", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("ttl_enforced")] })).toMatchObject({
      backendResilience: null, compressionFidelity: null, crossSessionConsistency: null,
      poisoningResistance: null, capacityManagement: null, ttlPolicyCompliance: 0.9, overallScore: 0.9,
      metricOutcomes: { backendResilience: "not_evaluated", ttlPolicyCompliance: "measured" },
    });
  });

  test("session evidence cannot fabricate TTL compliance", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("session_boundary")] })).toMatchObject({
      ttlPolicyCompliance: null, metricOutcomes: { ttlPolicyCompliance: "not_evaluated" },
    });
  });

  test("unattempted fallback is excluded from backend resilience", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("backend_failure")] }).backendResilience).toBe(0);
  });

  test("wash detection alone cannot claim injection resistance", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("memory_wash_detected")] })).toMatchObject({
      poisoningResistance: null, metricOutcomes: { poisoningResistance: "not_evaluated" },
    });
  });

  test("unobserved contradiction resolution cannot improve consistency", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("session_boundary")] }).crossSessionConsistency).toBeCloseTo(0.571, 3);
  });

  test("capacity failures without warnings cannot gain perfect eviction credit", () => {
    expect(scoreMemoryDepth({ events: [depthEvent("budget_exceeded")] }).capacityManagement).toBe(0);
  });

  test("empty maturity evidence cannot produce an integrity or overall measurement", () => {
    expect(verifyMemoryHashChain([])).toMatchObject({ integrityScore: null, sampleSize: 0, outcome: "not_evaluated" });
    expect(detectMemoryPoisoning([])).toMatchObject({ anomalyRate: null, poisoningScore: null, sampleSize: 0, outcome: "not_evaluated" });
    expect(assessMemoryMaturity({})).toMatchObject({ overallScore: null, sampleSize: 0, outcome: "not_evaluated" });
  });

  test("empty recall universes are unavailable and cannot verify persistence", () => {
    expect(verifyMemoryPersistence([{ probeId: "empty", expectedKeys: [], recalledKeys: [] }])).toMatchObject({
      verified: false, retainedRatio: null, restartSurvivalScore: null, sampleSize: 0, outcome: "not_evaluated",
    });
  });

  test("empty probes cannot dilute a measured persistence failure", () => {
    const result = verifyMemoryPersistence([
      { probeId: "empty", expectedKeys: [], recalledKeys: [] },
      { probeId: "failed", expectedKeys: ["fact"], recalledKeys: [] },
    ]);
    expect(result.retainedRatio).toBe(0);
    expect(result.restartSurvivalScore).toBe(0);
    expect(result).toMatchObject({ sampleSize: 1, outcome: "measured" });
  });

  test("empty continuity universes cannot be stable", () => {
    expect(scoreMemoryContinuity([{ checkpointId: "empty", fromSessionId: "a", toSessionId: "b", expectedFacts: [], recalledFacts: [] }])).toMatchObject({
      stable: false, averageCoherence: null, continuityScore: null, sampleSize: 0, outcome: "not_evaluated",
    });
  });

  test("empty checkpoints cannot dilute a measured continuity failure", () => {
    expect(scoreMemoryContinuity([
      { checkpointId: "empty", fromSessionId: "a", toSessionId: "b", expectedFacts: [], recalledFacts: [] },
      { checkpointId: "failed", fromSessionId: "a", toSessionId: "b", expectedFacts: ["fact"], recalledFacts: [] },
    ])).toMatchObject({ averageCoherence: 0, continuityScore: 0, sampleSize: 1, outcome: "measured" });
  });

  test("precision and recall without positive denominators remain unavailable", () => {
    expect(detectMemoryPoisoning([entry(false)])).toMatchObject({
      precision: null, recall: null, poisoningScore: null,
      metricOutcomes: { precision: "not_evaluated", recall: "not_evaluated", poisoningScore: "not_evaluated" },
    });
  });

  test("zero predicted positives preserves measured zero recall", () => {
    expect(detectMemoryPoisoning([entry(true)])).toMatchObject({
      precision: null, recall: 0, poisoningScore: null,
      metricOutcomes: { precision: "not_evaluated", recall: "measured" },
    });
  });
});
