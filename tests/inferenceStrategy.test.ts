import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { latestEnforceResourceManifestPath, loadEnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import {
  compareInferenceStrategies,
  listInferenceStrategyRuns,
  loadInferenceStrategyRun,
  rollbackInferenceStrategyRun,
  type InferenceStrategyInput
} from "../src/enforce/inferenceStrategy.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-inference-strategy-"));
  roots.push(dir);
  return dir;
}

function strategies(): InferenceStrategyInput[] {
  return [
    {
      strategyId: "cheap-safe",
      provider: "local",
      model: "small-safe",
      promptResourceVersion: "prompt-v1",
      temperature: 0.1,
      settings: { maxTokens: 512 },
      toolPolicy: "read-only",
      metrics: {
        score: 0.81,
        costUsd: 0.01,
        latencyMs: 450,
        risk: 0.08,
        confidence: 0.74
      },
      evidenceRefs: ["episode-a", "eval-a"]
    },
    {
      strategyId: "quality-expensive",
      provider: "remote",
      model: "large-reasoner",
      promptResourceVersion: "prompt-v1",
      temperature: 0.2,
      settings: { maxTokens: 2048 },
      toolPolicy: "read-only",
      metrics: {
        score: 0.9,
        costUsd: 0.18,
        latencyMs: 1500,
        risk: 0.16,
        confidence: 0.78
      },
      evidenceRefs: ["episode-b", "eval-b"]
    }
  ];
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("inference strategy comparison", () => {
  test("ranks strategies and explains score, cost, latency, and risk tradeoffs", () => {
    const ws = workspace();
    const result = compareInferenceStrategies({
      workspace: ws,
      agentId: "default",
      strategies: strategies(),
      objective: "balanced"
    });

    expect(result.run.recommendedStrategyId).toBe("cheap-safe");
    expect(result.run.strategies).toHaveLength(2);
    expect(result.run.tradeoffSummary).toContain("score");
    expect(result.run.tradeoffSummary).toContain("cost");
    expect(result.run.tradeoffSummary).toContain("latency");
    expect(result.run.tradeoffSummary).toContain("risk");
    expect(result.run.receipts.some((receipt) => receipt.receiptType === "strategy.validation" && receipt.status === "accepted")).toBe(true);
    expect(result.run.routeChange.status).toBe("not-requested");
    expect(existsSync(result.path)).toBe(true);

    const listed = listInferenceStrategyRuns({ workspace: ws, agentId: "default" });
    expect(listed[0]?.strategyRunId).toBe(result.run.strategyRunId);
    expect(loadInferenceStrategyRun({ workspace: ws, agentId: "default", selector: "latest" }).strategyRunId).toBe(result.run.strategyRunId);
  });

  test("blocks route commits without policy approval", () => {
    const ws = workspace();
    const result = compareInferenceStrategies({
      workspace: ws,
      agentId: "default",
      strategies: strategies(),
      applyRoute: true,
      policyApproval: false
    });

    expect(result.run.routeChange.status).toBe("blocked");
    expect(result.run.routeChange.liveResourceMutated).toBe(false);
    expect(result.run.receipts.some((receipt) => receipt.receiptType === "strategy.commit" && receipt.status === "blocked")).toBe(true);
    expect(existsSync(join(getAgentPaths(ws, "default").rootDir, "model-routes.json"))).toBe(false);
  });

  test("approved route commits are manifested and reversible", () => {
    const ws = workspace();
    const result = compareInferenceStrategies({
      workspace: ws,
      agentId: "default",
      strategies: strategies(),
      applyRoute: true,
      policyApproval: true
    });

    const routePath = join(getAgentPaths(ws, "default").rootDir, "model-routes.json");
    expect(result.run.routeChange.status).toBe("accepted");
    expect(result.run.routeChange.liveResourceMutated).toBe(true);
    expect(existsSync(routePath)).toBe(true);
    expect(readFileSync(routePath, "utf8")).toContain("cheap-safe");

    const manifest = loadEnforceResourceManifest(latestEnforceResourceManifestPath(ws, "default"));
    expect(manifest.resources.some((resource) => resource.path.endsWith("model-routes.json"))).toBe(true);

    const rollback = rollbackInferenceStrategyRun({
      workspace: ws,
      agentId: "default",
      selector: result.run.strategyRunId
    });
    expect(rollback.status).toBe("rolled-back");
    expect(existsSync(routePath)).toBe(false);
    expect(existsSync(rollback.receiptPath)).toBe(true);
  });

  test("requires at least two strategies and evidence on the recommendation", () => {
    const ws = workspace();
    expect(() => compareInferenceStrategies({ workspace: ws, strategies: [strategies()[0]!] })).toThrow(/at least two/i);
    expect(() =>
      compareInferenceStrategies({
        workspace: ws,
        strategies: [
          { ...strategies()[0]!, evidenceRefs: [] },
          { ...strategies()[1]!, evidenceRefs: [] }
        ]
      })
    ).toThrow(/evidence/i);
  });
});
