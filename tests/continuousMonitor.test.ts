/**
 * Tests for Continuous Drift Monitor — MF-02
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initFleet, scaffoldAgent, buildAgentConfig } from "../src/fleet/registry.js";
import {
  continuousMonitorConfigSchema,
  defaultMonitorConfig,
  runMonitorTick,
  createMonitorSession,
  executeSessionTick,
  renderMonitorTickMarkdown,
  renderMonitorSessionMarkdown,
  saveMonitorTickReport,
  type ContinuousMonitorConfig,
  type MonitorTickResult,
} from "../src/drift/continuousMonitor.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-continuous-monitor-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initFleet(dir, { orgName: "Monitor Test Fleet" });
  return dir;
}

function setupAgent(workspace: string, agentId: string): void {
  const config = buildAgentConfig({
    agentId,
    agentName: `Agent ${agentId}`,
    role: "assistant",
    domain: "general",
    primaryTasks: ["support"],
    stakeholders: ["owner"],
    riskTier: "med",
    environment: "development",
    templateId: "openai",
    baseUrl: "https://api.openai.com",
    routePrefix: "/openai",
    auth: { type: "bearer_env", env: "OPENAI_API_KEY" },
  });
  scaffoldAgent(workspace, config);
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

// ─── Config validation ──────────────────────────────

describe("Continuous Monitor — config", () => {
  test("default config is valid", () => {
    const config = defaultMonitorConfig();
    expect(config.schemaVersion).toBe(1);
    expect(config.intervalSeconds).toBe(300);
    expect(config.detectPromptInjection).toBe(true);
    expect(config.trackContextPollution).toBe(true);
    expect(config.detectToolApiChanges).toBe(true);
    expect(config.anomalySensitivity).toBe(0.5);
    expect(config.retentionDays).toBe(90);
  });

  test("config schema validates correctly", () => {
    const custom = continuousMonitorConfigSchema.parse({
      schemaVersion: 1,
      intervalSeconds: 60,
      anomalySensitivity: 0.8,
      retentionDays: 30,
    });
    expect(custom.intervalSeconds).toBe(60);
    expect(custom.anomalySensitivity).toBe(0.8);
  });

  test("config rejects invalid interval", () => {
    expect(() =>
      continuousMonitorConfigSchema.parse({
        schemaVersion: 1,
        intervalSeconds: 5, // too low
      }),
    ).toThrow();
  });

  test("config rejects out-of-range sensitivity", () => {
    expect(() =>
      continuousMonitorConfigSchema.parse({
        schemaVersion: 1,
        anomalySensitivity: 2.0,
      }),
    ).toThrow();
  });
});

// ─── Monitor tick ───────────────────────────────────

describe("Continuous Monitor — tick execution", () => {
  test("runs a single tick on workspace with no events", () => {
    const ws = newWorkspace();
    setupAgent(ws, "mon-agent");

    const config = defaultMonitorConfig();
    const result = runMonitorTick({
      workspace: ws,
      agentId: "mon-agent",
      config,
    });

    expect(result.tickId).toMatch(/^tick_/);
    expect(result.agentId).toBe("mon-agent");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.overallSeverity).toBe("ok");
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result.injections.detected).toBe(false);
    expect(result.contextPollution.pollutionScore).toBe(0);
    expect(result.toolApiChanges.changesDetected).toBe(false);
    expect(result.summary).toBe("All clear");
  });

  test("tick result has all required fields", () => {
    const ws = newWorkspace();
    setupAgent(ws, "field-test");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "field-test",
      config: defaultMonitorConfig(),
    });

    expect(result).toHaveProperty("tickId");
    expect(result).toHaveProperty("ts");
    expect(result).toHaveProperty("agentId");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("eventsAnalyzed");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("injections");
    expect(result).toHaveProperty("contextPollution");
    expect(result).toHaveProperty("toolApiChanges");
    expect(result).toHaveProperty("trustDriftAlerts");
    expect(result).toHaveProperty("overallSeverity");
    expect(result).toHaveProperty("summary");
  });

  test("tick with injection detection disabled", () => {
    const ws = newWorkspace();
    setupAgent(ws, "no-inject");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "no-inject",
      config: { ...defaultMonitorConfig(), detectPromptInjection: false },
    });

    expect(result.injections.detected).toBe(false);
    expect(result.injections.patterns).toHaveLength(0);
  });

  test("tick with all detectors disabled", () => {
    const ws = newWorkspace();
    setupAgent(ws, "bare");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "bare",
      config: {
        ...defaultMonitorConfig(),
        detectPromptInjection: false,
        trackContextPollution: false,
        detectToolApiChanges: false,
      },
    });

    expect(result.injections.detected).toBe(false);
    expect(result.contextPollution.pollutionScore).toBe(0);
    expect(result.toolApiChanges.changesDetected).toBe(false);
  });
});

// ─── Monitor session ────────────────────────────────

describe("Continuous Monitor — session management", () => {
  test("creates a monitor session", () => {
    const ws = newWorkspace();
    setupAgent(ws, "sess-agent");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "sess-agent",
      config: { intervalSeconds: 60 },
    });

    expect(session.sessionId).toMatch(/^msess_/);
    expect(session.agentId).toBe("sess-agent");
    expect(session.config.intervalSeconds).toBe(60);
    expect(session.tickCount).toBe(0);
    expect(session.ticks).toHaveLength(0);
  });

  test("executes multiple ticks in a session", () => {
    const ws = newWorkspace();
    setupAgent(ws, "multi-tick");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "multi-tick",
    });

    // Run 3 ticks
    const tick1 = executeSessionTick(ws, session);
    const tick2 = executeSessionTick(ws, session);
    const tick3 = executeSessionTick(ws, session);

    expect(session.tickCount).toBe(3);
    expect(session.ticks).toHaveLength(3);
    expect(tick1.tickId).not.toBe(tick2.tickId);
    expect(tick2.tickId).not.toBe(tick3.tickId);
  });

  test("session respects maxTicks limit", () => {
    const ws = newWorkspace();
    setupAgent(ws, "max-tick");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "max-tick",
      maxTicks: 3,
    });

    // Run 5 ticks
    for (let i = 0; i < 5; i++) {
      executeSessionTick(ws, session);
    }

    expect(session.tickCount).toBe(5);
    expect(session.ticks).toHaveLength(3); // Capped at maxTicks
  });

  test("session tracks pollution score history", () => {
    const ws = newWorkspace();
    setupAgent(ws, "poll-track");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "poll-track",
    });

    executeSessionTick(ws, session);
    // After first tick, lastPollutionScore should be set
    expect(typeof session.lastPollutionScore).toBe("number");
  });
});

// ─── Anomaly detection ──────────────────────────────

describe("Continuous Monitor — anomaly detection", () => {
  test("no anomaly on first tick (not enough data)", () => {
    const ws = newWorkspace();
    setupAgent(ws, "anomaly1");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "anomaly1",
      config: defaultMonitorConfig(),
    });

    // First tick: no baseline, so no anomalies possible
    const actualAnomalies = result.anomalies.filter((a) => a.isAnomaly);
    expect(actualAnomalies.length).toBe(0);
  });

  test("anomaly detection produces all expected metrics", () => {
    const ws = newWorkspace();
    setupAgent(ws, "metrics");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "metrics",
      config: defaultMonitorConfig(),
    });

    const metricNames = result.anomalies.map((a) => a.metricName);
    expect(metricNames).toContain("event_volume");
    expect(metricNames).toContain("injection_rate");
    expect(metricNames).toContain("error_rate");
    expect(metricNames).toContain("tool_call_volume");
    expect(metricNames).toContain("pollution_score");
  });

  test("anomaly results have correct structure", () => {
    const ws = newWorkspace();
    setupAgent(ws, "struct");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "struct",
      config: defaultMonitorConfig(),
    });

    for (const anomaly of result.anomalies) {
      expect(anomaly).toHaveProperty("metricName");
      expect(anomaly).toHaveProperty("currentValue");
      expect(anomaly).toHaveProperty("baseline");
      expect(anomaly).toHaveProperty("stdDev");
      expect(anomaly).toHaveProperty("zScore");
      expect(anomaly).toHaveProperty("isAnomaly");
      expect(anomaly).toHaveProperty("direction");
      expect(anomaly).toHaveProperty("severity");
      expect(["up", "down", "stable"]).toContain(anomaly.direction);
      expect(["info", "warning", "critical"]).toContain(anomaly.severity);
    }
  });
});

// ─── Reporting ──────────────────────────────────────

describe("Continuous Monitor — reporting", () => {
  test("tick markdown contains key sections", () => {
    const ws = newWorkspace();
    setupAgent(ws, "report-tick");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "report-tick",
      config: defaultMonitorConfig(),
    });

    const markdown = renderMonitorTickMarkdown(result);
    expect(markdown).toContain("Continuous Monitor");
    expect(markdown).toContain("Tick ID");
    expect(markdown).toContain("report-tick");
    expect(markdown).toContain("Overall:");
  });

  test("session markdown contains summary and ticks", () => {
    const ws = newWorkspace();
    setupAgent(ws, "report-sess");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "report-sess",
    });

    executeSessionTick(ws, session);
    executeSessionTick(ws, session);

    const markdown = renderMonitorSessionMarkdown(session);
    expect(markdown).toContain("Continuous Monitor Session Report");
    expect(markdown).toContain("report-sess");
    expect(markdown).toContain("Summary");
    expect(markdown).toContain("Recent Ticks");
  });

  test("tick report persistence works", () => {
    const ws = newWorkspace();
    setupAgent(ws, "persist");

    const result = runMonitorTick({
      workspace: ws,
      agentId: "persist",
      config: defaultMonitorConfig(),
    });

    const filePath = saveMonitorTickReport(ws, result);
    expect(filePath).toContain("ticks");
    expect(filePath).toContain(result.tickId);
  });
});

// ─── Time series storage ────────────────────────────

describe("Continuous Monitor — time series", () => {
  test("metrics accumulate across ticks", () => {
    const ws = newWorkspace();
    setupAgent(ws, "timeseries");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "timeseries",
    });

    // Run multiple ticks to build up time series
    for (let i = 0; i < 5; i++) {
      executeSessionTick(ws, session);
    }

    // Each tick stores 5 metrics
    // Check that the session has accumulated data
    expect(session.tickCount).toBe(5);
    expect(session.ticks).toHaveLength(5);
  });
});

// ─── Config edge cases ──────────────────────────────

describe("Continuous Monitor — edge cases", () => {
  test("works with minimum interval", () => {
    const ws = newWorkspace();
    setupAgent(ws, "min-int");

    const config = continuousMonitorConfigSchema.parse({
      schemaVersion: 1,
      intervalSeconds: 30,
    });

    const result = runMonitorTick({
      workspace: ws,
      agentId: "min-int",
      config,
    });

    expect(result.overallSeverity).toBe("ok");
  });

  test("works with high sensitivity", () => {
    const ws = newWorkspace();
    setupAgent(ws, "hi-sense");

    const config = continuousMonitorConfigSchema.parse({
      schemaVersion: 1,
      anomalySensitivity: 1.0,
    });

    const result = runMonitorTick({
      workspace: ws,
      agentId: "hi-sense",
      config,
    });

    expect(result.overallSeverity).toBeDefined();
  });

  test("works with low sensitivity", () => {
    const ws = newWorkspace();
    setupAgent(ws, "lo-sense");

    const config = continuousMonitorConfigSchema.parse({
      schemaVersion: 1,
      anomalySensitivity: 0.0,
    });

    const result = runMonitorTick({
      workspace: ws,
      agentId: "lo-sense",
      config,
    });

    expect(result.overallSeverity).toBeDefined();
  });

  test("session with custom config overrides", () => {
    const ws = newWorkspace();
    setupAgent(ws, "custom");

    const session = createMonitorSession({
      workspace: ws,
      agentId: "custom",
      config: {
        intervalSeconds: 60,
        anomalySensitivity: 0.9,
        retentionDays: 7,
        trustDriftThreshold: 2,
      },
    });

    expect(session.config.intervalSeconds).toBe(60);
    expect(session.config.anomalySensitivity).toBe(0.9);
    expect(session.config.retentionDays).toBe(7);
    expect(session.config.trustDriftThreshold).toBe(2);
  });
});
