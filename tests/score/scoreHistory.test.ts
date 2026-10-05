import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScoreHistoryStore, type ScoreSnapshot } from "../../src/score/scoreHistory.js";
import { ensureSigningKeys } from "../../src/crypto/keys.js";

describe("ScoreHistoryStore", () => {
  let workspace: string;
  let store: ReturnType<typeof createScoreHistoryStore>;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-score-history-test-"));
    ensureSigningKeys(workspace);
    store = createScoreHistoryStore(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("should record a score snapshot", () => {
    const snapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: {
        governance: 0.8,
        reliability: 0.7,
        security: 0.9
      },
      overallScore: 0.8,
      level: 3,
      metadata: { runId: "run-123" }
    });

    expect(snapshot.snapshotId).toBeDefined();
    expect(snapshot.agentId).toBe("agent-1");
    expect(snapshot.dimensionScores.governance).toBe(0.8);
    expect(snapshot.overallScore).toBe(0.8);
    expect(snapshot.level).toBe(3);
    expect(snapshot.snapshotHash).toBeDefined();
    expect(snapshot.signature).toBeDefined();
  });

  it("should retrieve score history for an agent", () => {
    // Record multiple snapshots
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.7 },
      overallScore: 0.7,
      level: 2,
      snapshotTs: 1000
    });

    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3,
      snapshotTs: 2000
    });

    store.recordSnapshot({
      agentId: "agent-2",
      dimensionScores: { governance: 0.6 },
      overallScore: 0.6,
      level: 2,
      snapshotTs: 1500
    });

    const history = store.getHistory("agent-1");
    expect(history).toHaveLength(2);
    expect(history[0].snapshotTs).toBe(2000); // Most recent first
    expect(history[1].snapshotTs).toBe(1000);
  });

  it("should detect regressions", () => {
    // Record baseline snapshot
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: {
        governance: 0.8,
        reliability: 0.7,
        security: 0.9
      },
      overallScore: 0.8,
      level: 3,
      snapshotTs: 1000
    });

    // Record regressed snapshot
    const currentSnapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: {
        governance: 0.6, // Dropped by 0.2 (25%)
        reliability: 0.7, // Stable
        security: 0.85   // Minor drop
      },
      overallScore: 0.72,
      level: 3,
      snapshotTs: 2000
    });

    const alerts = store.detectRegressions({
      agentId: "agent-1",
      currentSnapshot
    });

    expect(alerts.length).toBeGreaterThan(0);
    const governanceAlert = alerts.find(a => a.dimension === "governance");
    expect(governanceAlert).toBeDefined();
    expect(governanceAlert?.scoreBefore).toBe(0.8);
    expect(governanceAlert?.scoreAfter).toBe(0.6);
    expect(governanceAlert?.delta).toBeCloseTo(-0.2, 1);
    expect(governanceAlert?.severity).toBe("high");
    expect(governanceAlert?.status).toBe("open");
  });

  it("should not alert on improvements", () => {
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.6 },
      overallScore: 0.6,
      level: 2,
      snapshotTs: 1000
    });

    const currentSnapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 }, // Improved
      overallScore: 0.8,
      level: 3,
      snapshotTs: 2000
    });

    const alerts = store.detectRegressions({
      agentId: "agent-1",
      currentSnapshot
    });

    expect(alerts).toHaveLength(0);
  });

  it("should respect regression thresholds", () => {
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3,
      snapshotTs: 1000
    });

    const currentSnapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.77 }, // Small drop (3.75%)
      overallScore: 0.77,
      level: 3,
      snapshotTs: 2000
    });

    const alerts = store.detectRegressions({
      agentId: "agent-1",
      currentSnapshot,
      thresholds: {
        minDelta: 0.05,
        minPercentChange: 10
      }
    });

    expect(alerts).toHaveLength(0); // Below thresholds
  });

  it("should get open alerts", () => {
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3,
      snapshotTs: 1000
    });

    const currentSnapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.5 },
      overallScore: 0.5,
      level: 2,
      snapshotTs: 2000
    });

    store.detectRegressions({ agentId: "agent-1", currentSnapshot });

    const openAlerts = store.getOpenAlerts("agent-1");
    expect(openAlerts.length).toBeGreaterThan(0);
    expect(openAlerts[0].status).toBe("open");
  });

  it("should update alert status", () => {
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3,
      snapshotTs: 1000
    });

    const currentSnapshot = store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.5 },
      overallScore: 0.5,
      level: 2,
      snapshotTs: 2000
    });

    const alerts = store.detectRegressions({ agentId: "agent-1", currentSnapshot });
    const alertId = alerts[0].alertId;

    store.updateAlertStatus(alertId, "resolved", "admin", "Fixed by code update");

    const openAlerts = store.getOpenAlerts("agent-1");
    expect(openAlerts).toHaveLength(0);
  });

  it("should generate trend report", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Record snapshots over 10 days
    for (let i = 0; i < 10; i++) {
      store.recordSnapshot({
        agentId: "agent-1",
        dimensionScores: {
          governance: 0.5 + (i * 0.03), // Improving
          reliability: 0.8 - (i * 0.02), // Degrading
          security: 0.7 + (i % 2 === 0 ? -0.02 : 0.02) // Stable bounded variation
        },
        overallScore: 0.7,
        level: 3,
        snapshotTs: now - (10 - i) * day
      });
    }

    const report = store.generateTrendReport("agent-1", {
      windowStartTs: now - 11 * day,
      windowEndTs: now
    });

    expect(report.snapshotCount).toBe(10);
    expect(report.dimensions).toHaveLength(3);

    const governance = report.dimensions.find(d => d.dimension === "governance");
    expect(governance?.trend).toBe("improving");

    const reliability = report.dimensions.find(d => d.dimension === "reliability");
    expect(reliability?.trend).toBe("degrading");

    const security = report.dimensions.find(d => d.dimension === "security");
    expect(security?.trend).toBe("stable");

    expect(report.summary).toContain("10 snapshots analyzed");
  });

  it("should verify integrity of score history", () => {
    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3
    });

    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.7 },
      overallScore: 0.7,
      level: 3
    });

    const result = store.verifyIntegrity("agent-1");
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should handle empty history gracefully", () => {
    const history = store.getHistory("nonexistent-agent");
    expect(history).toHaveLength(0);

    const report = store.generateTrendReport("nonexistent-agent");
    expect(report.snapshotCount).toBe(0);
    expect(report.overallTrend).toBe("stable");
  });

  it("should filter history by time window", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.7 },
      overallScore: 0.7,
      level: 3,
      snapshotTs: now - 10 * day
    });

    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.8 },
      overallScore: 0.8,
      level: 3,
      snapshotTs: now - 5 * day
    });

    store.recordSnapshot({
      agentId: "agent-1",
      dimensionScores: { governance: 0.9 },
      overallScore: 0.9,
      level: 4,
      snapshotTs: now - 1 * day
    });

    const history = store.getHistory("agent-1", {
      startTs: now - 6 * day,
      endTs: now
    });

    expect(history).toHaveLength(2);
    expect(history[0].dimensionScores.governance).toBe(0.9);
    expect(history[1].dimensionScores.governance).toBe(0.8);
  });
});
