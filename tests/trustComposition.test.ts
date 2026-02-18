import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import {
  initTrustComposition,
  loadTrustCompositionConfig,
  addDelegationEdge,
  removeDelegationEdge,
  listDelegationEdges,
  detectCycles,
  computeTrustComposition,
  saveTrustCompositionReport,
  renderTrustCompositionMarkdown,
  type DelegationEdge,
  type TrustCompositionReport,
} from "../src/fleet/trustComposition.js";
import type { DiagnosticReport, TrustLabel } from "../src/types.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-trust-comp-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function setupFleetWithAgents(workspace: string, agentIds: string[]): void {
  initFleet(workspace, { orgName: "Test Fleet" });
  for (const id of agentIds) {
    const config = buildAgentConfig({
      agentId: id,
      agentName: `Agent ${id}`,
      role: "assistant",
      domain: "general",
      primaryTasks: ["support"],
      stakeholders: ["owner"],
      riskTier: "med",
      templateId: "openai",
      baseUrl: "https://api.openai.com",
      routePrefix: "/openai",
      auth: { type: "bearer_env", env: "OPENAI_API_KEY" },
    });
    scaffoldAgent(workspace, config);
  }
}

function makeMockReport(agentId: string, integrityIndex: number, overallAvg: number): DiagnosticReport {
  const questionScores = Array.from({ length: 48 }, (_, i) => ({
    questionId: `AMC-${Math.floor(i / 10 + 1)}.${(i % 10) + 1}`,
    claimedLevel: Math.round(overallAvg),
    supportedMaxLevel: Math.round(overallAvg),
    finalLevel: Math.round(overallAvg),
    confidence: 0.8,
    evidenceEventIds: [],
    flags: [],
    narrative: "mock",
  }));

  return {
    agentId,
    runId: `run_${agentId}`,
    ts: Date.now(),
    windowStartTs: Date.now() - 30 * 86400000,
    windowEndTs: Date.now(),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex,
    trustLabel: (integrityIndex >= 0.7 ? "HIGH TRUST" : integrityIndex >= 0.4 ? "LOW TRUST" : "UNRELIABLE — DO NOT USE FOR CLAIMS") as TrustLabel,
    targetProfileId: null,
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: overallAvg, confidenceWeightedFinalLevel: overallAvg },
      { layerName: "Leadership & Autonomy", avgFinalLevel: overallAvg, confidenceWeightedFinalLevel: overallAvg },
      { layerName: "Culture & Alignment", avgFinalLevel: overallAvg, confidenceWeightedFinalLevel: overallAvg },
      { layerName: "Resilience", avgFinalLevel: overallAvg, confidenceWeightedFinalLevel: overallAvg },
      { layerName: "Skills", avgFinalLevel: overallAvg, confidenceWeightedFinalLevel: overallAvg },
    ],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.8,
    evidenceTrustCoverage: { observed: 0.6, attested: 0.2, selfReported: 0.2 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "mock",
    reportJsonSha256: "mock",
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Trust Composition Config", () => {
  test("init creates default config", () => {
    const ws = newWorkspace();
    const config = initTrustComposition(ws);
    expect(config.schemaVersion).toBe(1);
    expect(config.defaultInheritanceMode).toBe("strict");
    expect(config.edges).toHaveLength(0);
  });

  test("load returns initialized config", () => {
    const ws = newWorkspace();
    initTrustComposition(ws);
    const loaded = loadTrustCompositionConfig(ws);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.defaultInheritanceMode).toBe("strict");
  });

  test("load auto-initializes if missing", () => {
    const ws = newWorkspace();
    const loaded = loadTrustCompositionConfig(ws);
    expect(loaded.schemaVersion).toBe(1);
  });
});

describe("Delegation Edges", () => {
  test("add and list edges", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["orchestrator", "worker-a", "worker-b"]);

    addDelegationEdge(ws, {
      fromAgentId: "orchestrator",
      toAgentId: "worker-a",
      purpose: "data processing",
    });
    addDelegationEdge(ws, {
      fromAgentId: "orchestrator",
      toAgentId: "worker-b",
      purpose: "code generation",
    });

    const edges = listDelegationEdges(ws);
    expect(edges).toHaveLength(2);
    expect(edges[0]!.fromAgentId).toBe("orchestrator");
    expect(edges[0]!.toAgentId).toBe("worker-a");
    expect(edges[1]!.toAgentId).toBe("worker-b");
  });

  test("reject self-delegation", () => {
    const ws = newWorkspace();
    expect(() =>
      addDelegationEdge(ws, {
        fromAgentId: "agent-a",
        toAgentId: "agent-a",
        purpose: "test",
      }),
    ).toThrow("Self-delegation");
  });

  test("reject duplicate edge", () => {
    const ws = newWorkspace();
    addDelegationEdge(ws, {
      fromAgentId: "a",
      toAgentId: "b",
      purpose: "test",
    });
    expect(() =>
      addDelegationEdge(ws, {
        fromAgentId: "a",
        toAgentId: "b",
        purpose: "duplicate",
      }),
    ).toThrow("already exists");
  });

  test("reject cycles", () => {
    const ws = newWorkspace();
    addDelegationEdge(ws, { fromAgentId: "a", toAgentId: "b", purpose: "test" });
    addDelegationEdge(ws, { fromAgentId: "b", toAgentId: "c", purpose: "test" });
    expect(() =>
      addDelegationEdge(ws, { fromAgentId: "c", toAgentId: "a", purpose: "test" }),
    ).toThrow("cycle");
  });

  test("remove edge", () => {
    const ws = newWorkspace();
    const edge = addDelegationEdge(ws, {
      fromAgentId: "a",
      toAgentId: "b",
      purpose: "test",
    });
    expect(listDelegationEdges(ws)).toHaveLength(1);
    removeDelegationEdge(ws, edge.id);
    expect(listDelegationEdges(ws)).toHaveLength(0);
  });

  test("remove nonexistent edge throws", () => {
    const ws = newWorkspace();
    expect(() => removeDelegationEdge(ws, "fake-id")).toThrow("not found");
  });
});

describe("Cycle Detection", () => {
  test("no cycles in empty graph", () => {
    expect(detectCycles([])).toHaveLength(0);
  });

  test("no cycles in linear DAG", () => {
    const edges: DelegationEdge[] = [
      { id: "e1", fromAgentId: "a", toAgentId: "b", handoffId: "h1", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
      { id: "e2", fromAgentId: "b", toAgentId: "c", handoffId: "h2", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
    ];
    expect(detectCycles(edges)).toHaveLength(0);
  });

  test("detects simple cycle", () => {
    const edges: DelegationEdge[] = [
      { id: "e1", fromAgentId: "a", toAgentId: "b", handoffId: "h1", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
      { id: "e2", fromAgentId: "b", toAgentId: "a", handoffId: "h2", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
    ];
    const cycles = detectCycles(edges);
    expect(cycles.length).toBeGreaterThan(0);
  });

  test("detects 3-node cycle", () => {
    const edges: DelegationEdge[] = [
      { id: "e1", fromAgentId: "a", toAgentId: "b", handoffId: "h1", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
      { id: "e2", fromAgentId: "b", toAgentId: "c", handoffId: "h2", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
      { id: "e3", fromAgentId: "c", toAgentId: "a", handoffId: "h3", purpose: "t", riskTier: "med", inheritanceMode: "strict", weight: 1, createdTs: 0 },
    ];
    const cycles = detectCycles(edges);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe("Trust Composition Computation", () => {
  test("leaf agent has composite = own", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["solo"]);
    initTrustComposition(ws);

    const reports = [makeMockReport("solo", 0.85, 3.5)];
    const result = computeTrustComposition(ws, reports);

    expect(result.agentResults).toHaveLength(1);
    const solo = result.agentResults[0]!;
    expect(solo.compositeIntegrityIndex).toBe(solo.ownIntegrityIndex);
    expect(solo.boundedBy).toBeNull();
    expect(solo.dependencies).toHaveLength(0);
  });

  test("strict mode: composite bounded by weakest worker", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["orchestrator", "worker-strong", "worker-weak"]);
    addDelegationEdge(ws, { fromAgentId: "orchestrator", toAgentId: "worker-strong", purpose: "test" });
    addDelegationEdge(ws, { fromAgentId: "orchestrator", toAgentId: "worker-weak", purpose: "test" });

    const reports = [
      makeMockReport("orchestrator", 0.9, 4.0),
      makeMockReport("worker-strong", 0.85, 3.5),
      makeMockReport("worker-weak", 0.3, 1.5),
    ];

    const result = computeTrustComposition(ws, reports);
    const orch = result.agentResults.find((r) => r.agentId === "orchestrator")!;

    expect(orch.compositeIntegrityIndex).toBe(0.3);
    expect(orch.boundedBy).toBe("worker-weak");
    expect(orch.compositeTrustLabel).toBe("UNRELIABLE — DO NOT USE FOR CLAIMS");
  });

  test("weighted mode: weighted average", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["orchestrator", "worker"]);
    addDelegationEdge(ws, {
      fromAgentId: "orchestrator",
      toAgentId: "worker",
      purpose: "test",
      inheritanceMode: "weighted",
      weight: 0.5,
    });

    const reports = [
      makeMockReport("orchestrator", 0.9, 4.0),
      makeMockReport("worker", 0.5, 2.5),
    ];

    const result = computeTrustComposition(ws, reports);
    const orch = result.agentResults.find((r) => r.agentId === "orchestrator")!;

    // weighted: (0.9 * 1 + 0.5 * 0.5) / (1 + 0.5) = 1.15 / 1.5 ≈ 0.767
    expect(orch.compositeIntegrityIndex).toBeCloseTo(0.767, 2);
  });

  test("no-inherit mode: composite equals own", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["orchestrator", "worker"]);
    addDelegationEdge(ws, {
      fromAgentId: "orchestrator",
      toAgentId: "worker",
      purpose: "test",
      inheritanceMode: "no-inherit",
    });

    const reports = [
      makeMockReport("orchestrator", 0.9, 4.0),
      makeMockReport("worker", 0.2, 1.0),
    ];

    const result = computeTrustComposition(ws, reports);
    const orch = result.agentResults.find((r) => r.agentId === "orchestrator")!;

    expect(orch.compositeIntegrityIndex).toBe(0.9);
    expect(orch.boundedBy).toBeNull();
  });

  test("blast radius computation", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["a", "b", "c"]);
    addDelegationEdge(ws, { fromAgentId: "a", toAgentId: "b", purpose: "test" });
    addDelegationEdge(ws, { fromAgentId: "b", toAgentId: "c", purpose: "test" });

    const reports = [
      makeMockReport("a", 0.8, 3.0),
      makeMockReport("b", 0.7, 3.0),
      makeMockReport("c", 0.6, 2.5),
    ];

    const result = computeTrustComposition(ws, reports);

    // c is depended on by b and a → blast radius = 2/2 = 1.0
    const cResult = result.agentResults.find((r) => r.agentId === "c")!;
    expect(cResult.blastRadius).toBe(1.0);

    // a depends on others, nobody depends on a → blast radius = 0
    const aResult = result.agentResults.find((r) => r.agentId === "a")!;
    expect(aResult.blastRadius).toBe(0);
  });

  test("cross-agent contradiction detection", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["agent-a", "agent-b"]);
    initTrustComposition(ws);

    const reportA = makeMockReport("agent-a", 0.8, 4.0);
    const reportB = makeMockReport("agent-b", 0.7, 1.0); // very different scores

    const result = computeTrustComposition(ws, [reportA, reportB]);

    // Should detect contradictions where delta >= 2
    expect(result.contradictions.length).toBeGreaterThan(0);
    for (const c of result.contradictions) {
      expect(c.delta).toBeGreaterThanOrEqual(2);
    }
  });

  test("fleet composite score is average of composites", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["a", "b"]);
    initTrustComposition(ws);

    const reports = [
      makeMockReport("a", 0.8, 3.0),
      makeMockReport("b", 0.6, 2.5),
    ];

    const result = computeTrustComposition(ws, reports);
    expect(result.fleetCompositeScore).toBeCloseTo(0.7, 2);
  });
});

describe("Report Persistence & Rendering", () => {
  test("save and render report", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["a", "b"]);
    addDelegationEdge(ws, { fromAgentId: "a", toAgentId: "b", purpose: "test" });

    const reports = [
      makeMockReport("a", 0.8, 3.0),
      makeMockReport("b", 0.6, 2.5),
    ];

    const trustReport = computeTrustComposition(ws, reports);
    const path = saveTrustCompositionReport(ws, trustReport);
    expect(path).toContain("trust-composition-");

    const markdown = renderTrustCompositionMarkdown(trustReport);
    expect(markdown).toContain("Trust Composition Report");
    expect(markdown).toContain("Per-Agent Composite Trust");
    expect(markdown).toContain("Delegation Dependencies");
  });

  test("report has valid signature fields", () => {
    const ws = newWorkspace();
    setupFleetWithAgents(ws, ["solo"]);
    initTrustComposition(ws);

    const reports = [makeMockReport("solo", 0.85, 3.5)];
    const result = computeTrustComposition(ws, reports);

    expect(result.reportJsonSha256).toHaveLength(64);
    expect(result.reportSealSig.length).toBeGreaterThan(0);
    expect(result.dagValid).toBe(true);
    expect(result.dagCycles).toHaveLength(0);
  });
});
