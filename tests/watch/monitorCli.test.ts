import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContinuousMonitor, type ContinuousMonitorConfig } from "../../src/watch/continuousMonitor.js";
import { DashboardFeed } from "../../src/watch/dashboardFeed.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("amc monitor — continuous monitoring integration", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-monitor-test-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("should create continuous monitor with custom config", () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent",
      scoringIntervalMs: 60000,
      driftCheckIntervalMs: 120000,
      scoreDropThreshold: 0.15,
      enableWebhooks: false,
    };

    const monitor = createContinuousMonitor(config);
    expect(monitor).toBeDefined();

    const metrics = monitor.getMetrics();
    expect(metrics.agentId).toBe("test-agent");
    expect(metrics.currentScore).toBeNull();
    expect(metrics.previousScore).toBeNull();
    expect(metrics.scoreDelta).toBeNull();
    expect(metrics.activeIncidents).toBe(0);
    expect(metrics.anomaliesDetected).toBe(0);
    expect(metrics.totalScores).toBe(0);
    expect(metrics.uptime).toBe(0);
  });

  it("should register and unregister with dashboard feed", () => {
    const feed = new DashboardFeed();
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "dash-test-agent",
    };

    const monitor = createContinuousMonitor(config);
    feed.registerMonitor("dash-test-agent", monitor.getMetrics());

    const snapshot = feed.getSnapshot();
    expect(snapshot.globalStats.totalAgents).toBe(1);
    expect(snapshot.agents["dash-test-agent"]).toBeDefined();
    expect(snapshot.agents["dash-test-agent"]!.agentId).toBe("dash-test-agent");

    feed.unregisterMonitor("dash-test-agent");
    const after = feed.getSnapshot();
    expect(after.globalStats.totalAgents).toBe(0);
  });

  it("should emit started event and track uptime on start", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "uptime-agent",
      scoringIntervalMs: 999999,
      driftCheckIntervalMs: 999999,
    };

    const monitor = createContinuousMonitor(config);

    const events: string[] = [];
    monitor.on("started", () => events.push("started"));

    await monitor.start();
    expect(events).toContain("started");

    await new Promise((r) => setTimeout(r, 50));
    const metrics = monitor.getMetrics();
    expect(metrics.uptime).toBeGreaterThan(0);

    await monitor.stop();
  });

  it("should not allow double start", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "double-start",
      scoringIntervalMs: 999999,
      driftCheckIntervalMs: 999999,
    };

    const monitor = createContinuousMonitor(config);
    await monitor.start();

    await expect(monitor.start()).rejects.toThrow("Monitor already running");

    await monitor.stop();
  });

  it("dashboard feed should buffer and retrieve events", () => {
    const feed = new DashboardFeed();

    feed.pushEvent({
      type: "score",
      ts: Date.now(),
      agentId: "buf-agent",
      data: { score: 0.85, delta: null },
    });

    feed.pushEvent({
      type: "drift",
      ts: Date.now(),
      agentId: "buf-agent",
      data: { triggered: true, reasons: ["score regression"] },
    });

    const events = feed.getRecentEvents(10);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("score");
    expect(events[1]!.type).toBe("drift");
  });

  it("dashboard feed should return null for unregistered agent", () => {
    const feed = new DashboardFeed();
    expect(feed.getAgentMetrics("nonexistent")).toBeNull();
  });

  it("dashboard snapshot should aggregate incidents and anomalies", () => {
    const feed = new DashboardFeed();

    feed.registerMonitor("a1", {
      agentId: "a1",
      currentScore: 0.8,
      previousScore: 0.9,
      scoreDelta: -0.1,
      lastScoredAt: Date.now(),
      lastDriftCheckAt: null,
      activeIncidents: 2,
      anomaliesDetected: 3,
      totalScores: 10,
      uptime: 60000,
    });

    feed.registerMonitor("a2", {
      agentId: "a2",
      currentScore: 0.95,
      previousScore: null,
      scoreDelta: null,
      lastScoredAt: Date.now(),
      lastDriftCheckAt: null,
      activeIncidents: 1,
      anomaliesDetected: 0,
      totalScores: 5,
      uptime: 30000,
    });

    const snap = feed.getSnapshot();
    expect(snap.globalStats.totalAgents).toBe(2);
    expect(snap.globalStats.totalIncidents).toBe(3);
    expect(snap.globalStats.totalAnomalies).toBe(3);
  });
});
