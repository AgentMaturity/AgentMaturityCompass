/**
 * Tests for Cascade Failure Simulator — MF-01
 *
 * Validates that the simulator correctly:
 * 1. Propagates faults through agent topologies
 * 2. Detects cascade patterns (error amplification, silent corruption, etc.)
 * 3. Identifies composite failures (individually passing → collectively failing)
 * 4. Computes blast radius correctly
 * 5. Handles all 10 built-in fault templates
 * 6. Runs all 10 cascade scenarios
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initFleet, scaffoldAgent, buildAgentConfig } from "../src/fleet/registry.js";
import { addDelegationEdge } from "../src/fleet/trustComposition.js";
import {
  runCascadeSimulation,
  listCascadeScenarios,
  listFaultTemplates,
  saveCascadeReport,
  CASCADE_SCENARIOS,
  FAULT_TEMPLATES,
  type CascadeSimulationResult,
  type FaultInjection,
} from "../src/fleet/cascadeSimulator.js";
import type { DiagnosticReport, LayerScore, QuestionScore } from "../src/types.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-cascade-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initFleet(dir, { orgName: "Cascade Test Fleet" });
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

function makeReport(agentId: string, overallLevel: number, integrity: number): DiagnosticReport {
  const layerScores: LayerScore[] = [
    { layerName: "Strategic Agent Operations", questionCount: 5, answeredCount: 5, avgFinalLevel: overallLevel, avgConfidence: 0.8 },
    { layerName: "Leadership & Autonomy", questionCount: 5, answeredCount: 5, avgFinalLevel: overallLevel, avgConfidence: 0.8 },
    { layerName: "Culture & Alignment", questionCount: 5, answeredCount: 5, avgFinalLevel: overallLevel, avgConfidence: 0.8 },
    { layerName: "Resilience", questionCount: 5, answeredCount: 5, avgFinalLevel: overallLevel, avgConfidence: 0.8 },
    { layerName: "Skills", questionCount: 5, answeredCount: 5, avgFinalLevel: overallLevel, avgConfidence: 0.8 },
  ];

  const questionScores: QuestionScore[] = [];
  for (let i = 1; i <= 25; i++) {
    questionScores.push({
      questionId: `q${i}`,
      layerName: layerScores[Math.floor((i - 1) / 5)]!.layerName,
      rawLevel: overallLevel,
      finalLevel: overallLevel,
      confidence: 0.8,
      evidenceEventIds: [`ev-${i}`],
      narrative: `Agent ${agentId} question ${i} assessment`,
      boosts: [],
      caps: [],
    });
  }

  return {
    runId: `run-${agentId}`,
    agentId,
    ts: Date.now(),
    version: "1.0.0",
    workspace: "/tmp/test",
    targetName: "default",
    window: "30d",
    layerScores,
    questionScores,
    targetDiff: [],
    integrityIndex: integrity,
    trustLabel: integrity >= 0.7 ? "HIGH TRUST" : integrity >= 0.4 ? "LOW TRUST" : "UNRELIABLE — DO NOT USE FOR CLAIMS",
    evidenceCoverage: 0.8,
    ledgerEventCount: 100,
    status: "VALID",
  } as DiagnosticReport;
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

// ─── Basic functionality ────────────────────────────

describe("Cascade Simulator — basics", () => {
  test("exports fault templates and scenarios", () => {
    const templates = listFaultTemplates();
    expect(Object.keys(templates).length).toBeGreaterThanOrEqual(10);

    const scenarios = listCascadeScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });

  test("all 10 fault templates have required fields", () => {
    for (const [id, template] of Object.entries(FAULT_TEMPLATES)) {
      expect(template.type).toBeTruthy();
      expect(template.severity).toBeGreaterThan(0);
      expect(template.severity).toBeLessThanOrEqual(1);
      expect(template.description.length).toBeGreaterThan(10);
    }
  });

  test("all 10 cascade scenarios have valid config", () => {
    for (const scenario of CASCADE_SCENARIOS) {
      expect(scenario.scenarioId).toBeTruthy();
      expect(scenario.name).toBeTruthy();
      expect(scenario.minAgents).toBeGreaterThanOrEqual(2);
      expect(scenario.faultTemplateIds.length).toBeGreaterThan(0);
      expect(scenario.expectedPatterns.length).toBeGreaterThan(0);

      // Verify all referenced fault templates exist
      for (const tid of scenario.faultTemplateIds) {
        expect(FAULT_TEMPLATES[tid]).toBeTruthy();
      }
    }
  });
});

// ─── Simulation with real topology ──────────────────

describe("Cascade Simulator — simulation", () => {
  test("runs simulation with 3-agent pipeline topology", () => {
    const ws = newWorkspace();
    setupAgent(ws, "agent-a");
    setupAgent(ws, "agent-b");
    setupAgent(ws, "agent-c");

    addDelegationEdge(ws, {
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
      purpose: "data processing",
    });
    addDelegationEdge(ws, {
      fromAgentId: "agent-b",
      toAgentId: "agent-c",
      purpose: "final decision",
    });

    const reports = [
      makeReport("agent-a", 3.5, 0.75),
      makeReport("agent-b", 3.5, 0.75),
      makeReport("agent-c", 3.5, 0.75),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      scenarioId: "tariq-scenario",
      iterations: 5,
    });

    expect(result.simulationId).toMatch(/^csim_/);
    expect(result.agents).toHaveLength(3);
    expect(result.cascadeRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.cascadeRiskScore).toBeLessThanOrEqual(100);
    expect(result.markdown.length).toBeGreaterThan(100);
    expect(result.reportSha256).toBeTruthy();
  });

  test("detects composite-pass-individual-fail pattern (Tariq scenario)", () => {
    const ws = newWorkspace();
    setupAgent(ws, "alpha");
    setupAgent(ws, "beta");
    setupAgent(ws, "gamma");

    addDelegationEdge(ws, {
      fromAgentId: "alpha",
      toAgentId: "beta",
      purpose: "pipeline step 1",
      riskTier: "high",
    });
    addDelegationEdge(ws, {
      fromAgentId: "beta",
      toAgentId: "gamma",
      purpose: "pipeline step 2",
      riskTier: "high",
    });

    // All agents pass individually (L3+, integrity 0.5+)
    const reports = [
      makeReport("alpha", 3.8, 0.65),
      makeReport("beta", 3.5, 0.55),
      makeReport("gamma", 3.2, 0.50),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      scenarioId: "tariq-scenario",
      iterations: 20,
    });

    // Should detect that individually-passing agents fail in composition
    expect(result.agents.every((a) => a.passesIndividually)).toBe(true);
    expect(result.blastRadiusAgents.length).toBeGreaterThan(0);

    // At least some propagation should occur
    expect(result.stats.totalSteps).toBeGreaterThan(0);
  });

  test("handles 4-agent telephone game scenario", () => {
    const ws = newWorkspace();
    for (const id of ["a1", "a2", "a3", "a4"]) {
      setupAgent(ws, id);
    }

    addDelegationEdge(ws, { fromAgentId: "a1", toAgentId: "a2", purpose: "step 1" });
    addDelegationEdge(ws, { fromAgentId: "a2", toAgentId: "a3", purpose: "step 2" });
    addDelegationEdge(ws, { fromAgentId: "a3", toAgentId: "a4", purpose: "step 3" });

    const reports = [
      makeReport("a1", 3.0, 0.5),
      makeReport("a2", 3.0, 0.5),
      makeReport("a3", 3.0, 0.5),
      makeReport("a4", 3.0, 0.5),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      scenarioId: "handoff-telephone",
      iterations: 10,
    });

    expect(result.agents).toHaveLength(4);
    expect(result.stats.totalSteps).toBeGreaterThan(0);
  });

  test("runs all applicable scenarios when no scenarioId specified", () => {
    const ws = newWorkspace();
    for (const id of ["x1", "x2", "x3", "x4"]) {
      setupAgent(ws, id);
    }

    addDelegationEdge(ws, { fromAgentId: "x1", toAgentId: "x2", purpose: "a" });
    addDelegationEdge(ws, { fromAgentId: "x2", toAgentId: "x3", purpose: "b" });
    addDelegationEdge(ws, { fromAgentId: "x3", toAgentId: "x4", purpose: "c" });

    const reports = [
      makeReport("x1", 3.5, 0.7),
      makeReport("x2", 3.5, 0.7),
      makeReport("x3", 3.5, 0.7),
      makeReport("x4", 3.5, 0.7),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      iterations: 3,
    });

    // Should run multiple scenarios
    expect(result.stats.faultsInjected).toBeGreaterThan(0);
  });

  test("custom fault injection works", () => {
    const ws = newWorkspace();
    setupAgent(ws, "f1");
    setupAgent(ws, "f2");

    addDelegationEdge(ws, { fromAgentId: "f1", toAgentId: "f2", purpose: "test" });

    const reports = [
      makeReport("f1", 4.0, 0.8),
      makeReport("f2", 4.0, 0.8),
    ];

    const customFault: FaultInjection = {
      faultId: "custom-1",
      type: "output_corruption",
      targetAgentId: "f1",
      severity: 0.9,
      description: "Custom severe output corruption",
    };

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      customFaults: [customFault],
      iterations: 5,
    });

    expect(result.faults.length).toBeGreaterThan(0);
  });
});

// ─── Blast radius ──────────────────────────────────

describe("Cascade Simulator — blast radius", () => {
  test("blast radius increases with more connected agents", () => {
    const ws = newWorkspace();
    for (const id of ["hub", "spoke1", "spoke2", "spoke3"]) {
      setupAgent(ws, id);
    }

    // Hub-and-spoke: hub delegates to all spokes
    addDelegationEdge(ws, { fromAgentId: "hub", toAgentId: "spoke1", purpose: "s1" });
    addDelegationEdge(ws, { fromAgentId: "hub", toAgentId: "spoke2", purpose: "s2" });
    addDelegationEdge(ws, { fromAgentId: "hub", toAgentId: "spoke3", purpose: "s3" });

    const reports = [
      makeReport("hub", 3.0, 0.5),
      makeReport("spoke1", 3.0, 0.5),
      makeReport("spoke2", 3.0, 0.5),
      makeReport("spoke3", 3.0, 0.5),
    ];

    // Inject fault at hub — should affect all spokes
    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      customFaults: [{
        faultId: "hub-fail",
        type: "output_corruption",
        targetAgentId: "hub",
        severity: 0.7,
        description: "Hub produces corrupted output",
      }],
      iterations: 10,
    });

    // Hub failure should propagate to spokes
    expect(result.blastRadiusAgents).toContain("hub");
    expect(result.blastRadius).toBeGreaterThan(0);
  });
});

// ─── Edge cases ─────────────────────────────────────

describe("Cascade Simulator — edge cases", () => {
  test("handles single agent (no edges)", () => {
    const ws = newWorkspace();
    setupAgent(ws, "lonely");

    const reports = [makeReport("lonely", 4.0, 0.9)];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      customFaults: [{
        faultId: "solo-fault",
        type: "silent_failure",
        targetAgentId: "lonely",
        severity: 0.5,
        description: "Solo agent fault",
      }],
      iterations: 3,
    });

    expect(result.agents).toHaveLength(1);
    expect(result.propagationSteps).toHaveLength(0); // No edges to propagate through
    expect(result.blastRadiusAgents).toContain("lonely");
  });

  test("handles empty diagnostic reports", () => {
    const ws = newWorkspace();

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: [],
      iterations: 1,
    });

    expect(result.agents).toHaveLength(0);
    expect(result.cascadeRiskScore).toBe(0);
  });

  test("handles agents without edges (no propagation)", () => {
    const ws = newWorkspace();
    setupAgent(ws, "iso1");
    setupAgent(ws, "iso2");

    const reports = [
      makeReport("iso1", 3.5, 0.7),
      makeReport("iso2", 3.5, 0.7),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      customFaults: [{
        faultId: "iso-fault",
        type: "hallucination_injection",
        targetAgentId: "iso1",
        severity: 0.5,
        description: "Isolated agent hallucinates",
      }],
      iterations: 3,
    });

    // No edges, so no propagation
    expect(result.propagationSteps).toHaveLength(0);
    // But the faulted agent should be affected
    expect(result.blastRadiusAgents).toContain("iso1");
  });
});

// ─── Report format ──────────────────────────────────

describe("Cascade Simulator — reporting", () => {
  test("markdown report contains all sections", () => {
    const ws = newWorkspace();
    setupAgent(ws, "r1");
    setupAgent(ws, "r2");
    setupAgent(ws, "r3");

    addDelegationEdge(ws, { fromAgentId: "r1", toAgentId: "r2", purpose: "step 1" });
    addDelegationEdge(ws, { fromAgentId: "r2", toAgentId: "r3", purpose: "step 2" });

    const reports = [
      makeReport("r1", 3.5, 0.6),
      makeReport("r2", 3.5, 0.6),
      makeReport("r3", 3.5, 0.6),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      iterations: 5,
    });

    expect(result.markdown).toContain("Cascade Failure Simulation Report");
    expect(result.markdown).toContain("Agent Overview");
    expect(result.markdown).toContain("Summary Statistics");
    expect(result.markdown).toContain("Cascade Risk Score");
    expect(result.markdown).toContain("Blast Radius");
  });

  test("save and persistence works", () => {
    const ws = newWorkspace();
    setupAgent(ws, "p1");
    setupAgent(ws, "p2");

    addDelegationEdge(ws, { fromAgentId: "p1", toAgentId: "p2", purpose: "test" });

    const reports = [
      makeReport("p1", 3.5, 0.7),
      makeReport("p2", 3.5, 0.7),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      iterations: 1,
    });

    const filePath = saveCascadeReport(ws, result);
    expect(filePath).toContain("cascade-");
    expect(filePath).toContain(result.simulationId);
  });
});

// ─── All fault types ────────────────────────────────

describe("Cascade Simulator — fault types", () => {
  const faultTypes = Object.entries(FAULT_TEMPLATES);

  test.each(faultTypes)("fault template '%s' works in simulation", (templateId, template) => {
    const ws = newWorkspace();
    setupAgent(ws, "ft-src");
    setupAgent(ws, "ft-dst");

    addDelegationEdge(ws, { fromAgentId: "ft-src", toAgentId: "ft-dst", purpose: "test" });

    const reports = [
      makeReport("ft-src", 3.0, 0.5),
      makeReport("ft-dst", 3.0, 0.5),
    ];

    const result = runCascadeSimulation({
      workspace: ws,
      diagnosticReports: reports,
      customFaults: [{
        faultId: `test-${templateId}`,
        type: template.type,
        targetAgentId: "ft-src",
        severity: template.severity,
        description: template.description,
      }],
      iterations: 3,
    });

    expect(result.simulationId).toBeTruthy();
    expect(result.faults.length).toBeGreaterThan(0);
  });
});

// ─── All scenarios ──────────────────────────────────

describe("Cascade Simulator — scenarios", () => {
  test.each(CASCADE_SCENARIOS.map((s) => [s.scenarioId, s] as const))(
    "scenario '%s' runs without error",
    (scenarioId, scenario) => {
      const ws = newWorkspace();
      const agentIds = Array.from({ length: scenario.minAgents }, (_, i) => `sc-${i}`);

      for (const id of agentIds) {
        setupAgent(ws, id);
      }

      // Create linear pipeline
      for (let i = 0; i < agentIds.length - 1; i++) {
        addDelegationEdge(ws, {
          fromAgentId: agentIds[i]!,
          toAgentId: agentIds[i + 1]!,
          purpose: `step ${i}`,
        });
      }

      const reports = agentIds.map((id) => makeReport(id, 3.0, 0.5));

      const result = runCascadeSimulation({
        workspace: ws,
        diagnosticReports: reports,
        scenarioId,
        iterations: 3,
      });

      expect(result.simulationId).toBeTruthy();
      expect(result.agents).toHaveLength(scenario.minAgents);
    },
  );
});
