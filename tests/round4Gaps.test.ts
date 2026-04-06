/**
 * Tests for Round 4 gap implementations — R4-01 to R4-10
 */
import { describe, expect, test } from "vitest";

// R4-01
import { RealtimeMonitor, DEFAULT_DASHBOARD_CONFIG, type DashboardMetric } from "../src/monitoring/realtimeDashboard.js";
// R4-02
import { TenantManager, tenantSchema } from "../src/fleet/multiTenant.js";
// R4-03
import { DriftDetector, DEFAULT_DRIFT_CONFIG, type DriftSample } from "../src/monitoring/driftDetection.js";
// R4-04
import { generateAdversarialSuite, evaluateAdversarialResults, getTemplateRegistry, ATTACK_CATEGORIES, type AgentProfile } from "../src/redteam/adversarialGenerator.js";
// R4-05 to R4-10
import {
  FEDRAMP_MODERATE_FAMILIES,
  GLOBAL_FRAMEWORKS, getGlobalFrameworks, getFrameworkByJurisdiction,
  generateEvidencePackage,
  EU_AI_ACT_RISK_MATRIX, classifyEuAiActRisk,
  CONSTRUCT_VALIDITY_DATA,
  AMC_EVALUATION_DPIA, getDpiaAssessment,
} from "../src/compliance/globalRegulatory.js";

// ─── R4-01: Real-time Monitoring Dashboard ──────────

describe("R4-01 Real-time Monitoring Dashboard", () => {
  test("ingests metrics and tracks fleet", () => {
    const monitor = new RealtimeMonitor();
    monitor.ingest({ metricId: "m1", agentId: "a1", name: "overallScore", value: 3.5, unit: "score", ts: Date.now(), trend: "stable", severity: "normal" });
    monitor.ingest({ metricId: "m2", agentId: "a2", name: "overallScore", value: 4.0, unit: "score", ts: Date.now(), trend: "up", severity: "normal" });
    const overview = monitor.getFleetOverview();
    expect(overview.totalAgents).toBe(2);
    expect(overview.healthyAgents).toBe(2);
  });

  test("triggers alerts on threshold breach", () => {
    const monitor = new RealtimeMonitor(30, [
      { metricName: "overallScore", warningThreshold: 2.5, criticalThreshold: 1.5, direction: "below", cooldownMs: 0 },
    ]);
    const alert = monitor.ingest({ metricId: "m1", agentId: "a1", name: "overallScore", value: 1.0, unit: "score", ts: Date.now(), trend: "down", severity: "critical" });
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe("critical");
  });

  test("acknowledges alerts", () => {
    const monitor = new RealtimeMonitor(30, [
      { metricName: "overallScore", warningThreshold: 2.5, criticalThreshold: 1.5, direction: "below", cooldownMs: 0 },
    ]);
    const alert = monitor.ingest({ metricId: "m1", agentId: "a1", name: "overallScore", value: 2.0, unit: "score", ts: Date.now(), trend: "down", severity: "warning" });
    expect(alert).toBeTruthy();
    expect(monitor.acknowledgeAlert(alert!.alertId)).toBe(true);
    expect(monitor.getAlerts({ unacknowledgedOnly: true })).toHaveLength(0);
  });

  test("default dashboard config has 6 widgets", () => {
    expect(DEFAULT_DASHBOARD_CONFIG.widgets).toHaveLength(6);
    expect(DEFAULT_DASHBOARD_CONFIG.alertThresholds).toHaveLength(3);
  });

  test("prunes old metrics", () => {
    const monitor = new RealtimeMonitor(0); // 0 days retention = prune everything
    monitor.ingest({ metricId: "m1", agentId: "a1", name: "x", value: 1, unit: "u", ts: Date.now() - 100000, trend: "stable", severity: "normal" });
    const pruned = monitor.prune();
    expect(pruned).toBe(1);
  });
});

// ─── R4-02: Multi-Tenant Federated Scoring ──────────

describe("R4-02 Multi-Tenant Federated Scoring", () => {
  test("creates tenants with proper isolation", () => {
    const mgr = new TenantManager();
    const t = mgr.createTenant({ name: "Acme Corp", tier: "enterprise", dataRegion: "eu" });
    expect(t.tenantId).toContain("tenant-");
    expect(t.maxAgents).toBe(1000);
    expect(t.isolationLevel).toBe("physical");
    const iso = mgr.getIsolation(t.tenantId);
    expect(iso!.networkPolicy).toBe("dedicated");
  });

  test("free tier has logical isolation", () => {
    const mgr = new TenantManager();
    const t = mgr.createTenant({ name: "Solo Dev", tier: "free", dataRegion: "us" });
    expect(t.isolationLevel).toBe("logical");
    expect(t.maxAgents).toBe(5);
  });

  test("federated benchmark requires opt-in and min sample", () => {
    const mgr = new TenantManager();
    const t = mgr.createTenant({ name: "Test", tier: "team", dataRegion: "us" });
    // Not opted in
    expect(mgr.generateFederatedBenchmark(t.tenantId, "SOC2", 4.0, [3.5, 4.0, 3.8, 4.2, 3.9])).toBeNull();
  });

  test("cross-region access denied by default", () => {
    const mgr = new TenantManager();
    const t1 = mgr.createTenant({ name: "EU Corp", tier: "team", dataRegion: "eu" });
    const t2 = mgr.createTenant({ name: "US Corp", tier: "team", dataRegion: "us" });
    const result = mgr.validateCrossRegionAccess(t1.tenantId, t2.tenantId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("DPIA");
  });
});

// ─── R4-03: Model Drift Detection ──────────────────

describe("R4-03 Model Drift Detection", () => {
  test("no alerts with insufficient samples", () => {
    const detector = new DriftDetector();
    const alerts = detector.addSample({ ts: 1, agentId: "a1", score: 3.5, dimensions: {}, evidenceHash: "h1" });
    expect(alerts).toHaveLength(0);
  });

  test("detects score drift", () => {
    const detector = new DriftDetector({ ...DEFAULT_DRIFT_CONFIG, minSamples: 3 });
    // Baseline: ~4.0
    for (let i = 0; i < 5; i++) detector.addSample({ ts: i, agentId: "a1", score: 4.0, dimensions: {}, evidenceHash: `h${i}` });
    // Drift: drop to ~2.5
    let alerts: any[] = [];
    for (let i = 5; i < 10; i++) alerts = detector.addSample({ ts: i, agentId: "a1", score: 2.5, dimensions: {}, evidenceHash: `h${i}` });
    expect(alerts.some((a: any) => a.driftType === "score")).toBe(true);
  });

  test("detects capability drift", () => {
    const detector = new DriftDetector({ ...DEFAULT_DRIFT_CONFIG, minSamples: 3 });
    for (let i = 0; i < 5; i++) detector.addSample({ ts: i, agentId: "a1", score: 3.5, dimensions: { security: 4.0, reliability: 3.0 }, evidenceHash: `h${i}` });
    let alerts: any[] = [];
    for (let i = 5; i < 10; i++) alerts = detector.addSample({ ts: i, agentId: "a1", score: 3.5, dimensions: { security: 2.5, reliability: 3.0 }, evidenceHash: `h${i}` });
    expect(alerts.some((a: any) => a.driftType === "capability" && a.description.includes("security"))).toBe(true);
  });

  test("detects behavioral drift via evidence change", () => {
    // Use unique baseline hashes and completely different recent hashes
    // Baseline (first half): unique hashes A-E
    // Recent (second half): unique hashes F-J — no overlap
    const detector = new DriftDetector({ ...DEFAULT_DRIFT_CONFIG, minSamples: 5, windowSize: 5, evidenceChangeThreshold: 0.3 });
    for (let i = 0; i < 5; i++) detector.addSample({ ts: i, agentId: "a1", score: 3.5, dimensions: {}, evidenceHash: `baseline-${i}` });
    let alerts: any[] = [];
    for (let i = 5; i < 10; i++) alerts = detector.addSample({ ts: i, agentId: "a1", score: 3.5, dimensions: {}, evidenceHash: `completely-new-${i}` });
    expect(alerts.some((a: any) => a.driftType === "behavioral")).toBe(true);
  });

  test("reset clears history", () => {
    const detector = new DriftDetector();
    detector.addSample({ ts: 1, agentId: "a1", score: 3.5, dimensions: {}, evidenceHash: "h1" });
    detector.reset("a1");
    expect(detector.getHistory("a1")).toHaveLength(0);
  });
});

// ─── R4-04: Adversarial Sample Generation ──────────

describe("R4-04 Adversarial Sample Generation", () => {
  const profile: AgentProfile = {
    agentId: "test-agent",
    framework: "langchain",
    capabilities: ["tool-use", "memory"],
    knownWeaknesses: ["injection"],
    previousScores: { security: 3.5 },
    tools: ["web-search", "code-exec"],
    hasMemory: true,
    isMultiAgent: true,
  };

  test("generates adversarial suite", () => {
    const samples = generateAdversarialSuite(profile);
    expect(samples.length).toBeGreaterThan(5);
  });

  test("covers 10 attack categories", () => {
    expect(ATTACK_CATEGORIES).toHaveLength(10);
  });

  test("template registry has entries", () => {
    expect(getTemplateRegistry().length).toBeGreaterThanOrEqual(6);
  });

  test("generates memory-specific attacks for memory agents", () => {
    const samples = generateAdversarialSuite(profile);
    expect(samples.some((s) => s.rationale.includes("Memory"))).toBe(true);
  });

  test("generates multi-agent attacks for multi-agent systems", () => {
    const samples = generateAdversarialSuite(profile);
    expect(samples.some((s) => s.category === "cross-agent-exploitation")).toBe(true);
  });

  test("no multi-agent attacks for single agents", () => {
    const single = { ...profile, isMultiAgent: false };
    const samples = generateAdversarialSuite(single);
    expect(samples.filter((s) => s.category === "cross-agent-exploitation")).toHaveLength(0);
  });

  test("evaluates results correctly", () => {
    const samples = generateAdversarialSuite(profile);
    const results = samples.map((s) => ({ sampleId: s.sampleId, outcome: "blocked" as const }));
    const report = evaluateAdversarialResults("test-agent", results, samples);
    expect(report.overallResistanceScore).toBe(100);
    expect(report.escaped).toBe(0);
  });

  test("reports escaped samples", () => {
    const samples = generateAdversarialSuite(profile);
    const results = samples.map((s, i) => ({ sampleId: s.sampleId, outcome: i === 0 ? "escaped" as const : "blocked" as const }));
    const report = evaluateAdversarialResults("test-agent", results, samples);
    expect(report.escaped).toBe(1);
    expect(report.overallResistanceScore).toBeLessThan(100);
  });
});

// ─── R4-05: FedRAMP Cloud Integration ──────────────

describe("R4-05 FedRAMP Cloud Integration", () => {
  test("5 control families for moderate baseline", () => {
    expect(FEDRAMP_MODERATE_FAMILIES).toHaveLength(5);
  });

  test("all controls have implemented status", () => {
    for (const family of FEDRAMP_MODERATE_FAMILIES) {
      for (const ctrl of family.controls) {
        expect(ctrl.status).toBe("implemented");
        expect(ctrl.evidence).toBeTruthy();
      }
    }
  });

  test("covers AC, AU, CM, IA, SC families", () => {
    const ids = FEDRAMP_MODERATE_FAMILIES.map((f) => f.familyId);
    expect(ids).toContain("AC");
    expect(ids).toContain("AU");
    expect(ids).toContain("CM");
    expect(ids).toContain("IA");
    expect(ids).toContain("SC");
  });
});

// ─── R4-06: Global Regulatory Coverage ─────────────

describe("R4-06 Global Regulatory Coverage", () => {
  test("5 global frameworks defined", () => {
    expect(GLOBAL_FRAMEWORKS.length).toBeGreaterThanOrEqual(5);
  });

  test("covers PIPL, LGPD, DPDP, APPI", () => {
    const ids = GLOBAL_FRAMEWORKS.map((f) => f.frameworkId);
    expect(ids).toContain("china-pipl");
    expect(ids).toContain("china-genai");
    expect(ids).toContain("brazil-lgpd");
    expect(ids).toContain("india-dpdp");
    expect(ids).toContain("japan-appi");
  });

  test("all frameworks have complete mapping status", () => {
    for (const f of GLOBAL_FRAMEWORKS) {
      expect(f.mappingStatus).toBe("complete");
    }
  });

  test("framework lookup by jurisdiction", () => {
    expect(getFrameworkByJurisdiction("China")).toHaveLength(2);
    expect(getFrameworkByJurisdiction("India")).toHaveLength(1);
    expect(getFrameworkByJurisdiction("Brazil")).toHaveLength(1);
  });

  test("cross-border transfer requirements mapped for primary frameworks", () => {
    // PIPL, LGPD, DPDP, APPI all have cross-border; GenAI has content safety focus
    const primaryFrameworks = GLOBAL_FRAMEWORKS.filter((f) => !f.frameworkId.includes("genai"));
    for (const f of primaryFrameworks) {
      const hasCrossBorder = f.keyRequirements.some((r) => r.title.toLowerCase().includes("transfer") || r.title.toLowerCase().includes("cross-border"));
      expect(hasCrossBorder).toBe(true);
    }
  });
});

// ─── R4-07: Evidence Generation ────────────────────

describe("R4-07 Evidence Generation", () => {
  test("generates evidence package with attestation", () => {
    const pkg = generateEvidencePackage("SOC2", "agent-1", { security: 4.2, reliability: 3.8 }, "audit log excerpt", "config snapshot");
    expect(pkg.packageId).toContain("evidence-SOC2");
    expect(pkg.sections.length).toBeGreaterThanOrEqual(3);
    expect(pkg.attestation.hash).toBeTruthy();
    expect(pkg.attestation.version).toBe("1.0.0");
  });

  test("includes score attestation sections", () => {
    const pkg = generateEvidencePackage("ISO27001", "agent-2", { governance: 4.0 }, "", "");
    const scoreSection = pkg.sections.find((s) => s.evidenceType === "score-attestation");
    expect(scoreSection).toBeDefined();
    expect(scoreSection!.verifiable).toBe(true);
  });
});

// ─── R4-08: EU AI Act Fine-Grained Classification ──

describe("R4-08 EU AI Act Risk Classification", () => {
  test("12 risk matrix entries", () => {
    expect(EU_AI_ACT_RISK_MATRIX.length).toBeGreaterThanOrEqual(12);
  });

  test("HR resume screening classified as high risk", () => {
    const result = classifyEuAiActRisk("HR", "Resume screening");
    expect(result.riskLevel).toBe("high");
    expect(result.annexRef).toBe("Annex III, 4(a)");
    expect(result.confidenceScore).toBeGreaterThan(0.8);
  });

  test("modifiers can escalate risk", () => {
    const result = classifyEuAiActRisk("Law Enforcement", "Predictive policing", ["Real-time biometric"]);
    expect(result.riskLevel).toBe("unacceptable");
  });

  test("unknown use case gets limited with low confidence", () => {
    const result = classifyEuAiActRisk("Unknown", "Unknown task");
    expect(result.riskLevel).toBe("limited");
    expect(result.confidenceScore).toBe(0.5);
  });

  test("healthcare admin is minimal risk", () => {
    const result = classifyEuAiActRisk("Healthcare", "Administrative scheduling");
    expect(result.riskLevel).toBe("minimal");
  });
});

// ─── R4-09: Formal Construct Validity ──────────────

describe("R4-09 Formal Construct Validity", () => {
  test("expert correlation improved to 0.82", () => {
    expect(CONSTRUCT_VALIDITY_DATA.expertCorrelation).toBe(0.82);
  });

  test("test-retest reliability excellent (0.91)", () => {
    expect(CONSTRUCT_VALIDITY_DATA.testRetestReliability).toBeGreaterThan(0.9);
  });

  test("internal consistency alpha > 0.8", () => {
    expect(CONSTRUCT_VALIDITY_DATA.internalConsistency).toBeGreaterThan(0.8);
  });

  test("5 factor loadings all > 0.7", () => {
    const loadings = Object.values(CONSTRUCT_VALIDITY_DATA.factorLoadings);
    expect(loadings).toHaveLength(5);
    for (const l of loadings) expect(l).toBeGreaterThan(0.7);
  });

  test("sample size matches question count", () => {
    expect(CONSTRUCT_VALIDITY_DATA.sampleSize).toBe(235);
  });
});

// ─── R4-10: Evaluation Data DPIA ───────────────────

describe("R4-10 Evaluation Data DPIA", () => {
  test("DPIA assessment exists with low residual risk", () => {
    const dpia = getDpiaAssessment();
    expect(dpia.residualRiskLevel).toBe("low");
    expect(dpia.dpoApproval).toBe(true);
  });

  test("4 data flows documented", () => {
    expect(AMC_EVALUATION_DPIA.dataFlows).toHaveLength(4);
  });

  test("cross-border flows have transfer mechanisms", () => {
    const crossBorder = AMC_EVALUATION_DPIA.dataFlows.filter((f) => f.crossBorder);
    expect(crossBorder.length).toBeGreaterThanOrEqual(2);
    for (const f of crossBorder) expect(f.transferMechanism).toBeTruthy();
  });

  test("4 risks identified and mitigated", () => {
    expect(AMC_EVALUATION_DPIA.risks).toHaveLength(4);
    expect(AMC_EVALUATION_DPIA.mitigations).toHaveLength(4);
  });

  test("all mitigations implemented", () => {
    for (const m of AMC_EVALUATION_DPIA.mitigations) {
      expect(m.implemented).toBe(true);
    }
  });

  test("next review date is future", () => {
    expect(getDpiaAssessment().nextReviewDate).toBeGreaterThan(Date.now());
  });
});
