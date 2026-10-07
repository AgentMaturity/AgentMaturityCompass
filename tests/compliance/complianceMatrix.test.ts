import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initComplianceMaps } from "../../src/compliance/complianceEngine.js";
import type { ComplianceEvidenceRequirement, ComplianceMapsFile } from "../../src/compliance/mappingSchema.js";
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
    // P0-17: a fresh workspace has no control-bound evidence, so nothing is scored (was a number).
    expect(matrix.overallScore).toBeNull();
    expect(matrix.gaps).toEqual([]);
    const total = matrix.frameworks.reduce((sum, fw) => sum + fw.total, 0);
    expect(matrix.notEvaluated.length).toBe(total);
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

describe("gaps and not-evaluated categories (P0-17)", () => {
  const NO_AUDIT: ComplianceEvidenceRequirement = { type: "requires_no_audit", auditTypesDenylist: ["DENIED_SIGNAL"] };
  const EVENT: ComplianceEvidenceRequirement = { type: "requires_evidence_event", eventTypes: ["audit"], minObservedRatio: 0 };
  const PACK: ComplianceEvidenceRequirement = { type: "requires_assurance_pack", packId: "toolGovernance", minScore: 50, maxSucceeded: 0 };
  const mapping = (id: string, framework: string, evidenceRequirements: ComplianceEvidenceRequirement[]) =>
    ({ id, framework, category: id, description: id, evidenceRequirements, related: { questions: [], packs: [], configs: [] } });
  const maps = {
    complianceMaps: {
      version: 1,
      mappings: [
        mapping("fx_ok", "SOC2", [EVENT]),
        mapping("fx_partial", "SOC2", [EVENT, NO_AUDIT]),
        mapping("fx_missing", "SOC2", [NO_AUDIT]),
        mapping("fx_none", "SOC2", [PACK]),
        mapping("fx_eu_missing", "EU_AI_ACT", [NO_AUDIT])
      ]
    }
  } as ComplianceMapsFile;

  function audit(ws: string, auditType: string, controlIds: string[]): void {
    const ledger = openLedger(ws);
    try {
      ledger.startSession({ sessionId: `s-${auditType}`, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
      ledger.appendEvidence({
        sessionId: `s-${auditType}`, runtime: "unknown", eventType: "audit", payload: JSON.stringify({ auditType }),
        payloadExt: "json", inline: true, meta: { trustTier: "OBSERVED", agentId: "default", controlIds }
      });
    } finally {
      ledger.close();
    }
  }

  test("failed categories are gaps; not-evaluated categories are listed apart and earn nothing", () => {
    const ws = newWorkspace();
    initComplianceMaps(ws, maps);
    audit(ws, "FIXTURE_SIGNAL", ["fx_ok", "fx_partial"]);
    audit(ws, "DENIED_SIGNAL", []);
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d", frameworks: ["SOC2", "EU_AI_ACT"] });

    // P1-11: a failed requirement fails the category (no PARTIAL), and sufficient evidence without an applicability
    // decision (fx_ok) is not evaluated, so nothing passes and every evaluated category scores 0.
    expect(matrix.gaps.map((gap) => [gap.category, gap.status, gap.severity])).toEqual([
      ["fx_eu_missing", "MISSING", "critical"],
      ["fx_partial", "MISSING", "high"],
      ["fx_missing", "MISSING", "high"]
    ]);
    expect(matrix.notEvaluated.map((row) => row.category)).toEqual(["fx_ok", "fx_none"]);
    expect(matrix.frameworks.map((fw) => fw.score)).toEqual([0, 0]);
    expect(matrix.overallScore).toBe(0);
    const ok = matrix.frameworks[0]?.categories.find((row) => row.id === "fx_ok");
    expect({ evidence: ok?.dimensions.evidence, applicability: ok?.dimensions.applicability.state, kind: ok?.claimKind })
      .toEqual({ evidence: "sufficient", applicability: "unresolved", kind: "observed" });

    const md = renderCoverageMatrixMarkdown(matrix);
    expect(md).toContain("## Gap Analysis");
    expect(md).toContain("## Not Evaluated");
    expect(md).toContain("| SOC 2");
    expect(md).toContain("## Framework Claims");
    expect(md).toContain("**Applicability:** unresolved");
    const heatmap = renderCoverageHeatmap(matrix);
    for (const line of ["? fx_ok", "░ fx_partial", "░ fx_missing", "? fx_none", "Overall: 0.0%"]) {
      expect(heatmap).toContain(line);
    }
    expect(heatmap).not.toContain("▓");
  });

  test("sufficient evidence without an applicability decision scores nothing (P1-11)", () => {
    const ws = newWorkspace();
    initComplianceMaps(ws, {
      complianceMaps: { version: 1, mappings: [mapping("fx_ok", "SOC2", [EVENT]), mapping("fx_eu_none", "EU_AI_ACT", [PACK])] }
    } as ComplianceMapsFile);
    audit(ws, "FIXTURE_SIGNAL", ["fx_ok"]);
    const matrix = generateCoverageMatrix({ workspace: ws, window: "14d", frameworks: ["SOC2", "EU_AI_ACT"] });
    expect(matrix.frameworks.map((fw) => fw.score)).toEqual([null, null]);
    expect(matrix.overallScore).toBeNull();
    expect(matrix.frameworks[0]?.categories[0]?.dimensions.evidence).toBe("sufficient");
    expect(renderCoverageHeatmap(matrix)).toContain("Overall: not evaluated");
  });

  test("a framework whose report cannot be generated is not scored", () => {
    const ws = newWorkspace();
    const matrix = generateCoverageMatrix({ workspace: ws, window: "not-a-window", frameworks: ["SOC2"] });
    expect(matrix.frameworks[0]).toMatchObject({ framework: "SOC2", score: null, total: 0, notEvaluated: 0 });
    expect(matrix.overallScore).toBeNull();
    expect(renderCoverageMatrixMarkdown(matrix)).toContain("**Overall Score:** not evaluated");
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
    expect(heatmap).toContain("? NOT_EVALUATED");
    expect(heatmap).toContain("Overall: not evaluated");
  });
});
