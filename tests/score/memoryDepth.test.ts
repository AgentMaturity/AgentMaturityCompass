import { describe, it, expect } from "vitest";
import { scoreMemoryDepth, MemoryDepthEvent, MemoryDepthInput } from "../../src/score/memoryDepth.js";

function makeEvent(
  eventType: MemoryDepthEvent["eventType"],
  timestamp = Date.now(),
  extras?: Partial<MemoryDepthEvent>,
): MemoryDepthEvent {
  return { timestamp, eventType, ...extras };
}

describe("scoreMemoryDepth", () => {
  it("returns empty score for no events", () => {
    const result = scoreMemoryDepth({ events: [] });
    expect(result.overallScore).toBe(0);
    expect(result.backendResilience).toBe(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]).toContain("No memory depth events");
  });

  it("scores neutral (0.5) when no relevant events exist for a dimension", () => {
    // A single unrelated event triggers non-empty path but no dimension-specific events
    const result = scoreMemoryDepth({ events: [makeEvent("session_boundary")] });
    // backendResilience should be 0.5 (no failures), compressionFidelity 0.5, etc.
    expect(result.backendResilience).toBe(0.5);
    expect(result.compressionFidelity).toBe(0.5);
    expect(result.poisoningResistance).toBe(0.5);
    expect(result.ttlPolicyCompliance).toBe(0.5);
    expect(result.capacityManagement).toBe(0.5);
  });

  it("scores perfect backend resilience — all failures recovered with fallback", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("backend_failure"),
      makeEvent("fallback_activated"),
      makeEvent("backend_recovered"),
      makeEvent("backend_failure"),
      makeEvent("fallback_activated"),
      makeEvent("backend_recovered"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.backendResilience).toBe(1);
  });

  it("penalizes failed fallbacks in backend resilience", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("backend_failure"),
      makeEvent("fallback_activated"),
      makeEvent("fallback_failed"),
      makeEvent("backend_failure"),
      makeEvent("fallback_activated"),
      makeEvent("fallback_failed"),
    ];
    const result = scoreMemoryDepth({ events });
    // Recovery rate = 0, fallback activated but all failed
    expect(result.backendResilience).toBeLessThan(0.5);
  });

  it("scores perfect compression fidelity — all verified, none lossy", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("compression_executed"),
      makeEvent("compression_verified"),
      makeEvent("compression_executed"),
      makeEvent("compression_verified"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.compressionFidelity).toBe(1);
  });

  it("penalizes lossy compression and fact loss", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("compression_executed"),
      makeEvent("compression_lossy"),
      makeEvent("fact_lost"),
      makeEvent("compression_executed"),
      makeEvent("compression_lossy"),
      makeEvent("fact_lost"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.compressionFidelity).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("fact"))).toBe(true);
  });

  it("scores perfect cross-session consistency", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("session_boundary"),
      makeEvent("cross_session_merge"),
      makeEvent("session_boundary"),
      makeEvent("cross_session_merge"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.crossSessionConsistency).toBeGreaterThan(0.8);
  });

  it("penalizes unresolved cross-session contradictions", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("session_boundary"),
      makeEvent("contradiction_detected"),
      makeEvent("session_boundary"),
      makeEvent("contradiction_detected"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.crossSessionConsistency).toBeLessThan(0.7);
  });

  it("scores perfect poisoning resistance — all injections blocked", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("injection_attempted"),
      makeEvent("injection_blocked"),
      makeEvent("injection_attempted"),
      makeEvent("injection_blocked"),
      makeEvent("anomaly_flagged"),
      makeEvent("memory_wash_detected"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.poisoningResistance).toBeGreaterThanOrEqual(0.9);
  });

  it("penalizes successful injections", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("injection_attempted"),
      makeEvent("injection_succeeded"),
      makeEvent("injection_attempted"),
      makeEvent("injection_succeeded"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.poisoningResistance).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("injection"))).toBe(true);
  });

  it("scores TTL compliance correctly", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("ttl_enforced"),
      makeEvent("ttl_enforced"),
      makeEvent("ttl_enforced"),
      makeEvent("deletion_audited"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.ttlPolicyCompliance).toBeGreaterThan(0.8);
  });

  it("penalizes TTL violations", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("ttl_enforced"),
      makeEvent("ttl_violated"),
      makeEvent("ttl_violated"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.ttlPolicyCompliance).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("TTL violation"))).toBe(true);
  });

  it("scores capacity management with proper eviction", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("capacity_warning"),
      makeEvent("eviction_executed"),
      makeEvent("capacity_warning"),
      makeEvent("eviction_executed"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.capacityManagement).toBeGreaterThan(0.8);
  });

  it("penalizes budget exceeded and degradation", () => {
    const events: MemoryDepthEvent[] = [
      makeEvent("capacity_warning"),
      makeEvent("budget_exceeded"),
      makeEvent("degradation_detected"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.capacityManagement).toBeLessThan(0.7);
    expect(result.recommendations.some((r) => r.includes("budget exceeded"))).toBe(true);
  });

  it("computes weighted overall score correctly for a mixed scenario", () => {
    const events: MemoryDepthEvent[] = [
      // backend: perfect recovery
      makeEvent("backend_failure"),
      makeEvent("backend_recovered"),
      makeEvent("fallback_activated"),
      // compression: verified
      makeEvent("compression_executed"),
      makeEvent("compression_verified"),
      // session: clean
      makeEvent("session_boundary"),
      makeEvent("cross_session_merge"),
      // poisoning: blocked
      makeEvent("injection_attempted"),
      makeEvent("injection_blocked"),
      makeEvent("anomaly_flagged"),
      // ttl: compliant
      makeEvent("ttl_enforced"),
      makeEvent("deletion_audited"),
      // capacity: managed
      makeEvent("capacity_warning"),
      makeEvent("eviction_executed"),
    ];
    const result = scoreMemoryDepth({ events });
    expect(result.overallScore).toBeGreaterThan(0.7);
    expect(result.maturitySignals.length).toBeGreaterThan(0);

    // Verify weighted sum
    const expectedOverall =
      result.backendResilience * 0.2 +
      result.compressionFidelity * 0.2 +
      result.crossSessionConsistency * 0.2 +
      result.poisoningResistance * 0.2 +
      result.ttlPolicyCompliance * 0.1 +
      result.capacityManagement * 0.1;
    expect(result.overallScore).toBeCloseTo(expectedOverall, 2);
  });
});
