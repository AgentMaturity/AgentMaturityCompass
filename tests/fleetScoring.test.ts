import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  buildAgentConfig,
  initFleet,
  scaffoldAgent,
} from "../src/fleet/registry.js";
import { ingestEvidence } from "../src/ingest/ingest.js";
import {
  evaluateFleet,
  renderFleetScoringMarkdown,
  type FleetScoringResult,
} from "../src/fleet/fleetScoring.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-score-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function addAgent(workspace: string, id: string, name: string) {
  const config = buildAgentConfig({
    agentId: id,
    agentName: name,
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

function seedEvidence(workspace: string, agentId: string, count: number) {
  const tmpFile = join(workspace, `_ingest_${agentId}.txt`);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(`Evidence entry ${i} for ${agentId}`);
  }
  writeFileSync(tmpFile, lines.join("\n"), "utf8");
  ingestEvidence({
    workspace,
    agentId,
    inputPath: tmpFile,
    type: "generic_text",
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("Fleet Scoring", () => {
  test("evaluateFleet with single default agent", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "default", "Default");
    seedEvidence(ws, "default", 5);

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
    });

    expect(result.agentCount).toBe(1);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]!.agentId).toBe("default");
    expect(typeof result.agents[0]!.overallScore).toBe("number");
    expect(result.aggregate.fleetMeanScore).toBeGreaterThanOrEqual(0);
    expect(result.reportSha256).toHaveLength(64);
    expect(result.diagnosticReports).toHaveLength(1);
  });

  test("evaluateFleet with multiple agents detects weak links", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "alpha", "Alpha Agent");
    addAgent(ws, "bravo", "Bravo Agent");
    addAgent(ws, "charlie", "Charlie Agent");
    seedEvidence(ws, "alpha", 20);
    seedEvidence(ws, "bravo", 10);
    seedEvidence(ws, "charlie", 3);

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      agentIds: ["alpha", "bravo", "charlie"],
    });

    expect(result.agentCount).toBe(3);
    expect(result.agents).toHaveLength(3);
    expect(result.aggregate.fleetMeanScore).toBeGreaterThanOrEqual(0);
    expect(result.aggregate.fleetStdDev).toBeGreaterThanOrEqual(0);
    // At least some pair comparisons
    expect(result.pairComparisons).toHaveLength(3); // 3 choose 2
  });

  test("evaluateFleet emits progress, SLA metadata, and lifecycle refs per agent", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "alpha", "Alpha Agent");
    addAgent(ws, "bravo", "Bravo Agent");
    seedEvidence(ws, "alpha", 4);
    seedEvidence(ws, "bravo", 4);
    const events: string[] = [];

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      agentIds: ["alpha", "bravo"],
      slaMs: 120_000,
      concurrency: 2,
      onProgress: (event) => events.push(`${event.agentId}:${event.stage}`)
    });

    expect(result.failures).toEqual([]);
    expect(result.progressEvents.length).toBeGreaterThanOrEqual(8);
    expect(events).toContain("alpha:queued");
    expect(events).toContain("bravo:queued");
    expect(events).toContain("alpha:scored");
    expect(events).toContain("bravo:scored");
    for (const agent of result.agents) {
      expect(agent.firstResultMs).toBeGreaterThanOrEqual(0);
      expect(agent.slaStatus).toBe("met");
      expect(agent.lifecycleArtifactPath ? existsSync(agent.lifecycleArtifactPath) : false).toBe(true);
      expect(agent.episodePath ? existsSync(agent.episodePath) : false).toBe(true);
      expect(agent.resourceManifestId).toMatch(/^enforce-resources-/);
    }
    expect(result.fleetLifecycle?.artifactPath ? existsSync(result.fleetLifecycle.artifactPath) : false).toBe(true);
    expect(result.fleetLifecycle?.childRunCount).toBe(2);
    expect(result.fleetLifecycle?.sharedResourceManifestId).toMatch(/^enforce-resources-/);
    expect(result.progressEvents.some((event) => event.agentId === null && event.lifecycleArtifactPath === result.fleetLifecycle?.artifactPath)).toBe(true);
  });

  test("pairwise comparisons are capped by maxComparisons", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "a1", "Agent 1");
    addAgent(ws, "a2", "Agent 2");
    addAgent(ws, "a3", "Agent 3");

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      agentIds: ["a1", "a2", "a3"],
      maxComparisons: 1,
    });

    expect(result.pairComparisons).toHaveLength(1);
  });

  test("maxComparisons 0 skips comparisons", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "a1", "Agent 1");
    addAgent(ws, "a2", "Agent 2");

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      agentIds: ["a1", "a2"],
      maxComparisons: 0,
    });

    expect(result.pairComparisons).toHaveLength(0);
  });

  test("renderFleetScoringMarkdown produces valid markdown", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "default", "Default");
    seedEvidence(ws, "default", 5);

    const result = await evaluateFleet({ workspace: ws, window: "7d" });
    const md = renderFleetScoringMarkdown(result);

    expect(md).toContain("# Fleet Scoring Report");
    expect(md).toContain("Fleet Aggregate");
    expect(md).toContain("Fleet Lifecycle Evidence");
    expect(md).toContain("Per-Agent Scores");
    expect(md).toContain("default");
  });

  test("evaluateFleet writes output file when outputPath set", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "default", "Default");

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      outputPath: "fleet-scoring.json",
    });

    const { readFileSync } = await import("node:fs");
    const outPath = join(ws, ".amc", "reports", "fleet-scoring.json");
    const raw = JSON.parse(readFileSync(outPath, "utf8"));
    expect(raw.runId).toBe(result.runId);
    expect(raw.reportSha256).toHaveLength(64);
  });

  test("agent summary includes strongest and weakest questions", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "default", "Default");
    seedEvidence(ws, "default", 10);

    const result = await evaluateFleet({ workspace: ws, window: "7d" });
    const agent = result.agents[0]!;

    expect(agent.weakestQuestions.length).toBeGreaterThan(0);
    expect(agent.weakestQuestions.length).toBeLessThanOrEqual(5);
    expect(agent.strongestQuestions.length).toBeGreaterThan(0);
    expect(agent.strongestQuestions.length).toBeLessThanOrEqual(5);
    // Weakest should have lower levels than strongest
    expect(agent.weakestQuestions[0]!.level).toBeLessThanOrEqual(
      agent.strongestQuestions[0]!.level
    );
  });

  test("fleet aggregate layer averages cover all layers", async () => {
    const ws = newWorkspace();
    initFleet(ws);
    addAgent(ws, "alpha", "Alpha");
    addAgent(ws, "bravo", "Bravo");

    const result = await evaluateFleet({
      workspace: ws,
      window: "7d",
      agentIds: ["alpha", "bravo"],
    });

    const layerCount = Object.keys(result.aggregate.layerAverages).length;
    expect(layerCount).toBeGreaterThan(0);
    // Each layer should have a worst agent entry
    expect(Object.keys(result.aggregate.layerWorst).length).toBe(layerCount);
  });
});
