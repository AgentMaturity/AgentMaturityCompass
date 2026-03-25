import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import {
  runBenchmarkSuite,
  compareBenchmarks,
  renderBenchRunMarkdown,
  renderBenchCompareMarkdown,
  type BenchRunResult,
  type BenchCompareResult,
} from "../../src/benchmarks/benchRunner.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-bench-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

describe("runBenchmarkSuite", () => {
  test("returns baseline scores when no benchmarks exist", () => {
    const ws = newWorkspace();
    const result = runBenchmarkSuite({
      workspace: ws,
      agentId: "test-agent",
    });

    expect(result.agentId).toBe("test-agent");
    expect(result.ts).toBeGreaterThan(0);
    expect(result.overall0to100).toBe(50);
    expect(result.overallPercentile).toBe(50);
    expect(result.categories.length).toBe(5);

    const catNames = result.categories.map((c) => c.category);
    expect(catNames).toContain("latency");
    expect(catNames).toContain("accuracy");
    expect(catNames).toContain("safety");
    expect(catNames).toContain("cost-efficiency");
    expect(catNames).toContain("reliability");
  });

  test("all category scores are within 0-100", () => {
    const ws = newWorkspace();
    const result = runBenchmarkSuite({ workspace: ws, agentId: "test-agent" });

    for (const cat of result.categories) {
      expect(cat.score0to100).toBeGreaterThanOrEqual(0);
      expect(cat.score0to100).toBeLessThanOrEqual(100);
      expect(cat.baseline).toBeGreaterThanOrEqual(0);
      expect(cat.percentile).toBeGreaterThanOrEqual(0);
      expect(cat.percentile).toBeLessThanOrEqual(100);
      expect(cat.description).toBeTruthy();
    }
  });
});

describe("compareBenchmarks", () => {
  test("compares two agents with baseline data", () => {
    const ws = newWorkspace();
    const result = compareBenchmarks({
      workspace: ws,
      agent1: "agent-a",
      agent2: "agent-b",
    });

    expect(result.agent1).toBe("agent-a");
    expect(result.agent2).toBe("agent-b");
    expect(result.categories.length).toBe(5);
    expect(result.winner).toBeTruthy();
    expect(result.ts).toBeGreaterThan(0);

    for (const cat of result.categories) {
      expect(cat.category).toBeTruthy();
      expect(typeof cat.delta).toBe("number");
      expect(cat.winner).toBeTruthy();
    }
  });

  test("comparison with same agent results in tie", () => {
    const ws = newWorkspace();
    const result = compareBenchmarks({
      workspace: ws,
      agent1: "same-agent",
      agent2: "same-agent",
    });

    expect(result.overallDelta).toBe(0);
    expect(result.winner).toBe("tie");
    for (const cat of result.categories) {
      expect(cat.delta).toBe(0);
      expect(cat.winner).toBe("tie");
    }
  });
});

describe("renderBenchRunMarkdown", () => {
  test("renders benchmark report markdown", () => {
    const ws = newWorkspace();
    const result = runBenchmarkSuite({ workspace: ws, agentId: "test-agent" });
    const md = renderBenchRunMarkdown(result);

    expect(md).toContain("# AMC Benchmark Report");
    expect(md).toContain("test-agent");
    expect(md).toContain("Category Scores");
    expect(md).toContain("| Category |");
    expect(md).toContain("latency");
    expect(md).toContain("accuracy");
    expect(md).toContain("safety");
  });
});

describe("renderBenchCompareMarkdown", () => {
  test("renders comparison markdown", () => {
    const ws = newWorkspace();
    const result = compareBenchmarks({
      workspace: ws,
      agent1: "agent-a",
      agent2: "agent-b",
    });
    const md = renderBenchCompareMarkdown(result);

    expect(md).toContain("# AMC Benchmark Comparison");
    expect(md).toContain("agent-a");
    expect(md).toContain("agent-b");
    expect(md).toContain("Head-to-Head");
    expect(md).toContain("Winner");
  });
});
