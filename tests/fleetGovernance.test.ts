import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import type { DiagnosticReport, TrustLabel } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { handleApiRoute } from "../src/api/index.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { buildAgentConfig, initFleet, loadAgentConfig, scaffoldAgent } from "../src/fleet/registry.js";
import {
  applyFleetGovernancePolicy,
  buildFleetHealthDashboard,
  defineFleetSlo,
  fleetSloStatus,
  generateFleetComplianceReport,
  listFleetSlos,
  normalizeFleetEnvironment,
  parseFleetSloObjective,
  tagFleetAgentEnvironment
} from "../src/fleet/governance.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-governance-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initFleet(dir, { orgName: "Governance Test Fleet" });
  return dir;
}

function setupAgent(workspace: string, agentId: string, environment: "development" | "staging" | "production" = "development"): void {
  const config = buildAgentConfig({
    agentId,
    agentName: `Agent ${agentId}`,
    role: "assistant",
    domain: "general",
    primaryTasks: ["support"],
    stakeholders: ["owner"],
    riskTier: "med",
    environment,
    templateId: "openai",
    baseUrl: "https://api.openai.com",
    routePrefix: "/openai",
    auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
  });
  scaffoldAgent(workspace, config);
}

function makeReport(
  agentId: string,
  integrityIndex: number,
  levels: [number, number, number, number, number],
  ts: number
): DiagnosticReport {
  const layerNames = [
    "Strategic Agent Operations",
    "Leadership & Autonomy",
    "Culture & Alignment",
    "Resilience",
    "Skills"
  ] as const;
  const layerScores = layerNames.map((layerName, idx) => ({
    layerName,
    avgFinalLevel: levels[idx] ?? 0,
    confidenceWeightedFinalLevel: levels[idx] ?? 0
  }));
  const trustLabel: TrustLabel =
    integrityIndex >= 0.7 ? "HIGH TRUST" : integrityIndex >= 0.4 ? "LOW TRUST" : "UNRELIABLE — DO NOT USE FOR CLAIMS";
  return {
    agentId,
    runId: `run_${agentId}_${ts}`,
    ts,
    windowStartTs: ts - 1000,
    windowEndTs: ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex,
    trustLabel,
    targetProfileId: null,
    layerScores,
    questionScores: [],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: {
      observed: 1,
      attested: 0,
      selfReported: 0
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
}

function writeReport(workspace: string, report: DiagnosticReport): void {
  const runsDir = getAgentPaths(workspace, report.agentId).runsDir;
  writeFileSync(join(runsDir, `${report.runId}.json`), JSON.stringify(report, null, 2));
}

function readYamlFile(path: string): Record<string, unknown> {
  return (YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>) ?? {};
}

function mockReq(method: string, url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  (req as unknown as { method: string }).method = method;
  (req as unknown as { url: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; statusCode: number; body: string } {
  const state = {
    statusCode: 0,
    body: ""
  };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        state.body += chunk.toString();
      }
    }
  } as unknown as ServerResponse;
  return {
    res,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    }
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("fleet governance primitives", () => {
  test("normalizeFleetEnvironment supports aliases", () => {
    expect(normalizeFleetEnvironment("dev")).toBe("development");
    expect(normalizeFleetEnvironment("staging")).toBe("staging");
    expect(normalizeFleetEnvironment("production")).toBe("production");
  });

  test("parseFleetSloObjective parses production dimension target", () => {
    const parsed = parseFleetSloObjective("95% of production agents must score L3+ on dimension 2");
    expect(parsed.environment).toBe("production");
    expect(parsed.dimension).toBe(2);
    expect(parsed.minimumLevel).toBe(3);
    expect(parsed.requiredPercent).toBe(0.95);
  });

  test("defineFleetSlo persists definitions", () => {
    const workspace = newWorkspace();
    const slo = defineFleetSlo({
      workspace,
      objective: "90% of staging agents must score L4+ on dimension 2",
      sloId: "fleet_slo_stage_dim2"
    });
    expect(slo.sloId).toBe("fleet_slo_stage_dim2");
    const stored = listFleetSlos(workspace);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.environment).toBe("staging");
  });

  test("tagFleetAgentEnvironment updates agent config", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    const tagged = tagFleetAgentEnvironment({
      workspace,
      agentId: "alpha",
      environment: "production"
    });
    expect(tagged.environment).toBe("production");
    const updated = loadAgentConfig(workspace, "alpha");
    expect(updated.environment).toBe("production");
  });

  test("applyFleetGovernancePolicy applies to all agents", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    setupAgent(workspace, "beta");
    const applied = applyFleetGovernancePolicy({
      workspace,
      policyId: "fleet-policy-global",
      description: "Global baseline",
      minimumIntegrityIndex: 0.72
    });
    expect(applied.environment).toBe("all");
    expect(applied.updatedAgentIds).toEqual(expect.arrayContaining(["alpha", "beta", "default"]));
    const alphaGuardrails = readYamlFile(getAgentPaths(workspace, "alpha").guardrails);
    expect((alphaGuardrails.fleetPolicy as { policyId?: string }).policyId).toBe("fleet-policy-global");
  });

  test("applyFleetGovernancePolicy can target one environment", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    setupAgent(workspace, "beta");
    tagFleetAgentEnvironment({ workspace, agentId: "alpha", environment: "production" });
    tagFleetAgentEnvironment({ workspace, agentId: "beta", environment: "staging" });
    const applied = applyFleetGovernancePolicy({
      workspace,
      policyId: "fleet-policy-prod",
      description: "Production baseline",
      minimumIntegrityIndex: 0.8,
      environment: "production"
    });
    expect(applied.environment).toBe("production");
    expect(applied.updatedAgentIds).toEqual(["alpha"]);
    const alphaGuardrails = readYamlFile(getAgentPaths(workspace, "alpha").guardrails);
    const betaGuardrails = readYamlFile(getAgentPaths(workspace, "beta").guardrails);
    expect((alphaGuardrails.fleetPolicy as { policyId?: string }).policyId).toBe("fleet-policy-prod");
    expect((betaGuardrails.fleetPolicy as { policyId?: string } | undefined)?.policyId).not.toBe("fleet-policy-prod");
  });
});

describe("fleet health and slo status", () => {
  test("buildFleetHealthDashboard aggregates agent scores", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    setupAgent(workspace, "beta");
    writeReport(workspace, makeReport("alpha", 0.8, [4, 4, 4, 4, 4], 1_000));
    writeReport(workspace, makeReport("beta", 0.6, [2, 2, 2, 2, 2], 2_000));
    const health = buildFleetHealthDashboard({ workspace, nowTs: 3_000 });
    expect(health.scoredAgentCount).toBe(2);
    expect(health.averageIntegrityIndex).toBeCloseTo(0.7, 3);
    expect(health.dimensionAverages[2]).toBeCloseTo(3, 3);
  });

  test("baseline initializes and ratchets upward", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    writeReport(workspace, makeReport("alpha", 0.5, [2, 2, 2, 2, 2], 1_000));
    const first = buildFleetHealthDashboard({ workspace, nowTs: 2_000 });
    expect(first.baselineIntegrityIndex).toBe(0.5);
    writeReport(workspace, makeReport("alpha", 0.8, [4, 4, 4, 4, 4], 3_000));
    const second = buildFleetHealthDashboard({ workspace, nowTs: 4_000 });
    expect(second.baselineIntegrityIndex).toBe(0.8);
  });

  test("drift alert fires when agent drops below baseline", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    writeReport(workspace, makeReport("alpha", 0.9, [4, 4, 4, 4, 4], 1_000));
    buildFleetHealthDashboard({ workspace, nowTs: 2_000 });
    writeReport(workspace, makeReport("alpha", 0.6, [3, 3, 3, 3, 3], 3_000));
    const health = buildFleetHealthDashboard({ workspace, nowTs: 4_000 });
    expect(health.alerts.some((alert) => alert.kind === "DRIFT" && alert.agentId === "alpha")).toBe(true);
  });

  test("fleetSloStatus reports healthy when objective is met", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    setupAgent(workspace, "beta");
    tagFleetAgentEnvironment({ workspace, agentId: "alpha", environment: "production" });
    tagFleetAgentEnvironment({ workspace, agentId: "beta", environment: "production" });
    defineFleetSlo({
      workspace,
      objective: "50% of production agents must score L3+ on dimension 2",
      sloId: "prod_l3_dim2"
    });
    writeReport(workspace, makeReport("alpha", 0.8, [4, 4, 4, 4, 4], 1_000));
    writeReport(workspace, makeReport("beta", 0.8, [2, 2, 2, 2, 2], 2_000));
    const status = fleetSloStatus(workspace);
    expect(status.overallStatus).toBe("HEALTHY");
    expect(status.statuses[0]!.status).toBe("HEALTHY");
  });

  test("fleetSloStatus breaches and records alert when objective fails", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    setupAgent(workspace, "beta");
    tagFleetAgentEnvironment({ workspace, agentId: "alpha", environment: "production" });
    tagFleetAgentEnvironment({ workspace, agentId: "beta", environment: "production" });
    defineFleetSlo({
      workspace,
      objective: "95% of production agents must score L3+ on dimension 2",
      sloId: "prod_l3_dim2_strict"
    });
    writeReport(workspace, makeReport("alpha", 0.8, [2, 2, 2, 2, 2], 1_000));
    writeReport(workspace, makeReport("beta", 0.8, [2, 2, 2, 2, 2], 2_000));
    const status = fleetSloStatus(workspace);
    expect(status.overallStatus).toBe("BREACHED");
    const health = buildFleetHealthDashboard({ workspace, nowTs: 5_000 });
    expect(health.alerts.some((alert) => alert.kind === "SLO_BREACH" && alert.sloId === "prod_l3_dim2_strict")).toBe(true);
  });
});

describe("fleet compliance reports and API", () => {
  test("generateFleetComplianceReport writes markdown report", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    writeReport(workspace, makeReport("alpha", 0.8, [4, 4, 4, 4, 4], 1_000));
    const out = generateFleetComplianceReport({
      workspace,
      outFile: ".amc/reports/fleet-compliance.md",
      format: "md"
    });
    expect(out.format).toBe("md");
    const text = readFileSync(out.outFile, "utf8");
    expect(text).toContain("AMC Fleet Compliance Report");
    expect(text).toContain("Fleet SLO Status");
  });

  test("generateFleetComplianceReport writes pdf report", () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    writeReport(workspace, makeReport("alpha", 0.8, [4, 4, 4, 4, 4], 1_000));
    const out = generateFleetComplianceReport({
      workspace,
      outFile: ".amc/reports/fleet-compliance.pdf",
      format: "pdf"
    });
    expect(out.format).toBe("pdf");
    const header = readFileSync(out.outFile).subarray(0, 8).toString("utf8");
    expect(header).toBe("%PDF-1.4");
  });

  test("GET /api/v1/fleet/health returns aggregate health payload", async () => {
    const workspace = newWorkspace();
    setupAgent(workspace, "alpha");
    writeReport(workspace, makeReport("alpha", 0.75, [3, 3, 3, 3, 3], 1_000));
    const req = mockReq("GET", "/api/v1/fleet/health");
    const response = mockRes();
    const handled = await handleApiRoute("/api/v1/fleet/health", "GET", req, response.res, workspace);
    expect(handled).toBe(true);
    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as { ok: boolean; data: { scoredAgentCount: number; averageIntegrityIndex: number } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.scoredAgentCount).toBeGreaterThanOrEqual(1);
    expect(parsed.data.averageIntegrityIndex).toBeGreaterThan(0);
  });
});
