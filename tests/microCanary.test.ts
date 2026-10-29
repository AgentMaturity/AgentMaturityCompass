import { afterEach, describe, expect, test } from "vitest";
import {
  defaultMicroCanaryConfig,
  configureMicroCanary,
  getMicroCanaryConfig,
  registerProbe,
  listRegisteredProbes,
  getProbesByTier,
  registerBuiltInProbes,
  isProbedue,
  executeProbe,
  runDueProbes,
  runAllProbes,
  getExecutionHistory,
  getActiveAlerts,
  getAllAlerts,
  acknowledgeAlert,
  acknowledgeAllAlerts,
  generateMicroCanaryReport,
  renderMicroCanaryMarkdown,
  computeCanaryHealthScore,
  resetMicroCanaryState,
  type MicroCanaryContext,
  type MicroCanaryProbeDefinition,
} from "../src/assurance/microCanary.js";

afterEach(() => {
  resetMicroCanaryState();
});

function makeContext(overrides: Partial<MicroCanaryContext> = {}): MicroCanaryContext {
  return {
    ts: Date.now(),
    agentId: "agent-1",
    recentEventHashes: ["a".repeat(64), "b".repeat(64)],
    auditCounts: {},
    configSignatures: {},
    metadata: {},
    ...overrides,
  };
}

function makePassingProbe(id = "test-probe"): MicroCanaryProbeDefinition {
  return {
    probeId: id,
    name: "Test Probe",
    category: "EVIDENCE_INTEGRITY",
    riskTier: "HIGH",
    description: "A test probe",
    evaluate: () => ({
      status: "PASS",
      reason: "All good",
      latencyMs: 1,
      evidenceRefs: [],
    }),
  };
}

function makeFailingProbe(id = "fail-probe"): MicroCanaryProbeDefinition {
  return {
    probeId: id,
    name: "Failing Probe",
    category: "INJECTION_RESILIENCE",
    riskTier: "CRITICAL",
    description: "A probe that always fails",
    evaluate: () => ({
      status: "FAIL",
      reason: "Something went wrong",
      latencyMs: 2,
      evidenceRefs: ["ev-1"],
    }),
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
describe("configuration", () => {
  test("defaultMicroCanaryConfig returns sensible defaults", () => {
    const cfg = defaultMicroCanaryConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.frequencyPerHour.CRITICAL).toBe(60);
    expect(cfg.frequencyPerHour.LOW).toBe(1);
    expect(cfg.maxProbeLatencyMs).toBe(500);
    expect(cfg.alertOnFailureTiers).toContain("CRITICAL");
  });

  test("configureMicroCanary validates and stores config", () => {
    const cfg = configureMicroCanary({
      ...defaultMicroCanaryConfig(),
      frequencyPerHour: { CRITICAL: 120, HIGH: 30, MEDIUM: 10, LOW: 2 },
    });
    expect(cfg.frequencyPerHour.CRITICAL).toBe(120);
    expect(getMicroCanaryConfig().frequencyPerHour.CRITICAL).toBe(120);
  });

  test("configureMicroCanary rejects invalid config", () => {
    expect(() =>
      configureMicroCanary({
        ...defaultMicroCanaryConfig(),
        maxProbeLatencyMs: -1,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Probe registration
// ---------------------------------------------------------------------------
describe("probe registration", () => {
  test("registers and lists probes", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makeFailingProbe("p2"));
    const probes = listRegisteredProbes();
    expect(probes.length).toBe(2);
  });

  test("replaces probe with same ID", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe({ ...makePassingProbe("p1"), name: "Updated Probe" });
    const probes = listRegisteredProbes();
    expect(probes.length).toBe(1);
    expect(probes[0]!.name).toBe("Updated Probe");
  });

  test("getProbesByTier filters correctly", () => {
    registerProbe(makePassingProbe("high-1"));
    registerProbe(makeFailingProbe("crit-1"));
    expect(getProbesByTier("HIGH").length).toBe(1);
    expect(getProbesByTier("CRITICAL").length).toBe(1);
    expect(getProbesByTier("LOW").length).toBe(0);
  });

  test("registerBuiltInProbes adds standard probes", () => {
    registerBuiltInProbes();
    const probes = listRegisteredProbes();
    expect(probes.length).toBeGreaterThanOrEqual(6);
    // Should have a range of categories
    const categories = new Set(probes.map((p) => p.category));
    expect(categories.has("EVIDENCE_INTEGRITY")).toBe(true);
    expect(categories.has("SIGNATURE_VALIDITY")).toBe(true);
    expect(categories.has("INJECTION_RESILIENCE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Probe execution
// ---------------------------------------------------------------------------
describe("probe execution", () => {
  test("executeProbe runs and records execution", () => {
    const probe = makePassingProbe();
    const ctx = makeContext();
    const exec = executeProbe(probe, ctx);

    expect(exec.executionId).toMatch(/^mce_/);
    expect(exec.result.status).toBe("PASS");
    expect(exec.probeId).toBe(probe.probeId);

    const history = getExecutionHistory();
    expect(history.length).toBe(1);
  });

  test("executeProbe catches errors", () => {
    const errorProbe: MicroCanaryProbeDefinition = {
      probeId: "error-probe",
      name: "Error Probe",
      category: "EVIDENCE_INTEGRITY",
      riskTier: "HIGH",
      description: "Throws an error",
      evaluate: () => { throw new Error("boom"); },
    };

    const exec = executeProbe(errorProbe, makeContext());
    expect(exec.result.status).toBe("ERROR");
    expect(exec.result.reason).toContain("boom");
  });

  test("executeProbe creates alert on failure for configured tiers", () => {
    registerProbe(makeFailingProbe());
    const exec = executeProbe(makeFailingProbe(), makeContext());

    expect(exec.result.status).toBe("FAIL");
    const alerts = getActiveAlerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.riskTier).toBe("CRITICAL");
  });

  test("executeProbe does not alert for non-configured tiers", () => {
    configureMicroCanary({
      ...defaultMicroCanaryConfig(),
      alertOnFailureTiers: ["CRITICAL"], // Only CRITICAL
    });

    const highFailProbe: MicroCanaryProbeDefinition = {
      probeId: "high-fail",
      name: "High Fail",
      category: "EVIDENCE_INTEGRITY",
      riskTier: "HIGH", // Not in alertOnFailureTiers
      description: "Fails at HIGH tier",
      evaluate: () => ({
        status: "FAIL",
        reason: "failed",
        latencyMs: 1,
        evidenceRefs: [],
      }),
    };

    executeProbe(highFailProbe, makeContext());
    expect(getActiveAlerts().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Probe scheduling
// ---------------------------------------------------------------------------
describe("probe scheduling", () => {
  test("isProbedue returns true for never-run probes", () => {
    expect(isProbedue("new-probe", "CRITICAL")).toBe(true);
  });

  test("isProbedue returns false for recently-run probes", () => {
    const probe = makePassingProbe("scheduled-probe");
    registerProbe(probe);
    executeProbe(probe, makeContext());

    // Should not be due immediately after running (CRITICAL = 60/hour = 1/minute)
    expect(isProbedue("scheduled-probe", "CRITICAL", Date.now())).toBe(false);
  });

  test("isProbedue returns true after interval passes", () => {
    const probe = makePassingProbe("timed-probe");
    registerProbe(probe);
    executeProbe(probe, makeContext());

    // HIGH = 12/hour = every 5 minutes, simulate 6 minutes later
    const futureTs = Date.now() + 360000;
    expect(isProbedue("timed-probe", "HIGH", futureTs)).toBe(true);
  });

  test("runDueProbes only runs probes that are due", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makePassingProbe("p2"));

    // Run all first time (both due)
    const ctx = makeContext();
    const first = runDueProbes(ctx);
    expect(first.length).toBe(2);

    // Run again immediately — none should be due
    const second = runDueProbes(makeContext());
    expect(second.length).toBe(0);
  });

  test("runDueProbes returns empty when disabled", () => {
    configureMicroCanary({ ...defaultMicroCanaryConfig(), enabled: false });
    registerProbe(makePassingProbe());
    const results = runDueProbes(makeContext());
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Run all probes
// ---------------------------------------------------------------------------
describe("runAllProbes", () => {
  test("runs all probes regardless of schedule", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makePassingProbe("p2"));

    // Run all twice — both times should execute all
    runAllProbes(makeContext());
    const results = runAllProbes(makeContext());
    expect(results.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Built-in probes
// ---------------------------------------------------------------------------
describe("built-in probes", () => {
  test("evidence chain probe passes with valid hashes", () => {
    registerBuiltInProbes();
    const chainProbe = listRegisteredProbes().find((p) => p.probeId === "mc-evidence-chain")!;
    const ctx = makeContext({ recentEventHashes: ["a".repeat(64), "b".repeat(64)] });
    const result = chainProbe.evaluate(ctx);
    expect(result.status).toBe("PASS");
  });

  test("evidence chain probe fails with invalid hashes", () => {
    registerBuiltInProbes();
    const chainProbe = listRegisteredProbes().find((p) => p.probeId === "mc-evidence-chain")!;
    const ctx = makeContext({ recentEventHashes: ["a".repeat(64), "short"] });
    const result = chainProbe.evaluate(ctx);
    expect(result.status).toBe("FAIL");
  });

  test("config signatures probe passes when all valid", () => {
    registerBuiltInProbes();
    const sigProbe = listRegisteredProbes().find((p) => p.probeId === "mc-config-signatures")!;
    const ctx = makeContext({
      configSignatures: { gateway: true, bridge: true, policy: true },
    });
    const result = sigProbe.evaluate(ctx);
    expect(result.status).toBe("PASS");
  });

  test("config signatures probe fails when some invalid", () => {
    registerBuiltInProbes();
    const sigProbe = listRegisteredProbes().find((p) => p.probeId === "mc-config-signatures")!;
    const ctx = makeContext({
      configSignatures: { gateway: true, bridge: false },
    });
    const result = sigProbe.evaluate(ctx);
    expect(result.status).toBe("FAIL");
    expect(result.reason).toContain("bridge");
  });

  test("secret exposure probe fails on exposure events", () => {
    registerBuiltInProbes();
    const secretProbe = listRegisteredProbes().find((p) => p.probeId === "mc-secret-exposure")!;
    const ctx = makeContext({ auditCounts: { SECRET_EXPOSED: 1 } });
    const result = secretProbe.evaluate(ctx);
    expect(result.status).toBe("FAIL");
  });

  test("secret exposure probe passes with clean audit", () => {
    registerBuiltInProbes();
    const secretProbe = listRegisteredProbes().find((p) => p.probeId === "mc-secret-exposure")!;
    // Clean = audit telemetry present with no exposure; an empty window is not evaluated (WP37).
    expect(secretProbe.evaluate(makeContext({ auditCounts: {} })).status).toBe("SKIP");
    const result = secretProbe.evaluate(makeContext({ auditCounts: { TOOL_CALLED: 3 } }));
    expect(result.status).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// Execution history
// ---------------------------------------------------------------------------
describe("execution history", () => {
  test("filters by various criteria", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makeFailingProbe("p2"));
    runAllProbes(makeContext());

    expect(getExecutionHistory({ probeId: "p1" }).length).toBe(1);
    expect(getExecutionHistory({ status: "FAIL" }).length).toBe(1);
    expect(getExecutionHistory({ riskTier: "CRITICAL" }).length).toBe(1);
    expect(getExecutionHistory({ category: "EVIDENCE_INTEGRITY" }).length).toBe(1);
  });

  test("respects limit", () => {
    registerProbe(makePassingProbe());
    for (let i = 0; i < 10; i++) {
      runAllProbes(makeContext());
    }
    expect(getExecutionHistory({ limit: 5 }).length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
describe("alerts", () => {
  test("acknowledgeAlert marks alert as acknowledged", () => {
    registerProbe(makeFailingProbe());
    executeProbe(makeFailingProbe(), makeContext());

    const alerts = getActiveAlerts();
    expect(alerts.length).toBe(1);

    expect(acknowledgeAlert(alerts[0]!.alertId)).toBe(true);
    expect(getActiveAlerts().length).toBe(0);
  });

  test("acknowledgeAlert returns false for unknown ID", () => {
    expect(acknowledgeAlert("nonexistent")).toBe(false);
  });

  test("acknowledgeAllAlerts clears all", () => {
    registerProbe(makeFailingProbe("f1"));
    registerProbe({ ...makeFailingProbe("f2"), probeId: "f2" });
    executeProbe(makeFailingProbe("f1"), makeContext());
    executeProbe({ ...makeFailingProbe("f2"), probeId: "f2" }, makeContext());

    expect(getActiveAlerts().length).toBe(2);
    const count = acknowledgeAllAlerts();
    expect(count).toBe(2);
    expect(getActiveAlerts().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
describe("reporting", () => {
  test("generates report with execution data", () => {
    registerBuiltInProbes();
    runAllProbes(makeContext());

    const report = generateMicroCanaryReport();
    expect(report.reportId).toMatch(/^mcr_/);
    expect(report.totalExecutions).toBeGreaterThan(0);
    expect(report.passRate).toBeGreaterThanOrEqual(0);
    expect(report.categoryBreakdown.length).toBeGreaterThan(0);
    expect(report.tierBreakdown.length).toBeGreaterThan(0);
  });

  test("generates report with no data gracefully", () => {
    const report = generateMicroCanaryReport();
    expect(report.totalExecutions).toBe(0);
    expect(report.passRate).toBe(0);
    expect(report.recommendations.length).toBeGreaterThan(0); // Should recommend checking config
  });

  test("includes active alerts in report", () => {
    registerProbe(makeFailingProbe());
    executeProbe(makeFailingProbe(), makeContext());

    const report = generateMicroCanaryReport();
    expect(report.activeAlerts.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("markdown rendering", () => {
  test("renders report with all sections", () => {
    registerBuiltInProbes();
    runAllProbes(makeContext({ auditCounts: { SECRET_EXPOSED: 1 } }));

    const report = generateMicroCanaryReport();
    const md = renderMicroCanaryMarkdown(report);

    expect(md).toContain("# Micro-Canary Assurance Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## By Risk Tier");
    expect(md).toContain("## By Category");
  });

  test("renders empty report gracefully", () => {
    const report = generateMicroCanaryReport();
    const md = renderMicroCanaryMarkdown(report);
    expect(md).toContain("# Micro-Canary Assurance Report");
    expect(md).toContain("Total executions | 0");
  });
});

// ---------------------------------------------------------------------------
// Health score
// ---------------------------------------------------------------------------
describe("health score", () => {
  test("returns 100 with no executions", () => {
    const health = computeCanaryHealthScore();
    expect(health.score).toBe(100);
    expect(health.probeCount).toBe(0);
  });

  test("returns high score with all passing", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makePassingProbe("p2"));
    runAllProbes(makeContext());

    const health = computeCanaryHealthScore();
    expect(health.score).toBe(100);
    expect(health.failCount).toBe(0);
  });

  test("reduces score on failures", () => {
    registerProbe(makePassingProbe("p1"));
    registerProbe(makeFailingProbe("p2"));
    runAllProbes(makeContext());

    const health = computeCanaryHealthScore();
    expect(health.score).toBeLessThan(100);
    expect(health.failCount).toBe(1);
  });

  test("critical failures reduce score more", () => {
    // All failing, one CRITICAL
    registerProbe(makeFailingProbe("crit"));
    runAllProbes(makeContext());
    const critHealth = computeCanaryHealthScore();

    resetMicroCanaryState();

    // All failing, one HIGH (not CRITICAL)
    registerProbe({
      ...makeFailingProbe("high"),
      riskTier: "HIGH",
    });
    runAllProbes(makeContext());
    const highHealth = computeCanaryHealthScore();

    // CRITICAL failure should produce lower score
    expect(critHealth.score).toBeLessThanOrEqual(highHealth.score);
    expect(critHealth.criticalFailCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
describe("resetMicroCanaryState", () => {
  test("clears all state", () => {
    registerBuiltInProbes();
    runAllProbes(makeContext());

    resetMicroCanaryState();

    expect(listRegisteredProbes().length).toBe(0);
    expect(getExecutionHistory().length).toBe(0);
    expect(getAllAlerts().length).toBe(0);
    expect(getMicroCanaryConfig().enabled).toBe(true); // reset to default
  });
});
