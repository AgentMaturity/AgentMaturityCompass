import { describe, expect, test } from "vitest";
import {
  buildExternalDependencyInventory,
  detectDependencyDrift,
  scoreGracefulDegradation,
  scoreVendorLockInRisk,
  scoreOperationalIndependenceFromEvents,
  type GuardEventLike,
  type ExternalDependencyInventory
} from "../src/score/operationalIndependence.js";

function eventAt(hourOffset: number, overrides: Partial<GuardEventLike> = {}, meta?: Record<string, unknown>): GuardEventLike {
  const created = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + hourOffset * 60 * 60 * 1000).toISOString();
  return {
    created_at: created,
    module_code: "BRIDGE",
    decision: "allow",
    reason: "provider call ok",
    severity: "low",
    meta_json: meta ? JSON.stringify(meta) : "{}",
    ...overrides
  };
}

function dependencyById(inventory: ExternalDependencyInventory, dependencyId: string) {
  return inventory.dependencies.find((dep) => dep.dependencyId === dependencyId);
}

describe("operational independence dependency analytics", () => {
  test("builds external dependency inventory with providers, versions, and fallback signals", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { providerId: "openai", modelVersion: "2026-01-01", latencyMs: 220 }),
      eventAt(1, { decision: "warn", reason: "upstream timeout" }, { providerId: "openai", latencyMs: 1200, failed: true }),
      eventAt(2, { reason: "fallback to secondary provider" }, { providerId: "anthropic", modelVersion: "2026-01-02", fallbackUsed: true, latencyMs: 260 })
    ];

    const inventory = buildExternalDependencyInventory(events);
    expect(inventory.totalDependencies).toBeGreaterThanOrEqual(2);
    expect(inventory.externalEventCount).toBe(3);
    expect(inventory.dependencyCoverage).toBeCloseTo(1, 6);

    const openai = dependencyById(inventory, "openai");
    expect(openai).toBeDefined();
    expect(openai?.usageEvents).toBe(2);
    expect(openai?.failureEvents).toBe(1);

    const anthropic = dependencyById(inventory, "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic?.supportsFallback).toBe(true);
  });

  test("detects dependency version drift", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { dependencyId: "llm-gateway", providerId: "openai", version: "1.0.0" }),
      eventAt(2, {}, { dependencyId: "llm-gateway", providerId: "openai", version: "1.1.0" }),
      eventAt(4, {}, { dependencyId: "llm-gateway", providerId: "openai", version: "1.1.0" })
    ];

    const report = detectDependencyDrift(events);
    expect(report.versionDriftCount).toBe(1);
    expect(report.signals.some((signal) => signal.driftType === "version")).toBe(true);
  });

  test("detects rising dependency error-rate drift", () => {
    const events: GuardEventLike[] = [
      eventAt(0, { reason: "request ok" }, { dependencyId: "openai", providerId: "openai" }),
      eventAt(1, { reason: "request ok" }, { dependencyId: "openai", providerId: "openai" }),
      eventAt(2, { reason: "request ok" }, { dependencyId: "openai", providerId: "openai" }),
      eventAt(3, { decision: "deny", reason: "upstream timeout failure", severity: "high" }, { dependencyId: "openai", providerId: "openai", failed: true }),
      eventAt(4, { decision: "deny", reason: "provider unavailable", severity: "high" }, { dependencyId: "openai", providerId: "openai", failed: true }),
      eventAt(5, { decision: "warn", reason: "rate limit exceeded", severity: "medium" }, { dependencyId: "openai", providerId: "openai", failed: true })
    ];

    const report = detectDependencyDrift(events);
    expect(report.slaDegradationCount).toBeGreaterThan(0);
    expect(report.signals.some((signal) => signal.driftType === "error_rate")).toBe(true);
  });

  test("detects SLA latency drift", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { dependencyId: "vector-db", providerId: "pinecone", latencyMs: 90 }),
      eventAt(1, {}, { dependencyId: "vector-db", providerId: "pinecone", latencyMs: 110 }),
      eventAt(2, {}, { dependencyId: "vector-db", providerId: "pinecone", latencyMs: 360 }),
      eventAt(3, {}, { dependencyId: "vector-db", providerId: "pinecone", latencyMs: 420 })
    ];

    const report = detectDependencyDrift(events);
    expect(report.signals.some((signal) => signal.driftType === "sla_latency")).toBe(true);
  });

  test("graceful degradation score is perfect when no failures are observed", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { providerId: "openai", dependencyId: "openai" }),
      eventAt(1, {}, { providerId: "openai", dependencyId: "openai" })
    ];

    const score = scoreGracefulDegradation(events);
    expect(score.failureEvents).toBe(0);
    expect(score.score).toBe(100);
    expect(score.recoveryRate).toBe(1);
  });

  test("graceful degradation credits fallback recovery after failure", () => {
    const events: GuardEventLike[] = [
      eventAt(0, { decision: "deny", reason: "provider outage", severity: "high" }, { providerId: "openai", dependencyId: "openai", failed: true }),
      eventAt(1, { reason: "fallback to cached response path", decision: "allow" }, { providerId: "openai", dependencyId: "openai", fallbackUsed: true }),
      eventAt(2, { reason: "normal operation restored", decision: "allow" }, { providerId: "openai", dependencyId: "openai" })
    ];

    const score = scoreGracefulDegradation(events);
    expect(score.failureEvents).toBe(1);
    expect(score.recoveredWithFallback).toBe(1);
    expect(score.hardFailures).toBe(0);
    expect(score.score).toBeGreaterThan(70);
  });

  test("graceful degradation penalizes hard failures without recovery signal", () => {
    const events: GuardEventLike[] = [
      eventAt(0, { decision: "deny", reason: "provider outage", severity: "critical" }, { providerId: "openai", dependencyId: "openai", failed: true })
    ];

    const score = scoreGracefulDegradation(events);
    expect(score.failureEvents).toBe(1);
    expect(score.hardFailures).toBe(1);
    expect(score.recoveryRate).toBe(0);
    expect(score.score).toBeLessThan(40);
  });

  test("vendor lock-in risk is high for single-provider dependency with SPOF", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { dependencyId: "openai", providerId: "openai" }),
      eventAt(1, { decision: "deny", reason: "provider timeout", severity: "high" }, { dependencyId: "openai", providerId: "openai", failed: true }),
      eventAt(2, {}, { dependencyId: "openai", providerId: "openai" })
    ];
    const inventory = buildExternalDependencyInventory(events);
    const risk = scoreVendorLockInRisk(inventory);
    expect(risk.score).toBeGreaterThanOrEqual(75);
    expect(risk.riskLevel).toBe("critical");
  });

  test("vendor lock-in risk drops with multi-provider fallback coverage", () => {
    const events: GuardEventLike[] = [
      eventAt(0, {}, { dependencyId: "llm-gateway", providerId: "openai", fallbackUsed: true }),
      eventAt(1, {}, { dependencyId: "llm-gateway", providerId: "anthropic", fallbackUsed: true }),
      eventAt(2, {}, { dependencyId: "llm-gateway", providerId: "openai", fallbackUsed: true })
    ];
    const inventory = buildExternalDependencyInventory(events);
    const risk = scoreVendorLockInRisk(inventory);
    expect(risk.score).toBeLessThanOrEqual(20);
    expect(risk.riskLevel).toBe("low");
  });

  test("operational independence rollup returns all new sub-scores with bounded ranges", () => {
    const events: GuardEventLike[] = [
      eventAt(0, { reason: "normal run" }, { dependencyId: "llm-gateway", providerId: "openai", version: "1.0.0", latencyMs: 180 }),
      eventAt(24, { reason: "normal run" }, { dependencyId: "llm-gateway", providerId: "anthropic", version: "1.0.1", fallbackUsed: true, latencyMs: 210 }),
      eventAt(36, { decision: "warn", reason: "manual approval requested", severity: "medium" }, { dependencyId: "llm-gateway", providerId: "anthropic" }),
      eventAt(48, { decision: "deny", reason: "dependency outage", severity: "high" }, { dependencyId: "llm-gateway", providerId: "openai", failed: true }),
      eventAt(49, { decision: "allow", reason: "fallback activated in reduced mode", severity: "medium" }, { dependencyId: "llm-gateway", providerId: "anthropic", fallbackUsed: true, degradedMode: true })
    ];

    const result = scoreOperationalIndependenceFromEvents(events, 30);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.reducedExternalAccessScore).toBeGreaterThanOrEqual(0);
    expect(result.reducedExternalAccessScore).toBeLessThanOrEqual(100);
    expect(result.telemetryConfidence).toBeGreaterThan(0);
    expect(result.telemetryConfidence).toBeLessThanOrEqual(1);
    expect(result.externalDependencyInventory.totalDependencies).toBeGreaterThan(0);
    expect(result.dependencyDrift.score).toBeGreaterThanOrEqual(0);
    expect(result.gracefulDegradation.score).toBeGreaterThanOrEqual(0);
    expect(result.vendorLockInRisk.score).toBeGreaterThanOrEqual(0);
  });

  test("reduced external access score is higher with fallback-rich multi-vendor telemetry", () => {
    const fragile: GuardEventLike[] = [
      eventAt(0, { decision: "deny", reason: "provider outage", severity: "high" }, { dependencyId: "openai", providerId: "openai", failed: true }),
      eventAt(2, { decision: "deny", reason: "provider timeout", severity: "high" }, { dependencyId: "openai", providerId: "openai", failed: true }),
      eventAt(4, { decision: "deny", reason: "provider unavailable", severity: "critical" }, { dependencyId: "openai", providerId: "openai", failed: true })
    ];
    const resilient: GuardEventLike[] = [
      eventAt(0, { reason: "normal run" }, { dependencyId: "llm-gateway", providerId: "openai", fallbackUsed: true }),
      eventAt(1, { reason: "fallback to secondary provider" }, { dependencyId: "llm-gateway", providerId: "anthropic", fallbackUsed: true }),
      eventAt(2, { decision: "warn", reason: "reduced mode while recovering", severity: "medium" }, { dependencyId: "llm-gateway", providerId: "anthropic", degradedMode: true })
    ];

    const fragileScore = scoreOperationalIndependenceFromEvents(fragile, 30);
    const resilientScore = scoreOperationalIndependenceFromEvents(resilient, 30);

    expect(resilientScore.reducedExternalAccessScore).toBeGreaterThan(fragileScore.reducedExternalAccessScore);
  });
});
