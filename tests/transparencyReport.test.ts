import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import {
  generateTransparencyReport,
  renderTransparencyReportMarkdown,
  renderTransparencyReportJson,
} from "../src/transparency/transparencyReport.js";

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

// ---------------------------------------------------------------------------
// Helper: create a minimal AMC workspace with proper YAML agent config
// ---------------------------------------------------------------------------

function createTestWorkspace(opts?: {
  skipRuns?: boolean;
  skipBom?: boolean;
  integrityIndex?: number;
  avgLevel?: number;
  secondLayerLevel?: number;
}): { workspace: string; agentId: string } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-test-"));
  const agentId = "test-agent";
  const agentDir = join(workspace, ".amc", "agents", agentId);

  mkdirSync(agentDir, { recursive: true });

  if (!opts?.skipRuns) {
    mkdirSync(join(agentDir, "runs"), { recursive: true });
  }
  if (!opts?.skipBom) {
    mkdirSync(join(agentDir, "bom"), { recursive: true });
  }

  // Write agent config as YAML (loadAgentConfig reads agent.config.yaml)
  const agentConfig = {
    id: agentId,
    agentName: "Test Agent",
    role: "assistant",
    domain: "testing",
    primaryTasks: ["test-task"],
    stakeholders: ["developer"],
    riskTier: "low",
    provider: {
      templateId: "custom",
      routePrefix: "/test",
      upstreamId: "test-upstream",
      baseUrl: "http://localhost:8080",
      openaiCompatible: true,
      auth: { type: "none" },
    },
    environment: "development",
    createdTs: Date.now(),
    updatedTs: Date.now(),
  };
  writeFileSync(join(agentDir, "agent.config.yaml"), YAML.stringify(agentConfig));

  const integrity = opts?.integrityIndex ?? 0.85;
  const avgLvl = opts?.avgLevel ?? 3.5;
  const secondLvl = opts?.secondLayerLevel ?? 4.0;

  // Write a minimal run report
  if (!opts?.skipRuns) {
    const run = {
      agentId,
      runId: "run-001",
      ts: Date.now(),
      windowStartTs: Date.now() - 86400000,
      windowEndTs: Date.now(),
      status: "VALID",
      verificationPassed: true,
      integrityIndex: integrity,
      trustLabel: "VERIFIED",
      targetProfileId: null,
      layerScores: [
        {
          layerName: "Tool Use Safety",
          avgFinalLevel: avgLvl,
          confidenceWeightedFinalLevel: avgLvl - 0.3,
        },
        {
          layerName: "Instruction Following",
          avgFinalLevel: secondLvl,
          confidenceWeightedFinalLevel: secondLvl - 0.2,
        },
      ],
      questionScores: [],
      inflationAttempts: [],
      unsupportedClaimCount: 1,
      contradictionCount: 0,
      trustBoundaryViolated: false,
      trustBoundaryMessage: null,
      correlationRatio: 1.0,
      invalidReceiptsCount: 0,
      correlationWarnings: [],
      evidenceCoverage: 0.8,
      evidenceTrustCoverage: { observed: 0.5, attested: 0.3, selfReported: 0.2 },
      targetDiff: [],
      prioritizedUpgradeActions: [],
      evidenceToCollectNext: [],
      runSealSig: "sig-placeholder",
      reportJsonSha256: "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
    };
    writeFileSync(join(agentDir, "runs", "run-001.json"), JSON.stringify(run));
  }

  return { workspace, agentId };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) {
    rmSync(dir, { recursive: true, force: true });
  }
  cleanups.length = 0;
});

function tracked(ws: string): string {
  cleanups.push(ws);
  return ws;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateTransparencyReport", () => {
  it("generates report for valid agent", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);

    expect(report).toBeDefined();
    expect(report.version).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(report.agentId).toBeDefined();
    expect(report.agentName).toBeDefined();
    expect(report.role).toBeDefined();
    expect(report.domain).toBeDefined();
    expect(report.identity).toBeDefined();
    expect(report.capabilities).toBeDefined();
    expect(report.dataAccess).toBeDefined();
    expect(report.trustEvidence).toBeDefined();
    expect(report.dimensions).toBeDefined();
    expect(report.compliance).toBeDefined();
    expect(report.risks).toBeDefined();
    expect(report.topPriorities).toBeDefined();
  });

  it("report has correct identity fields", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);

    expect(report.agentId).toBe("test-agent");
    expect(report.agentName).toBe("Test Agent");
    expect(report.identity.riskTier).toBe("low");
    expect(report.identity.maturityLevel).toBeGreaterThanOrEqual(1);
    expect(report.identity.maturityLevel).toBeLessThanOrEqual(5);
    expect(report.identity.maturityLabel).toMatch(/^L[1-5] — (Initial|Developing|Defined|Managed|Optimizing)$/);
    expect(report.identity.trustScore).toBeGreaterThanOrEqual(0);
    expect(report.identity.trustScore).toBeLessThanOrEqual(100);
  });

  it("report has correct dimensions from run", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);

    expect(report.dimensions.length).toBe(2);
    const names = report.dimensions.map((d) => d.name);
    expect(names).toContain("Tool Use Safety");
    expect(names).toContain("Instruction Following");

    for (const dim of report.dimensions) {
      expect(dim.level).toBeGreaterThanOrEqual(1);
      expect(dim.level).toBeLessThanOrEqual(5);
      expect(dim.label).toBeDefined();
      expect(dim.confidenceWeighted).toBeGreaterThanOrEqual(0);
    }
  });

  it("renders markdown with expected sections", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    const md = renderTransparencyReportMarkdown(report);

    expect(md).toContain("# Agent Transparency Report");
    expect(md).toContain("## 🏆 Trust Summary");
    expect(md).toContain("## 📊 Dimension Scores");
    expect(md).toContain("## ⚙️ Capabilities");
    expect(md).toContain("## 🔐 Trust Evidence");
    expect(md).toContain("Test Agent");
    expect(md).toContain("test-agent");
  });

  it("renders valid JSON", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    const jsonStr = renderTransparencyReportJson(report);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.version).toBe("1.0");
    expect(parsed.agentId).toBe("test-agent");
    expect(parsed.identity).toBeDefined();
    expect(parsed.dimensions).toBeInstanceOf(Array);
    expect(parsed.trustEvidence).toBeDefined();
  });

  it("throws for non-existent agent", () => {
    const { workspace } = createTestWorkspace();
    tracked(workspace);

    expect(() =>
      generateTransparencyReport("nonexistent-agent", workspace)
    ).toThrow();
  });

  it("handles agent with no runs gracefully", () => {
    const { workspace, agentId } = createTestWorkspace({ skipRuns: true });
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);

    expect(report).toBeDefined();
    expect(report.agentId).toBe("test-agent");
    expect(report.dimensions).toBeInstanceOf(Array);
  });

  it("handles agent with no BOM gracefully", () => {
    const { workspace, agentId } = createTestWorkspace({ skipBom: true });
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);

    expect(report).toBeDefined();
    expect(report.agentId).toBe("test-agent");
    expect(report.trustEvidence).toBeDefined();
  });

  it("report version is 1.0", () => {
    const { workspace, agentId } = createTestWorkspace();
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    expect(report.version).toBe("1.0");
  });

  it("certification status — certified when integrity >= 0.9 and level >= 4", () => {
    const { workspace, agentId } = createTestWorkspace({
      integrityIndex: 0.95,
      avgLevel: 4.2,
    });
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    expect(report.identity.certificationStatus).toBe("certified");
  });

  it("certification status — pending when integrity >= 0.6 or level >= 2", () => {
    const { workspace, agentId } = createTestWorkspace({
      integrityIndex: 0.7,
      avgLevel: 2.5,
    });
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    expect(report.identity.certificationStatus).toBe("pending");
  });

  it("certification status — not-certified when integrity < 0.6 and level < 2", () => {
    const { workspace, agentId } = createTestWorkspace({
      integrityIndex: 0.3,
      avgLevel: 1.2,
      secondLayerLevel: 1.3,
    });
    tracked(workspace);

    const report = generateTransparencyReport(agentId, workspace);
    expect(report.identity.certificationStatus).toBe("not-certified");
  });
});
