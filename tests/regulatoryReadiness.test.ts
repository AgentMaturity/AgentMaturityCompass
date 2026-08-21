import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { scoreISO42001Coverage, scoreRegulatoryReadiness } from "../src/score/regulatoryReadiness.js";
import { markAsAmcCheckout } from "./helpers/amcCheckout.js";

const roots: string[] = [];

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-reg-ready-test-"));
  roots.push(root);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}

function writeArtifact(workspace: string, relPath: string): void {
  const abs = join(workspace, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "fixture\n");
}

function writeRun(workspace: string, agentId: string, runId: string, ts: number, integrityIndex: number): void {
  const runPath = join(workspace, ".amc", "agents", agentId, "runs", `${runId}.json`);
  mkdirSync(dirname(runPath), { recursive: true });
  writeFileSync(runPath, `${JSON.stringify({ runId, ts, integrityIndex }, null, 2)}\n`);
}

function populateHighCoverageArtifacts(workspace: string): void {
  // This fixture stands in for a fully-covered AMC checkout: most of the
  // artifacts below are AMC's own source modules. It exercises the aggregation
  // math across EU/ISO/OWASP, not what a customer agent can reach — 55 of 131
  // evidence criteria still list only src/ paths, so a real agent cannot yet
  // satisfy them (tracked separately).
  markAsAmcCheckout(workspace);
  const artifacts = [
    "docs/AI_GOVERNANCE.md",
    "docs/POLICY.md",
    "docs/RISK_MANAGEMENT.md",
    "docs/DATA_GOVERNANCE.md",
    "README.md",
    ".amc/audit_log.jsonl",
    "docs/QA.md",
    "docs/INCIDENT_RESPONSE_READINESS.md",
    "docs/FRIA.md",
    "src/policy/index.ts",
    "src/approvals/index.ts",
    "src/assurance/index.ts",
    "src/ops/index.ts",
    "src/drift/index.ts",
    "src/monitor/index.ts",
    "src/audit/index.ts",
    "src/ledger/index.ts",
    "src/corrections/index.ts",
    "src/loop/index.ts",
    "src/snapshot/index.ts",
    "src/forecast/index.ts",
    "src/score/outputIntegrityMaturity.ts",
    "src/score/mcpCompliance.ts",
    "src/score/humanOversightQuality.ts",
    "src/assurance/packs/injectionPack.ts",
    "src/assurance/packs/ragPoisoningPack.ts",
    "src/assurance/packs/resourceExhaustionPack.ts",
    "src/assurance/packs/sbomSupplyChainPack.ts",
    "src/assurance/packs/dlpExfiltrationPack.ts",
    "src/assurance/packs/governanceBypassPack.ts",
    "src/assurance/packs/taintPropagationPack.ts"
  ];
  for (const artifact of artifacts) {
    writeArtifact(workspace, artifact);
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("scoreISO42001Coverage", () => {
  test("returns zero score when no controls are present", () => {
    const workspace = newWorkspace();
    const score = scoreISO42001Coverage(workspace);
    expect(score.score).toBe(0);
    expect(score.passedControls).toBe(0);
    expect(score.gaps.length).toBe(score.totalControls);
  });

  test("detects covered ISO controls from workspace artifacts", () => {
    const workspace = newWorkspace();
    writeArtifact(workspace, "docs/AI_GOVERNANCE.md");
    writeArtifact(workspace, "docs/POLICY.md");
    writeArtifact(workspace, "docs/MONITORING.md");

    const score = scoreISO42001Coverage(workspace);
    expect(score.passedControls).toBeGreaterThanOrEqual(3);
    expect(score.score).toBeGreaterThan(0);
  });
});

describe("scoreRegulatoryReadiness", () => {
  test("combines EU + ISO + OWASP into a single readiness score", () => {
    const workspace = newWorkspace();
    populateHighCoverageArtifacts(workspace);
    writeRun(workspace, "agent-reg", "run-1", 1000, 0.95);

    const score = scoreRegulatoryReadiness({
      workspace,
      agentId: "agent-reg"
    });

    expect(score.components.euAiAct).toBeGreaterThanOrEqual(90);
    expect(score.components.owaspLLM).toBe(100);
    expect(score.components.iso42001).toBeGreaterThanOrEqual(90);
    expect(score.score).toBeGreaterThanOrEqual(70);
    expect(score.agentId).toBe("agent-reg");
  });

  test("agent evidence modifier increases with stronger latest integrity index", () => {
    const workspace = newWorkspace();
    populateHighCoverageArtifacts(workspace);
    writeRun(workspace, "agent-reg", "run-low", 1000, 0.4);
    const low = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });

    writeRun(workspace, "agent-reg", "run-high", 2000, 0.9);
    const high = scoreRegulatoryReadiness({ workspace, agentId: "agent-reg" });

    expect(high.agentEvidenceModifier).toBeGreaterThan(low.agentEvidenceModifier);
    expect(high.score).toBeGreaterThanOrEqual(low.score);
  });

  test("normalizes custom weights for deterministic weighted composite", () => {
    const workspace = newWorkspace();
    populateHighCoverageArtifacts(workspace);
    writeRun(workspace, "agent-reg", "run-1", 1000, 0.8);

    const score = scoreRegulatoryReadiness({
      workspace,
      agentId: "agent-reg",
      weights: {
        euAiAct: 2,
        iso42001: 2,
        owaspLLM: 0
      }
    });

    const weightSum = score.weights.euAiAct + score.weights.iso42001 + score.weights.owaspLLM;
    expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
    expect(score.weights.owaspLLM).toBe(0);
  });
});

