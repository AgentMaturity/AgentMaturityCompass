import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import type { DiagnosticReport } from "../src/types.js";
import { orgInitCli, orgAssignCli, orgAddNodeCli, orgCommitCli } from "../src/org/orgCli.js";
import { computeOrgScorecard } from "../src/org/orgEngine.js";
import { orgConfigPath, verifyOrgConfigSignature } from "../src/org/orgStore.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { readTransparencyEntries } from "../src/transparency/logChain.js";
import { currentTransparencyMerkleRoot, verifyTransparencyMerkle } from "../src/transparency/merkleIndexStore.js";
import { pathExists } from "../src/utils/fs.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-org-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "org-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  try {
    initFleet(dir, { orgName: "Org Test Fleet" });
  } catch {
    // already initialized
  }
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function ensureAgent(workspace: string, agentId: string): void {
  const config = buildAgentConfig({
    agentId,
    agentName: `${agentId} Agent`,
    role: "assistant",
    domain: "engineering",
    primaryTasks: ["analysis", "delivery"],
    stakeholders: ["owner", "operator"],
    riskTier: "med",
    templateId: "openai",
    baseUrl: "https://api.openai.com",
    routePrefix: "/openai",
    auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
  });
  scaffoldAgent(workspace, config);
}

function writeRunFixture(params: {
  workspace: string;
  agentId: string;
  runId: string;
  overall: number;
  integrity: number;
  observed: number;
  attested: number;
  selfReported: number;
  correlation: number;
  invalidReceipts?: number;
}): void {
  const paths = getAgentPaths(params.workspace, params.agentId);
  const now = Date.now();
  const run: DiagnosticReport = {
    agentId: params.agentId,
    runId: params.runId,
    ts: now,
    windowStartTs: now - 7 * 24 * 60 * 60 * 1000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: params.integrity,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Leadership & Autonomy", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Culture & Alignment", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Resilience", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall },
      { layerName: "Skills", avgFinalLevel: params.overall, confidenceWeightedFinalLevel: params.overall }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: Math.round(params.overall),
      supportedMaxLevel: Math.round(params.overall),
      finalLevel: Math.round(params.overall),
      confidence: params.integrity,
      evidenceEventIds: ["fixture-ev"],
      flags: [],
      narrative: "fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: params.correlation,
    invalidReceiptsCount: params.invalidReceipts ?? 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: {
      observed: params.observed,
      attested: params.attested,
      selfReported: params.selfReported
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture"
  };
  writeFileSync(join(paths.runsDir, `${params.runId}.json`), JSON.stringify(run, null, 2));
}

async function pickFreePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolvePromise) => s.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = s.address();
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate random port");
  }
  return addr.port;
}

async function httpPostJson(url: string, token: string, body: unknown): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "x-amc-admin-token": token,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", rejectPromise);
    req.write(payload);
    req.end();
  });
}

async function waitForOrgSseEvent(params: {
  url: string;
  token: string;
  expected: string[];
  timeoutMs?: number;
}): Promise<{ event: string; data: string }> {
  const timeoutMs = params.timeoutMs ?? 12_000;
  return new Promise((resolvePromise, rejectPromise) => {
    let req: ReturnType<typeof httpRequest> | null = null;
    const timer = setTimeout(() => {
      req?.destroy();
      rejectPromise(new Error("timed out waiting for org SSE event"));
    }, timeoutMs);
    let settled = false;
    let buffer = "";

    req = httpRequest(
      params.url,
      {
        method: "GET",
        headers: {
          "x-amc-admin-token": params.token,
          accept: "text/event-stream"
        }
      },
      (res) => {
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const eventLine = part
              .split(/\r?\n/)
              .find((line) => line.startsWith("event:"));
            const dataLine = part
              .split(/\r?\n/)
              .find((line) => line.startsWith("data:"));
            if (!eventLine || !dataLine) {
              continue;
            }
            const event = eventLine.slice("event:".length).trim();
            const data = dataLine.slice("data:".length).trim();
            if (!params.expected.includes(event)) {
              continue;
            }
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              req?.destroy();
              resolvePromise({ event, data });
            }
            return;
          }
        });
        res.on("error", (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            rejectPromise(error);
          }
        });
      }
    );
    req.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
    req.end();
  });
}

describe("org compass", () => {
  test("org.yaml signature verify and tamper => UNTRUSTED display cap", () => {
    const workspace = newWorkspace();
    ensureAgent(workspace, "default");
    orgInitCli({ workspace, enterpriseName: "Acme" });
    orgAssignCli({ workspace, agentId: "default", nodeId: "enterprise", weight: 1 });
    writeRunFixture({
      workspace,
      agentId: "default",
      runId: "run_high",
      overall: 5,
      integrity: 0.96,
      observed: 0.95,
      attested: 0.04,
      selfReported: 0.01,
      correlation: 0.98
    });

    const before = verifyOrgConfigSignature(workspace);
    expect(before.valid).toBe(true);

    writeFileSync(orgConfigPath(workspace), `${readFileSync(orgConfigPath(workspace), "utf8")}\n# tamper\n`);

    const after = verifyOrgConfigSignature(workspace);
    expect(after.valid).toBe(false);

    const scorecard = computeOrgScorecard({ workspace, window: "14d" });
    const enterprise = scorecard.nodes.find((node) => node.nodeId === "enterprise");
    expect(enterprise).toBeTruthy();
    expect(enterprise?.trustLabel).toBe("UNTRUSTED");
    expect(Number(enterprise?.headline.median ?? 10)).toBeLessThanOrEqual(3);
  });

  test("aggregation is deterministic and low evidence coverage caps headline", () => {
    const workspace = newWorkspace();
    ensureAgent(workspace, "default");
    ensureAgent(workspace, "agent2");
    ensureAgent(workspace, "agent3");

    orgInitCli({ workspace, enterpriseName: "Acme" });
    orgAddNodeCli({
      workspace,
      id: "team-low",
      type: "TEAM",
      name: "Low Evidence Team",
      parentId: "enterprise"
    });
    orgAssignCli({ workspace, agentId: "default", nodeId: "enterprise", weight: 1 });
    orgAssignCli({ workspace, agentId: "agent2", nodeId: "enterprise", weight: 1 });
    orgAssignCli({ workspace, agentId: "agent3", nodeId: "enterprise", weight: 1 });
    orgAssignCli({ workspace, agentId: "agent3", nodeId: "team-low", weight: 1 });

    writeRunFixture({
      workspace,
      agentId: "default",
      runId: "run_a",
      overall: 5,
      integrity: 1,
      observed: 0.9,
      attested: 0.08,
      selfReported: 0.02,
      correlation: 0.96
    });
    writeRunFixture({
      workspace,
      agentId: "agent2",
      runId: "run_b",
      overall: 4,
      integrity: 0.5,
      observed: 0.2,
      attested: 0.7,
      selfReported: 0.1,
      correlation: 0.88
    });
    writeRunFixture({
      workspace,
      agentId: "agent3",
      runId: "run_c",
      overall: 1,
      integrity: 0.9,
      observed: 0.1,
      attested: 0.2,
      selfReported: 0.7,
      correlation: 0.7
    });

    const scorecard = computeOrgScorecard({ workspace, window: "14d" });
    const enterprise = scorecard.nodes.find((node) => node.nodeId === "enterprise");
    const lowTeam = scorecard.nodes.find((node) => node.nodeId === "team-low");
    expect(enterprise).toBeTruthy();
    expect(lowTeam).toBeTruthy();
    expect(enterprise?.countAgentsIncluded).toBe(3);
    expect(enterprise?.headline.median).toBe(5);
    expect(enterprise?.headline.trimmedMean).toBeCloseTo(4.1915, 3);
    expect(enterprise?.countHighTrustAgents).toBe(1);
    expect(enterprise?.countLowTrustAgents).toBe(1);

    expect(lowTeam?.trustLabel).toBe("LOW TRUST");
    expect(Number(lowTeam?.headline.median ?? 10)).toBeLessThanOrEqual(3);
    expect(lowTeam?.whyCapped.some((line) => line.includes("Evidence gap"))).toBe(true);
  });

  test("studio SSE emits org updates with no secret-like payloads", async () => {
    const workspace = newWorkspace();
    ensureAgent(workspace, "default");
    orgInitCli({ workspace, enterpriseName: "Acme" });
    orgAssignCli({ workspace, agentId: "default", nodeId: "enterprise", weight: 1 });

    const token = "org-test-token";
    const port = await pickFreePort();
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const eventPromise = waitForOrgSseEvent({
        url: `http://127.0.0.1:${port}/events/org`,
        token,
        expected: ["ORG_SCORECARD_UPDATED", "AGENT_RUN_COMPLETED"]
      });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
      const runResp = await httpPostJson(`http://127.0.0.1:${port}/agents/default/run`, token, {});
      expect(runResp.status).toBe(200);
      const event = await eventPromise;
      expect(["ORG_SCORECARD_UPDATED", "AGENT_RUN_COMPLETED"]).toContain(event.event);
      expect(event.data).not.toMatch(/lease_|Bearer|api_key/i);
    } finally {
      await server.close();
    }
  });

  test("console org pages load and frontend includes SSE wiring without external CDN refs", async () => {
    const workspace = newWorkspace();
    const token = "org-console-token";
    const port = await pickFreePort();
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const page = await new Promise<{ status: number; body: string }>((resolvePromise, rejectPromise) => {
        const req = httpRequest(`http://127.0.0.1:${port}/console/org`, { method: "GET" }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () =>
            resolvePromise({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8")
            })
          );
        });
        req.on("error", rejectPromise);
        req.end();
      });
      expect(page.status).toBe(200);
      expect(page.body).toContain("data-page=\"org\"");

      const appJs = readFileSync(join(process.cwd(), "src", "console", "assets", "app.js"), "utf8");
      expect(appJs).toContain("new EventSource(orgEventsPath()");
      expect(appJs).toContain("window.__amcOrgSseVersion");
      expect(appJs).not.toMatch(/https?:\/\/.*(cdn|unpkg|jsdelivr)/i);
    } finally {
      await server.close();
    }
  });

  test("org commitment artifacts are signed and recorded in transparency+merkle", () => {
    const workspace = newWorkspace();
    ensureAgent(workspace, "default");
    orgInitCli({ workspace, enterpriseName: "Acme" });
    orgAssignCli({ workspace, agentId: "default", nodeId: "enterprise", weight: 1 });
    writeRunFixture({
      workspace,
      agentId: "default",
      runId: "run_commit",
      overall: 4,
      integrity: 0.9,
      observed: 0.9,
      attested: 0.08,
      selfReported: 0.02,
      correlation: 0.95
    });

    const out = orgCommitCli({
      workspace,
      nodeId: "enterprise",
      days: 30,
      outFile: ".amc/org/commitments/enterprise/latest-export.md"
    });

    expect(pathExists(out.outPath)).toBe(true);
    expect(pathExists(out.sigPath)).toBe(true);
    expect(pathExists(join(workspace, ".amc", "org", "commitments", "enterprise", `${out.commitId}.md`))).toBe(true);

    const entries = readTransparencyEntries(workspace);
    expect(entries.some((entry) => entry.type === "ORG_COMMITMENT_CREATED" && entry.artifact.id === out.commitId)).toBe(true);

    const merkle = verifyTransparencyMerkle(workspace);
    expect(merkle.ok).toBe(true);
    expect(currentTransparencyMerkleRoot(workspace)).not.toBeNull();
  });
});
