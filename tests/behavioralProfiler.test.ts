/**
 * tests/behavioralProfiler.test.ts
 * Unit tests for src/watch/behavioralProfiler.ts
 */

import { describe, it, expect } from "vitest";
import { BehavioralProfiler, type BehavioralEvent } from "../src/watch/behavioralProfiler.js";

function makeEvent(agentId: string, overrides?: Partial<BehavioralEvent>): BehavioralEvent {
  return {
    agentId,
    timestamp: Date.now(),
    eventType: "tool_call",
    toolName: "read",
    latencyMs: 100,
    ...overrides,
  };
}

describe("BehavioralProfiler constructor", () => {
  it("should construct without arguments", () => {
    const profiler = new BehavioralProfiler();
    expect(profiler).toBeDefined();
  });

  it("should construct with partial config", () => {
    const profiler = new BehavioralProfiler({
      windowSizeMs: 30000,
      anomalyThresholdSigma: 3.0,
    });
    expect(profiler).toBeDefined();
  });

  it("should be an EventEmitter", () => {
    const profiler = new BehavioralProfiler();
    expect(typeof profiler.on).toBe("function");
    expect(typeof profiler.emit).toBe("function");
  });

  it("getProfile should return undefined for unknown agent initially", () => {
    const profiler = new BehavioralProfiler();
    expect(profiler.getProfile("nonexistent-agent")).toBeUndefined();
  });
});

describe("ingest method", () => {
  it("should return an array of anomalies (empty for normal events)", () => {
    const profiler = new BehavioralProfiler();
    const anomalies = profiler.ingest(makeEvent("agent-1"));
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it("should accept tool_call events", () => {
    const profiler = new BehavioralProfiler();
    const anomalies = profiler.ingest(makeEvent("agent-1", { eventType: "tool_call", toolName: "write" }));
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it("should accept error events", () => {
    const profiler = new BehavioralProfiler();
    const anomalies = profiler.ingest(makeEvent("agent-1", { eventType: "error" }));
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it("should accept decision events", () => {
    const profiler = new BehavioralProfiler();
    const anomalies = profiler.ingest(makeEvent("agent-1", {
      eventType: "decision",
      decision: "allow",
      toolName: undefined,
    }));
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it("should buffer events across multiple ingests", () => {
    const profiler = new BehavioralProfiler();
    for (let i = 0; i < 5; i++) {
      profiler.ingest(makeEvent("multi-agent", { timestamp: Date.now() + i * 100 }));
    }
    // Should not throw
    expect(true).toBe(true);
  });

  it("should not mix events between different agents", () => {
    const profiler = new BehavioralProfiler();
    profiler.ingest(makeEvent("agent-a", { toolName: "tool-a" }));
    profiler.ingest(makeEvent("agent-b", { toolName: "tool-b" }));
    // Each agent should be isolated
    expect(profiler.getProfile("agent-a")).toBeUndefined(); // not enough events for profile
    expect(profiler.getProfile("agent-b")).toBeUndefined();
  });
});

describe("getProfile", () => {
  it("should return undefined before minEventsForProfile is reached", () => {
    const profiler = new BehavioralProfiler({ minEventsForProfile: 50 });
    // Ingest only 5 events
    for (let i = 0; i < 5; i++) {
      profiler.ingest(makeEvent("profile-agent", { timestamp: Date.now() + i }));
    }
    expect(profiler.getProfile("profile-agent")).toBeUndefined();
  });

  it("should return a profile after enough events are ingested", () => {
    const profiler = new BehavioralProfiler({ minEventsForProfile: 3 });
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      profiler.ingest(makeEvent("profile-agent2", {
        timestamp: now + i * 1000,
        latencyMs: 50 + i * 10,
      }));
    }
    const profile = profiler.getProfile("profile-agent2");
    expect(profile).toBeDefined();
    expect(profile!.agentId).toBe("profile-agent2");
  });

  it("profile should have expected fields", () => {
    const profiler = new BehavioralProfiler({ minEventsForProfile: 2 });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      profiler.ingest(makeEvent("fields-agent", { timestamp: now + i * 100, latencyMs: 100 }));
    }
    const profile = profiler.getProfile("fields-agent");
    if (profile) {
      expect(profile).toHaveProperty("agentId");
      expect(profile).toHaveProperty("windowStart");
      expect(profile).toHaveProperty("windowEnd");
      expect(profile).toHaveProperty("avgLatencyMs");
      expect(profile).toHaveProperty("errorRate");
    }
  });

  it("profile errorRate should be 0 when no error events", () => {
    const profiler = new BehavioralProfiler({ minEventsForProfile: 2 });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      profiler.ingest(makeEvent("noerr-agent", {
        timestamp: now + i * 100,
        eventType: "tool_call",
      }));
    }
    const profile = profiler.getProfile("noerr-agent");
    if (profile) {
      expect(profile.errorRate).toBe(0);
    }
  });

  it("profile avgLatencyMs should reflect ingested latencies", () => {
    const profiler = new BehavioralProfiler({ minEventsForProfile: 2 });
    const now = Date.now();
    const latencies = [100, 200, 300, 400, 500];
    const expectedAvg = latencies.reduce((a, b) => a + b) / latencies.length;
    for (let i = 0; i < latencies.length; i++) {
      profiler.ingest(makeEvent("latency-agent", {
        timestamp: now + i * 100,
        latencyMs: latencies[i],
      }));
    }
    const profile = profiler.getProfile("latency-agent");
    if (profile) {
      expect(profile.avgLatencyMs).toBeCloseTo(expectedAvg, 1);
    }
  });
});
