import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContinuousMonitor, type ContinuousMonitorConfig } from "../../src/watch/continuousMonitor.js";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAgentPaths } from "../../src/fleet/paths.js";

describe("ContinuousMonitor", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-test-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("should create a monitor with default config", () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent"
    };

    const monitor = createContinuousMonitor(config);
    expect(monitor).toBeDefined();

    const metrics = monitor.getMetrics();
    expect(metrics.agentId).toBe("test-agent");
    expect(metrics.currentScore).toBeNull();
    expect(metrics.uptime).toBe(0);
  });

  it("should emit started event when started", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent",
      scoringIntervalMs: 100000,
      driftCheckIntervalMs: 100000
    };

    const monitor = createContinuousMonitor(config);
    
    const startedPromise = new Promise<void>((resolve) => {
      monitor.once("started", (data) => {
        expect(data.agentId).toBe("test-agent");
        resolve();
      });
    });

    await monitor.start();
    await startedPromise;
    await monitor.stop();
  });

  it("should track uptime correctly", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent",
      scoringIntervalMs: 100000,
      driftCheckIntervalMs: 100000
    };

    const monitor = createContinuousMonitor(config);
    await monitor.start();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const metrics = monitor.getMetrics();
    expect(metrics.uptime).toBeGreaterThan(0);

    await monitor.stop();
  });

  it("creates a fresh diagnostic run when monitoring starts without prior setup", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent",
      scoringIntervalMs: 100000,
      driftCheckIntervalMs: 100000,
      enableWebhooks: false
    };

    const monitor = createContinuousMonitor(config);
    await monitor.start();

    const metrics = monitor.getMetrics();
    expect(metrics.currentScore).not.toBeNull();
    expect(metrics.totalScores).toBe(1);
    expect(metrics.lastScoredAt).not.toBeNull();

    const runsDir = getAgentPaths(workspace, "test-agent").runsDir;
    const runFiles = readdirSync(runsDir).filter((name) => name.endsWith(".json"));
    expect(runFiles).toHaveLength(1);

    await monitor.stop();
  });

  it("creates a new diagnostic run on each realtime scoring interval", async () => {
    const config: ContinuousMonitorConfig = {
      workspace,
      agentId: "test-agent",
      scoringIntervalMs: 75,
      driftCheckIntervalMs: 100000,
      enableWebhooks: false
    };

    const monitor = createContinuousMonitor(config);
    let scoreEvents = 0;
    const secondScore = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for realtime score")), 5000);
      monitor.on("score", () => {
        scoreEvents += 1;
        if (scoreEvents >= 2) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await monitor.start();
    await secondScore;

    const metrics = monitor.getMetrics();
    expect(metrics.totalScores).toBeGreaterThanOrEqual(2);

    const runsDir = getAgentPaths(workspace, "test-agent").runsDir;
    const runFiles = readdirSync(runsDir).filter((name) => name.endsWith(".json"));
    expect(runFiles.length).toBeGreaterThanOrEqual(2);

    await monitor.stop();
  });
});
