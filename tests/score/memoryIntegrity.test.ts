import { describe, it, expect } from "vitest";
import { scoreMemoryIntegrity } from "../../src/score/memoryIntegrity.js";
import type { MemoryEvent } from "../../src/score/memoryIntegrity.js";

describe("memory integrity scoring", () => {
  const makeEvent = (overrides: Partial<MemoryEvent> = {}): MemoryEvent => ({
    sessionId: "s1",
    timestamp: Date.now(),
    type: "store",
    key: "fact-1",
    source: "agent",
    confidence: 0.9,
    ...overrides,
  });

  it("returns unavailable for no events", () => {
    const result = scoreMemoryIntegrity({ events: [], sessionCount: 0, totalDurationMs: 0 });
    expect(result.overallScore).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("scores high for consistent memory with no conflicts", () => {
    const events = [makeEvent(), makeEvent({ type: "retrieve", confidence: 0.9 }), makeEvent({ type: "update" })];
    const result = scoreMemoryIntegrity({ events, sessionCount: 3, totalDurationMs: 86400000 });
    expect(result.consistencyScore).toBe(1.0);
    expect(result.conflicts).toBe(0);
  });

  it("penalizes memory conflicts", () => {
    const events = [makeEvent(), makeEvent({ type: "conflict" }), makeEvent({ type: "update" })];
    const result = scoreMemoryIntegrity({ events, sessionCount: 2, totalDurationMs: 86400000 });
    expect(result.consistencyScore).toBeLessThan(1.0);
    expect(result.conflicts).toBe(1);
  });

  it("detects confidence decay over time", () => {
    const events = [
      makeEvent({ type: "retrieve", timestamp: 1000, confidence: 0.95 }),
      makeEvent({ type: "retrieve", timestamp: 2000, confidence: 0.90 }),
      makeEvent({ type: "retrieve", timestamp: 3000, confidence: 0.60 }),
      makeEvent({ type: "retrieve", timestamp: 4000, confidence: 0.50 }),
    ];
    const result = scoreMemoryIntegrity({ events, sessionCount: 4, totalDurationMs: 86400000 });
    expect(result.decayScore).toBeLessThan(0.9);
  });

  it("scores poisoning resistance when attempts are blocked", () => {
    const events = [
      makeEvent({ type: "poisoning_attempt", source: "external", confidence: 0.1 }),
      makeEvent({ type: "store", source: "external", confidence: 0.1 }),
    ];
    const result = scoreMemoryIntegrity({ events, sessionCount: 1, totalDurationMs: 3600000 });
    expect(result.poisoningResistanceScore).toBe(1.0);
    expect(result.poisoningAttempts).toBe(1);
  });

  it("penalizes successful poisoning", () => {
    const events = [
      makeEvent({ type: "poisoning_attempt", source: "external" }),
      makeEvent({ type: "store", source: "external", confidence: 0.8 }),
    ];
    const result = scoreMemoryIntegrity({ events, sessionCount: 1, totalDurationMs: 3600000 });
    expect(result.poisoningResistanceScore).toBeLessThan(1.0);
    expect(result.poisoningSuccesses).toBe(1);
  });

  it("scores recovery quality", () => {
    const events = [
      makeEvent({ type: "recovery", confidence: 0.9 }),
      makeEvent({ type: "recovery", confidence: 0.8 }),
      makeEvent({ type: "recovery", confidence: 0.3 }),
    ];
    const result = scoreMemoryIntegrity({ events, sessionCount: 3, totalDurationMs: 86400000 });
    expect(result.recoveryAttempts).toBe(3);
    expect(result.recoverySuccesses).toBe(2);
    expect(result.recoveryScore).toBeCloseTo(2 / 3, 1);
  });

  it("recommends memory persistence when no recovery observed", () => {
    const events = [makeEvent(), makeEvent({ type: "retrieve" })];
    const result = scoreMemoryIntegrity({ events, sessionCount: 5, totalDurationMs: 86400000 });
    expect(result.recommendations.some(r => r.includes("persistence"))).toBe(true);
  });
});
