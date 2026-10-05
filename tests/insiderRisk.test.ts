import { afterEach, describe, expect, test } from "vitest";
import {
  configureInsiderRisk,
  getInsiderRiskConfig,
  recordApprovalEvent,
  recordToolUsageEvent,
  recordPolicyChangeEvent,
  analyzeRubberStamping,
  detectSelfApprovals,
  detectUnusualHours,
  detectPermissionAnomalies,
  detectFrequencyAnomalies,
  computeInsiderRiskScores,
  exportAttestationBundle,
  generateInsiderRiskReport,
  getInsiderAlerts,
  acknowledgeInsiderAlert,
  renderInsiderRiskMarkdown,
  resetInsiderRiskState,
} from "../src/audit/insiderRisk.js";

afterEach(() => {
  resetInsiderRiskState();
});

describe("deterministic time and denial severity boundaries", () => {
  test("approval hours distinguish an allowed weekday from an excluded day", () => {
    configureInsiderRisk({ normalHoursStart: 8, normalHoursEnd: 18, normalDays: [3] });
    const fixtures = [
      { actor: "inside", date: new Date(2026, 8, 30, 11) },
      { actor: "before-hours", date: new Date(2026, 8, 30, 7) },
      { actor: "at-end", date: new Date(2026, 8, 30, 18) },
      { actor: "excluded-day", date: new Date(2026, 9, 1, 11) }
    ];
    expect(fixtures[0].date.getDay()).toBe(3);
    for (const fixture of fixtures) recordApprovalEvent({
      requesterId: "requester", approverId: fixture.actor, action: "review", decision: "APPROVED",
      ts: fixture.date.getTime(), durationMs: 10_000
    });
    const outside = detectUnusualHours();
    expect(outside.map(row => row.actorId).sort()).toEqual(["at-end", "before-hours", "excluded-day"]);
    expect(outside.every(row => row.isOutsideNormalHours)).toBe(true);
  });

  test("a qualifying fifty-percent denial rate emits medium severity", () => {
    configureInsiderRisk({ permissionMinAttempts: 6, permissionDenialRateThreshold: 0.5 });
    const ts = new Date(2026, 8, 30, 11).getTime();
    for (let index = 0; index < 6; index++) recordToolUsageEvent({
      agentId: "half-denied", toolName: "controlled-tool", action: "execute", ts,
      permitted: index >= 3
    });
    expect(detectPermissionAnomalies()).toEqual([expect.objectContaining({
      agentId: "half-denied", denialCount: 3, totalAttempts: 6, denialRate: 0.5, isAnomaly: true
    })]);
    expect(getInsiderAlerts("half-denied").find(row => row.category === "permission_anomaly")?.severity).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
describe("configuration", () => {
  test("default config has reasonable values", () => {
    const config = getInsiderRiskConfig();
    expect(config.rubberStampThresholdMs).toBe(5000);
    expect(config.normalHoursStart).toBe(8);
    expect(config.normalHoursEnd).toBe(18);
    expect(config.normalDays.length).toBe(5);
  });

  test("configure overrides specific settings", () => {
    configureInsiderRisk({ rubberStampThresholdMs: 10000 });
    expect(getInsiderRiskConfig().rubberStampThresholdMs).toBe(10000);
    // Other settings unchanged
    expect(getInsiderRiskConfig().normalHoursStart).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------
describe("event ingestion", () => {
  test("records approval events", () => {
    const event = recordApprovalEvent({
      requesterId: "user-1",
      approverId: "user-2",
      action: "deploy",
      decision: "APPROVED",
      ts: Date.now(),
      durationMs: 3000,
    });
    expect(event.eventId).toMatch(/^ae_/);
  });

  test("records tool usage events", () => {
    const event = recordToolUsageEvent({
      agentId: "agent-1",
      toolName: "file-write",
      action: "write",
      ts: Date.now(),
      permitted: true,
    });
    expect(event.eventId).toMatch(/^tue_/);
  });

  test("records policy change events", () => {
    const event = recordPolicyChangeEvent({
      actorId: "admin-1",
      policyType: "ops-policy",
      changeType: "update",
      ts: Date.now(),
      description: "Updated retention settings",
    });
    expect(event.eventId).toMatch(/^pce_/);
  });
});

// ---------------------------------------------------------------------------
// Rubber-stamping detection
// ---------------------------------------------------------------------------
describe("rubber-stamping detection", () => {
  test("detects rubber-stamping approver", () => {
    // Record 10 fast approvals from same approver
    for (let i = 0; i < 10; i++) {
      recordApprovalEvent({
        requesterId: `user-${i}`,
        approverId: "rubber-stamper",
        action: `action-${i}`,
        decision: "APPROVED",
        ts: Date.now(),
        durationMs: 1000, // fast approval (< 5000ms threshold)
      });
    }

    const analyses = analyzeRubberStamping();
    expect(analyses.length).toBe(1);
    expect(analyses[0]!.isRubberStamping).toBe(true);
    expect(analyses[0]!.approvalRate).toBe(1.0);
    expect(analyses[0]!.fastApprovals).toBe(10);
  });

  test("does not flag careful approver", () => {
    for (let i = 0; i < 10; i++) {
      recordApprovalEvent({
        requesterId: `user-${i}`,
        approverId: "careful-approver",
        action: `action-${i}`,
        decision: i < 7 ? "APPROVED" : "DENIED",
        ts: Date.now(),
        durationMs: 30000, // slow approvals
      });
    }

    const analyses = analyzeRubberStamping();
    const analysis = analyses.find((a) => a.approverId === "careful-approver");
    expect(analysis?.isRubberStamping).toBe(false);
  });

  test("skips approvers with too few decisions", () => {
    for (let i = 0; i < 3; i++) {
      recordApprovalEvent({
        requesterId: `user-${i}`,
        approverId: "newbie",
        action: `action-${i}`,
        decision: "APPROVED",
        ts: Date.now(),
        durationMs: 1000,
      });
    }

    const analyses = analyzeRubberStamping();
    expect(analyses.length).toBe(0);
  });

  test("creates alert for rubber-stamping", () => {
    for (let i = 0; i < 10; i++) {
      recordApprovalEvent({
        requesterId: `user-${i}`,
        approverId: "stamper",
        action: `action-${i}`,
        decision: "APPROVED",
        ts: Date.now(),
        durationMs: 500,
      });
    }
    analyzeRubberStamping();
    const alerts = getInsiderAlerts("stamper");
    expect(alerts.some((a) => a.category === "rubber_stamping")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Self-approval detection
// ---------------------------------------------------------------------------
describe("self-approval detection", () => {
  test("detects self-approval attempt", () => {
    recordApprovalEvent({
      requesterId: "user-1",
      approverId: "user-1",
      action: "deploy-prod",
      decision: "APPROVED",
      ts: Date.now(),
      durationMs: 100,
    });

    const attempts = detectSelfApprovals();
    expect(attempts.length).toBe(1);
    expect(attempts[0]!.requesterId).toBe("user-1");
    expect(attempts[0]!.action).toBe("deploy-prod");
  });

  test("creates critical alert for self-approval", () => {
    recordApprovalEvent({
      requesterId: "user-1",
      approverId: "user-1",
      action: "elevate-permissions",
      decision: "APPROVED",
      ts: Date.now(),
      durationMs: 100,
    });
    detectSelfApprovals();
    const alerts = getInsiderAlerts("user-1");
    expect(alerts.some((a) => a.category === "self_approval" && a.severity === "critical")).toBe(true);
  });

  test("no detection for proper approvals", () => {
    recordApprovalEvent({
      requesterId: "user-1",
      approverId: "user-2",
      action: "deploy",
      decision: "APPROVED",
      ts: Date.now(),
      durationMs: 5000,
    });
    const attempts = detectSelfApprovals();
    expect(attempts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unusual hours detection
// ---------------------------------------------------------------------------
describe("unusual hours detection", () => {
  test("detects policy change outside normal hours", () => {
    // Create a timestamp at 3 AM on a Wednesday
    const date = new Date();
    date.setHours(3, 0, 0, 0);
    // Make sure it's a weekday
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    recordPolicyChangeEvent({
      actorId: "admin-1",
      policyType: "ops-policy",
      changeType: "update",
      ts: date.getTime(),
      description: "Late night policy change",
    });

    const activities = detectUnusualHours();
    const outside = activities.filter((a) => a.isOutsideNormalHours);
    expect(outside.length).toBeGreaterThan(0);
  });

  test("normal hours activity is not flagged as unusual", () => {
    // Create a timestamp at 10 AM on a Wednesday
    const date = new Date();
    date.setHours(10, 0, 0, 0);
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    recordPolicyChangeEvent({
      actorId: "admin-1",
      policyType: "ops-policy",
      changeType: "update",
      ts: date.getTime(),
      description: "Normal business hours change",
    });

    const activities = detectUnusualHours();
    const policyActivities = activities.filter((a) => a.activityType.startsWith("policy_"));
    expect(policyActivities.length).toBe(1);
    expect(policyActivities[0]!.isOutsideNormalHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission anomaly detection
// ---------------------------------------------------------------------------
describe("permission anomaly detection", () => {
  test("detects high denial rate", () => {
    for (let i = 0; i < 10; i++) {
      recordToolUsageEvent({
        agentId: "agent-1",
        toolName: "admin-tool",
        action: "execute",
        ts: Date.now(),
        permitted: i < 3, // 70% denial rate
      });
    }

    const anomalies = detectPermissionAnomalies();
    expect(anomalies.length).toBe(1);
    expect(anomalies[0]!.isAnomaly).toBe(true);
    expect(anomalies[0]!.denialRate).toBe(0.7);
  });

  test("no anomaly for normal usage", () => {
    for (let i = 0; i < 10; i++) {
      recordToolUsageEvent({
        agentId: "agent-1",
        toolName: "read-tool",
        action: "read",
        ts: Date.now(),
        permitted: true,
      });
    }

    const anomalies = detectPermissionAnomalies();
    const readAnomaly = anomalies.find((a) => a.toolName === "read-tool");
    expect(readAnomaly?.isAnomaly).toBe(false);
  });

  test("skips tools with too few attempts", () => {
    for (let i = 0; i < 3; i++) {
      recordToolUsageEvent({
        agentId: "agent-1",
        toolName: "rare-tool",
        action: "execute",
        ts: Date.now(),
        permitted: false,
      });
    }
    expect(detectPermissionAnomalies().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Frequency anomaly detection
// ---------------------------------------------------------------------------
describe("frequency anomaly detection", () => {
  test("detects bulk policy changes", () => {
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      recordPolicyChangeEvent({
        actorId: "admin-bulk",
        policyType: "policy-type",
        changeType: "update",
        ts: now + i * 1000, // 15 changes in 15 seconds
        description: `Change ${i}`,
      });
    }

    const newAlerts = detectFrequencyAnomalies();
    expect(newAlerts.length).toBe(1);
    expect(newAlerts[0]!.category).toBe("bulk_operation");
  });

  test("no alert for spread-out changes", () => {
    for (let i = 0; i < 5; i++) {
      recordPolicyChangeEvent({
        actorId: "admin-slow",
        policyType: "policy-type",
        changeType: "update",
        ts: Date.now() + i * 600000, // 10 minutes apart
        description: `Change ${i}`,
      });
    }
    const newAlerts = detectFrequencyAnomalies();
    expect(newAlerts.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------
describe("risk scoring", () => {
  test("computes risk scores from alerts", () => {
    // Generate some alerts via self-approval
    recordApprovalEvent({
      requesterId: "risky-user",
      approverId: "risky-user",
      action: "deploy",
      decision: "APPROVED",
      ts: Date.now(),
      durationMs: 100,
    });
    detectSelfApprovals();

    const scores = computeInsiderRiskScores();
    expect(scores.length).toBe(1);
    expect(scores[0]!.actorId).toBe("risky-user");
    expect(scores[0]!.overallScore).toBeGreaterThan(0);
    expect(scores[0]!.riskLevel).toBe("critical"); // self-approval = critical
    expect(scores[0]!.criticalAlertCount).toBe(1);
  });

  test("sorts by overall score descending", () => {
    // risky-user: self-approval (critical)
    recordApprovalEvent({ requesterId: "risky", approverId: "risky", action: "a", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    detectSelfApprovals();

    // normal-user: just a medium alert from unusual hours
    const date = new Date();
    date.setHours(2, 0, 0, 0);
    while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    recordPolicyChangeEvent({ actorId: "normal", policyType: "p", changeType: "update", ts: date.getTime(), description: "Late change" });
    detectUnusualHours();

    const scores = computeInsiderRiskScores();
    expect(scores.length).toBe(2);
    expect(scores[0]!.overallScore).toBeGreaterThanOrEqual(scores[1]!.overallScore);
  });

  test("no scores when no alerts", () => {
    expect(computeInsiderRiskScores().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Alert management
// ---------------------------------------------------------------------------
describe("alert management", () => {
  test("acknowledges alert", () => {
    recordApprovalEvent({ requesterId: "u", approverId: "u", action: "a", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    detectSelfApprovals();
    const alerts = getInsiderAlerts();
    expect(alerts.length).toBe(1);
    expect(acknowledgeInsiderAlert(alerts[0]!.alertId)).toBe(true);
    expect(getInsiderAlerts()[0]!.acknowledged).toBe(true);
  });

  test("acknowledge fails for unknown alert", () => {
    expect(acknowledgeInsiderAlert("ira_nonexistent")).toBe(false);
  });

  test("filters alerts by actor", () => {
    recordApprovalEvent({ requesterId: "a", approverId: "a", action: "x", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    recordApprovalEvent({ requesterId: "b", approverId: "b", action: "y", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    detectSelfApprovals();
    expect(getInsiderAlerts("a").length).toBe(1);
    expect(getInsiderAlerts("b").length).toBe(1);
    expect(getInsiderAlerts().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Attestation export
// ---------------------------------------------------------------------------
describe("attestation export", () => {
  test("exports bundle with all data", () => {
    recordApprovalEvent({ requesterId: "u1", approverId: "u2", action: "deploy", decision: "APPROVED", ts: Date.now(), durationMs: 3000 });
    recordPolicyChangeEvent({ actorId: "admin", policyType: "p", changeType: "update", ts: Date.now(), description: "Change" });

    const bundle = exportAttestationBundle("tenant-1");
    expect(bundle.bundleId).toMatch(/^atb_/);
    expect(bundle.tenantId).toBe("tenant-1");
    expect(bundle.approvalEvents.length).toBe(1);
    expect(bundle.policyChanges.length).toBe(1);
    expect(bundle.bundleHash.length).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------
describe("insider risk report", () => {
  test("generates report with all analyses", () => {
    // Add various events
    recordApprovalEvent({ requesterId: "self", approverId: "self", action: "deploy", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    for (let i = 0; i < 10; i++) {
      recordApprovalEvent({ requesterId: `u${i}`, approverId: "stamper", action: `a${i}`, decision: "APPROVED", ts: Date.now(), durationMs: 500 });
    }
    for (let i = 0; i < 8; i++) {
      recordToolUsageEvent({ agentId: "agent", toolName: "tool", action: "exec", ts: Date.now(), permitted: i < 2 });
    }

    const report = generateInsiderRiskReport();
    expect(report.reportId).toMatch(/^irr_/);
    expect(report.selfApprovalAttempts.length).toBe(1);
    expect(report.rubberStampAnalyses.length).toBeGreaterThan(0);
    expect(report.permissionAnomalies.length).toBeGreaterThan(0);
    expect(report.riskScores.length).toBeGreaterThan(0);
    expect(report.overallRiskLevel).toBe("critical"); // self-approval present
  });

  test("empty report when no events", () => {
    const report = generateInsiderRiskReport();
    expect(report.alerts.length).toBe(0);
    expect(report.overallRiskLevel).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("markdown rendering", () => {
  test("renders report with all sections", () => {
    recordApprovalEvent({ requesterId: "self", approverId: "self", action: "deploy", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    for (let i = 0; i < 10; i++) {
      recordApprovalEvent({ requesterId: `u${i}`, approverId: "stamper", action: `a${i}`, decision: "APPROVED", ts: Date.now(), durationMs: 500 });
    }

    const report = generateInsiderRiskReport();
    const md = renderInsiderRiskMarkdown(report);
    expect(md).toContain("# Insider Risk Analytics Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Risk Scores by Actor");
    expect(md).toContain("## Alerts");
    expect(md).toContain("## Self-Approval Attempts");
    expect(md).toContain("## Rubber-Stamping Detections");
  });

  test("renders empty report", () => {
    const report = generateInsiderRiskReport();
    const md = renderInsiderRiskMarkdown(report);
    expect(md).toContain("# Insider Risk Analytics Report");
    expect(md).toContain("Overall Risk: **INFO**");
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
describe("reset", () => {
  test("clears all state", () => {
    recordApprovalEvent({ requesterId: "u", approverId: "u", action: "a", decision: "APPROVED", ts: Date.now(), durationMs: 100 });
    detectSelfApprovals();
    resetInsiderRiskState();
    expect(getInsiderAlerts().length).toBe(0);
    expect(computeInsiderRiskScores().length).toBe(0);
  });
});
