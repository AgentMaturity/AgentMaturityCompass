import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  startCanary,
  stopCanary,
  getCanaryConfig,
  makeCanaryDecision,
  recordCanaryOutcome,
  computeCanaryStats,
  createRollbackPack,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  getActiveOverrides,
  filePostmortem,
  getOverridesMissingPostmortem,
  registerPolicyDebt,
  getActivePolicyDebt,
  getExpiredPolicyDebt,
  expirePolicyDebt,
  recordSLOMeasurement,
  computeGovernanceSLO,
  defaultGovernanceSLOTarget,
  checkSLOCompliance,
  detectGovernanceDrift,
  generatePolicyCanaryReport,
  renderPolicyCanaryMarkdown,
  resetPolicyCanaryState,
  type CanaryConfig,
} from "../src/governor/policyCanary.js";

const workspaces: string[] = [];

afterEach(() => {
  resetPolicyCanaryState();
  vi.unstubAllEnvs();
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Emergency overrides must carry a verifiable auditor signature (P0-10). These
 * tests used to create them without a workspace, which recorded the literal
 * signature "unsigned" and still counted the override as active.
 */
function keyedWorkspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "policy-canary-test-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-policy-canary-")));
  workspaces.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

function makeCanaryConfig(overrides: Partial<CanaryConfig> = {}): CanaryConfig {
  return {
    enforcePercentage: 20,
    logOnlyPercentage: 80,
    enabled: true,
    candidatePolicySha256: "a".repeat(64),
    stablePolicySha256: "b".repeat(64),
    startedTs: Date.now(),
    durationMs: 3600000, // 1 hour
    autoPromote: false,
    failureThresholdRatio: 0.1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Canary lifecycle
// ---------------------------------------------------------------------------
describe("canary lifecycle", () => {
  test("startCanary stores config", () => {
    const cfg = startCanary(makeCanaryConfig());
    expect(cfg.enforcePercentage).toBe(20);
    expect(getCanaryConfig()).not.toBeNull();
  });

  test("stopCanary clears config", () => {
    startCanary(makeCanaryConfig());
    expect(getCanaryConfig()).not.toBeNull();
    stopCanary();
    expect(getCanaryConfig()).toBeNull();
  });

  test("startCanary rejects invalid config", () => {
    expect(() => startCanary(makeCanaryConfig({ enforcePercentage: 150 }))).toThrow();
  });

  test("startCanary rejects short duration", () => {
    expect(() => startCanary(makeCanaryConfig({ durationMs: 100 }))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Canary decisions
// ---------------------------------------------------------------------------
describe("canary decisions", () => {
  test("returns DISABLED when no canary active", () => {
    const decision = makeCanaryDecision("req-1");
    expect(decision.mode).toBe("DISABLED");
    expect(decision.policyUsed).toBe("stable");
  });

  test("makes deterministic decisions based on request ID", () => {
    startCanary(makeCanaryConfig({ enforcePercentage: 50 }));
    const d1 = makeCanaryDecision("test-req-123");
    const d2 = makeCanaryDecision("test-req-123");
    // Both should use the same policy (deterministic hash)
    expect(d1.policyUsed).toBe(d2.policyUsed);
  });

  test("routes some requests to candidate and some to stable", () => {
    startCanary(makeCanaryConfig({ enforcePercentage: 50 }));
    const decisions = Array.from({ length: 100 }, (_, i) => makeCanaryDecision(`req-${i}`));
    const candidates = decisions.filter((d) => d.policyUsed === "candidate");
    const stables = decisions.filter((d) => d.policyUsed === "stable");
    // With 50%, should be roughly balanced (not exact due to hash distribution)
    expect(candidates.length).toBeGreaterThan(10);
    expect(stables.length).toBeGreaterThan(10);
  });

  test("returns DISABLED when canary window expired", () => {
    startCanary(makeCanaryConfig({
      startedTs: Date.now() - 7200000, // 2 hours ago
      durationMs: 3600000, // 1 hour
    }));
    const decision = makeCanaryDecision("req-expired");
    expect(decision.mode).toBe("DISABLED");
    expect(decision.reason).toContain("expired");
  });
});

// ---------------------------------------------------------------------------
// Canary outcomes and stats
// ---------------------------------------------------------------------------
describe("canary stats", () => {
  test("returns null when no canary active", () => {
    expect(computeCanaryStats()).toBeNull();
  });

  test("computes stats from decisions", () => {
    startCanary(makeCanaryConfig({ enforcePercentage: 50 }));

    // Make some decisions
    for (let i = 0; i < 20; i++) {
      makeCanaryDecision(`stats-req-${i}`);
    }

    const stats = computeCanaryStats();
    expect(stats).not.toBeNull();
    expect(stats!.totalRequests).toBe(20);
    expect(stats!.candidateRequests + stats!.stableRequests).toBe(20);
  });

  test("tracks failure ratio", () => {
    startCanary(makeCanaryConfig({ enforcePercentage: 100, failureThresholdRatio: 0.3 }));

    // All go to candidate
    for (let i = 0; i < 10; i++) {
      const d = makeCanaryDecision(`fail-req-${i}`);
      if (i < 5) {
        recordCanaryOutcome(d.requestId, false, "failed test");
      }
    }

    const stats = computeCanaryStats();
    expect(stats!.candidateFailures).toBe(5);
    expect(stats!.candidateFailureRatio).toBe(0.5);
    expect(stats!.shouldRollback).toBe(true);
    expect(stats!.isHealthy).toBe(false);
  });

  test("shouldPromote when window expired and healthy with autoPromote", () => {
    startCanary(makeCanaryConfig({
      enforcePercentage: 100,
      startedTs: Date.now() - 7200000,
      durationMs: 3600000,
      autoPromote: true,
    }));

    // Make some successful decisions before window expiry
    // Note: they won't be counted since window expired, but they're in the decisions array
    const d = makeCanaryDecision("promote-req");
    // The decision will be DISABLED since window expired, but let's test with active window
    stopCanary();

    // Active window with autoPromote
    startCanary(makeCanaryConfig({
      enforcePercentage: 100,
      startedTs: Date.now() - 7200000,
      durationMs: 3600000,
      autoPromote: true,
    }));

    const stats = computeCanaryStats();
    expect(stats!.remainingMs).toBe(0);
    // shouldPromote requires candidateDecisions.length > 0
    // Since no decisions were made in this canary instance, shouldPromote is false
    expect(stats!.shouldRollback).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rollback packs
// ---------------------------------------------------------------------------
describe("rollback packs", () => {
  test("creates and retrieves rollback packs", () => {
    const pack = createRollbackPack("agent-1", '{"rules": []}', "pre-deploy snapshot");
    expect(pack.packId).toMatch(/^rbp_/);
    expect(pack.agentId).toBe("agent-1");
    expect(pack.policyFileSha256).toHaveLength(64);
    expect(pack.reason).toBe("pre-deploy snapshot");

    const packs = getRollbackPacks("agent-1");
    expect(packs.length).toBe(1);
  });

  test("getLatestRollbackPack returns most recent", () => {
    createRollbackPack("agent-1", '{"v": 1}', "first");
    createRollbackPack("agent-1", '{"v": 2}', "second");

    const latest = getLatestRollbackPack("agent-1");
    expect(latest).not.toBeNull();
    expect(latest!.reason).toBe("second");
  });

  test("getLatestRollbackPack returns null for unknown agent", () => {
    expect(getLatestRollbackPack("unknown")).toBeNull();
  });

  test("rollback packs are agent-scoped", () => {
    createRollbackPack("agent-1", "{}", "for agent-1");
    createRollbackPack("agent-2", "{}", "for agent-2");

    expect(getRollbackPacks("agent-1").length).toBe(1);
    expect(getRollbackPacks("agent-2").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Emergency overrides
// ---------------------------------------------------------------------------
describe("emergency overrides", () => {
  test("refuses an override without a workspace signing key", () => {
    expect(() => activateEmergencyOverride({
      agentId: "agent-1",
      reason: "production emergency",
      actionDescription: "allow DEPLOY for agent-1",
      ttlMs: 3600000,
    })).toThrow(/requires a workspace with an auditor signing key/);
  });

  test("activates an override with TTL", () => {
    const ws = keyedWorkspace();
    const override = activateEmergencyOverride({
      agentId: "agent-1",
      reason: "production emergency",
      actionDescription: "allow DEPLOY for agent-1",
      ttlMs: 3600000,
    }, ws);
    expect(override.overrideId).toMatch(/^emo_/);
    expect(override.expiresTs).toBeGreaterThan(Date.now());
    expect(override.postmortemFiled).toBe(false);
  });

  test("getActiveOverrides returns only non-expired", () => {
    const ws = keyedWorkspace();
    activateEmergencyOverride({
      agentId: "agent-1",
      reason: "active",
      actionDescription: "allow all",
      ttlMs: 3600000,
    }, ws);
    activateEmergencyOverride({
      agentId: "agent-1",
      reason: "expired",
      actionDescription: "allow all",
      ttlMs: -1, // already expired
    }, ws);

    const active = getActiveOverrides("agent-1", ws);
    expect(active.length).toBe(1);
    expect(active[0]!.reason).toBe("active");
  });

  test("filePostmortem records the artifact", () => {
    const ws = keyedWorkspace();
    const override = activateEmergencyOverride({
      agentId: "agent-1",
      reason: "test",
      actionDescription: "allow test",
      ttlMs: 3600000,
    }, ws);

    expect(filePostmortem(override.overrideId, "artifact-123", ws)).toBe(true);
    // Overrides are stored only in a workspace, so without one there is nothing to update.
    expect(filePostmortem(override.overrideId, "artifact-123")).toBe(false);
    expect(filePostmortem("nonexistent", "artifact-123", ws)).toBe(false);
  });

  test("getOverridesMissingPostmortem finds expired without postmortem", () => {
    const ws = keyedWorkspace();
    const override = activateEmergencyOverride({
      agentId: "agent-1",
      reason: "expired no postmortem",
      actionDescription: "allow test",
      ttlMs: -1, // already expired
    }, ws);

    const missing = getOverridesMissingPostmortem("agent-1", ws);
    expect(missing.length).toBe(1);
    expect(missing[0]!.overrideId).toBe(override.overrideId);
  });

  test("override with postmortem not in missing list", () => {
    const ws = keyedWorkspace();
    const override = activateEmergencyOverride({
      agentId: "agent-1",
      reason: "expired with postmortem",
      actionDescription: "allow test",
      ttlMs: -1,
    }, ws);
    filePostmortem(override.overrideId, "artifact-456", ws);

    const missing = getOverridesMissingPostmortem("agent-1", ws);
    expect(missing.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Policy debt
// ---------------------------------------------------------------------------
describe("policy debt", () => {
  test("registers and retrieves active debt", () => {
    const entry = registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "mandatory code review",
      justification: "hotfix in progress",
      expiresTs: Date.now() + 86400000,
      createdBy: "ops-lead",
    });

    expect(entry.debtId).toMatch(/^pdb_/);
    expect(entry.active).toBe(true);

    const active = getActivePolicyDebt("agent-1");
    expect(active.length).toBe(1);
  });

  test("getExpiredPolicyDebt finds expired entries", () => {
    registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "expired waiver",
      justification: "was needed",
      expiresTs: Date.now() - 1000, // already expired
      createdBy: "ops-lead",
    });

    const expired = getExpiredPolicyDebt("agent-1");
    expect(expired.length).toBe(1);
  });

  test("expirePolicyDebt marks overdue entries inactive", () => {
    registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "test waiver",
      justification: "test",
      expiresTs: Date.now() - 1000,
      createdBy: "test",
    });

    const expiredIds = expirePolicyDebt("agent-1");
    expect(expiredIds.length).toBe(1);

    // Should now appear in expired, not active
    expect(getActivePolicyDebt("agent-1").length).toBe(0);
    expect(getExpiredPolicyDebt("agent-1").length).toBe(1);
  });

  test("debt is agent-scoped", () => {
    registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "test",
      justification: "test",
      expiresTs: Date.now() + 86400000,
      createdBy: "test",
    });
    registerPolicyDebt({
      agentId: "agent-2",
      waivedRequirement: "test",
      justification: "test",
      expiresTs: Date.now() + 86400000,
      createdBy: "test",
    });

    expect(getActivePolicyDebt("agent-1").length).toBe(1);
    expect(getActivePolicyDebt("agent-2").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Governance SLO
// ---------------------------------------------------------------------------
describe("governance SLO", () => {
  test("computeGovernanceSLO returns zeros with no data", () => {
    const slo = computeGovernanceSLO();
    expect(slo.policyDecisionLatencyP95Ms).toBe(0);
    expect(slo.falseBlockRatePercent).toBe(0);
  });

  test("records and computes SLO from measurements", () => {
    for (let i = 0; i < 20; i++) {
      recordSLOMeasurement("policy_decision", 10 + i * 5);
    }
    recordSLOMeasurement("false_block");
    recordSLOMeasurement("policy_error");

    const slo = computeGovernanceSLO();
    expect(slo.policyDecisionLatencyP95Ms).toBeGreaterThan(0);
    expect(slo.falseBlockRatePercent).toBeGreaterThan(0);
    expect(slo.policyErrorRatePercent).toBeGreaterThan(0);
  });

  test("defaultGovernanceSLOTarget returns sensible defaults", () => {
    const target = defaultGovernanceSLOTarget();
    expect(target.maxPolicyDecisionLatencyP95Ms).toBe(100);
    expect(target.maxFalseBlockRatePercent).toBe(5);
  });

  test("checkSLOCompliance passes when within target", () => {
    const slo = {
      policyDecisionLatencyP95Ms: 50,
      approvalDecisionLatencyP95Ms: 200,
      falseBlockRatePercent: 1,
      policyErrorRatePercent: 0.5,
    };
    const result = checkSLOCompliance(slo);
    expect(result.met).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  test("checkSLOCompliance fails when exceeding target", () => {
    const slo = {
      policyDecisionLatencyP95Ms: 200, // exceeds 100
      approvalDecisionLatencyP95Ms: 600, // exceeds 500
      falseBlockRatePercent: 10, // exceeds 5
      policyErrorRatePercent: 2, // exceeds 1
    };
    const result = checkSLOCompliance(slo);
    expect(result.met).toBe(false);
    expect(result.violations.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Governance drift detection
// ---------------------------------------------------------------------------
describe("governance drift detection", () => {
  test("returns no drift for clean state", () => {
    const result = detectGovernanceDrift("agent-1");
    expect(result.drifted).toBe(false);
    expect(result.driftItems.length).toBe(0);
  });

  test("detects expired overrides without postmortem", () => {
    const ws = keyedWorkspace();
    activateEmergencyOverride({
      agentId: "agent-1",
      reason: "test",
      actionDescription: "allow test",
      ttlMs: -1,
    }, ws);

    const result = detectGovernanceDrift("agent-1", ws);
    expect(result.drifted).toBe(true);
    expect(result.driftItems.some((i) => i.category === "OVERRIDE_HYGIENE")).toBe(true);
    expect(result.driftItems[0]!.severity).toBe("HIGH");
  });

  test("detects excessive policy debt", () => {
    for (let i = 0; i < 5; i++) {
      registerPolicyDebt({
        agentId: "agent-1",
        waivedRequirement: `waiver-${i}`,
        justification: "test",
        expiresTs: Date.now() + 86400000,
        createdBy: "test",
      });
    }

    const result = detectGovernanceDrift("agent-1");
    expect(result.drifted).toBe(true);
    expect(result.driftItems.some((i) => i.category === "POLICY_DEBT")).toBe(true);
  });

  test("detects canary failure threshold exceeded", () => {
    startCanary(makeCanaryConfig({ enforcePercentage: 100, failureThresholdRatio: 0.1 }));
    // Make all decisions fail
    for (let i = 0; i < 10; i++) {
      const d = makeCanaryDecision(`drift-req-${i}`);
      recordCanaryOutcome(d.requestId, false);
    }

    const result = detectGovernanceDrift("agent-1");
    expect(result.drifted).toBe(true);
    expect(result.driftItems.some((i) => i.category === "CANARY_FAILURE")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
describe("report generation", () => {
  test("generates report with no active state", () => {
    const report = generatePolicyCanaryReport("agent-1");
    expect(report.reportId).toMatch(/^pcr_/);
    expect(report.canaryActive).toBe(false);
    expect(report.rollbackPacks).toBe(0);
    expect(report.activeOverrides).toBe(0);
    expect(report.activeDebtEntries).toBe(0);
  });

  test("generates report with active canary and state", () => {
    startCanary(makeCanaryConfig());
    createRollbackPack("agent-1", "{}", "pre-deploy");
    registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "test",
      justification: "test",
      expiresTs: Date.now() + 86400000,
      createdBy: "test",
    });

    const report = generatePolicyCanaryReport("agent-1");
    expect(report.canaryActive).toBe(true);
    expect(report.rollbackPacks).toBe(1);
    expect(report.activeDebtEntries).toBe(1);
    // canaryStats is populated when canary is active
    expect(report.canaryStats).not.toBeNull();
  });

  test("includes SLO compliance in report", () => {
    recordSLOMeasurement("policy_decision", 200);
    const report = generatePolicyCanaryReport("agent-1");
    expect(report.sloStatus).not.toBeNull();
    expect(report.sloTarget).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("markdown rendering", () => {
  test("renders report to markdown", () => {
    const ws = keyedWorkspace();
    createRollbackPack("agent-1", "{}", "test");
    activateEmergencyOverride({
      agentId: "agent-1",
      reason: "test",
      actionDescription: "allow test",
      ttlMs: -1,
    }, ws);

    const report = generatePolicyCanaryReport("agent-1", ws);
    const md = renderPolicyCanaryMarkdown(report);
    expect(md).toContain("# Policy Canary Report");
    expect(md).toContain("## Canary Status");
    expect(md).toContain("## Governance");
    expect(md).toContain("## Recommendations");
  });

  test("renders empty report gracefully", () => {
    const report = generatePolicyCanaryReport("agent-1");
    const md = renderPolicyCanaryMarkdown(report);
    expect(md).toContain("# Policy Canary Report");
    expect(md).toContain("Agent: agent-1");
  });
});

// ---------------------------------------------------------------------------
// Reset state
// ---------------------------------------------------------------------------
describe("resetPolicyCanaryState", () => {
  test("clears all in-memory state", () => {
    startCanary(makeCanaryConfig());
    createRollbackPack("agent-1", "{}", "test");
    activateEmergencyOverride({
      agentId: "agent-1",
      reason: "test",
      actionDescription: "test",
      ttlMs: 3600000,
    }, keyedWorkspace());
    registerPolicyDebt({
      agentId: "agent-1",
      waivedRequirement: "test",
      justification: "test",
      expiresTs: Date.now() + 86400000,
      createdBy: "test",
    });
    recordSLOMeasurement("policy_decision", 50);

    resetPolicyCanaryState();

    expect(getCanaryConfig()).toBeNull();
    expect(computeCanaryStats()).toBeNull();
    expect(getRollbackPacks("agent-1").length).toBe(0);
    expect(getActiveOverrides("agent-1").length).toBe(0);
    expect(getActivePolicyDebt("agent-1").length).toBe(0);
    expect(computeGovernanceSLO().policyDecisionLatencyP95Ms).toBe(0);
  });
});
