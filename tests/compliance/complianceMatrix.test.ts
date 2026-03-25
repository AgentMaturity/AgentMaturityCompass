import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import {
  generateCoverageMatrix,
  renderCoverageMatrixMarkdown,
  renderCoverageHeatmap,
  type ComplianceCoverageMatrix,
} from "../../src/compliance/complianceMatrix.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-compliance-matrix-"));
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

describe("generateCoverageMatrix", () => {
  test("generates matrix with default frameworks", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({
      workspace: ws,
      window: "14d",
    });

    expect(matrix.agentId).toBe("default");
    expect(matrix.frameworks.length).toBe(4);
    expect(matrix.overallScore).toBeTypeOf("number");
    expect(matrix.ts).toBeGreaterThan(0);

    const fwNames = matrix.frameworks.map((f) => f.framework);
    expect(fwNames).toContain("EU_AI_ACT");
    expect(fwNames).toContain("NIST_AI_RMF");
    expect(fwNames).toContain("ISO_42001");
    expect(fwNames).toContain("SOC2");
  });

  test("generates matrix with specific frameworks", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({
      workspace: ws,
      window: "14d",
      frameworks: ["EU_AI_ACT"],
    });

    expect(matrix.frameworks.length).toBe(1);
    expect(matrix.frameworks[0]!.framework).toBe("EU_AI_ACT");
  });

  test("includes gap analysis sorted by severity", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({
      workspace: ws,
      window: "14d",
    });

    // Gaps should be sorted: critical first
    for (let i = 1; i < matrix.gaps.length; i++) {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const prev = order[matrix.gaps[i - 1]!.severity] ?? 3;
      const curr = order[matrix.gaps[i]!.severity] ?? 3;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });
});

describe("renderCoverageMatrixMarkdown", () => {
  test("renders markdown with framework table", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d" });
    const md = renderCoverageMatrixMarkdown(matrix);

    expect(md).toContain("# AMC Compliance Coverage Matrix");
    expect(md).toContain("Framework Coverage");
    expect(md).toContain("| Framework");
    expect(md).toContain(matrix.agentId);
  });

  test("includes gap analysis table when gaps exist", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d" });
    const md = renderCoverageMatrixMarkdown(matrix);

    if (matrix.gaps.length > 0) {
      expect(md).toContain("Gap Analysis");
      expect(md).toContain("| Severity");
    }
  });
});

describe("renderCoverageHeatmap", () => {
  test("renders terminal heatmap", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d" });
    const heatmap = renderCoverageHeatmap(matrix);

    expect(heatmap).toContain("AMC Compliance Coverage Heatmap");
    expect(heatmap).toContain("Overall:");
    expect(heatmap).toContain("Legend:");
  });

  test("shows framework names", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d" });
    const heatmap = renderCoverageHeatmap(matrix);

    expect(heatmap).toContain("EU_AI_ACT");
  });
});
