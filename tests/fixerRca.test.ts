import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { latestEnforceResourceManifestPath, type EnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import { listFixerRcaReports, loadFixerRcaReport, writeFixerRcaReport } from "../src/mechanic/fixerRca.js";
import { writeEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../src/types.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fixer-rca-"));
  roots.push(dir);
  return dir;
}

function report(runId = "trace-run-rca-1"): DiagnosticReport {
  return {
    agentId: "default",
    runId,
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.63,
    trustLabel: "MEDIUM TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Agent Resilience", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 4,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.6,
        evidenceEventIds: ["trace-hallucinated"],
        flags: ["unsupported claim"],
        narrative: "Unsupported claim with no source citation.",
      },
      {
        questionId: "AMC-1.2",
        claimedLevel: 4,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.7,
        evidenceEventIds: ["trace-schema"],
        flags: ["invalid json schema"],
        narrative: "Malformed JSON response missing required field.",
      },
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: ["Fix unsupported claim handling."],
    evidenceToCollectNext: ["Capture redacted trace snippets."],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
}

function writeMutableManifest(ws: string): void {
  mkdirSync(join(ws, ".amc"), { recursive: true });
  writeFileSync(join(ws, ".amc", "prompt-addendum.md"), "Always cite evidence.\n");
  const manifestPath = latestEnforceResourceManifestPath(ws, "default");
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest: EnforceResourceManifest = {
    schemaVersion: "2026-05-22",
    manifestId: "enforce-resources-test",
    agentId: "default",
    workspace: ws,
    createdAt: new Date(Date.UTC(2026, 4, 22, 12, 0, 0)).toISOString(),
    resourcesSha256: "test-sha",
    resourceCount: 1,
    resources: [
      {
        id: "prompt:.amc/prompt-addendum.md",
        type: "prompt",
        kind: "prompt",
        path: ".amc/prompt-addendum.md",
        exists: true,
        digest: "digest",
        owner: "AMC",
        mutable: true,
        version: "v1",
        parentVersion: null,
        currentVersion: "v1",
        schema: "prompt-addendum.md",
        dependencies: [],
        lastEvaluation: null,
        validationStatus: "valid",
        lastVerifiedAt: new Date(Date.UTC(2026, 4, 22, 12, 0, 0)).toISOString(),
        rollbackTarget: "rollback://prompt-addendum/v1",
        rollbackPointer: "rollback://prompt-addendum/v1",
        evidenceRefs: [],
      },
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    }
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(params: {
  pathname: string;
  method?: string;
  url?: string;
  body?: unknown;
  workspace: string;
}): Promise<{ status: number; json: { ok: boolean; data?: any; error?: string } }> {
  const method = params.method ?? "GET";
  const req = mockReq(method, params.url ?? params.pathname, params.body);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(params.pathname, method, req, res, params.workspace);
  expect(handled).toBe(true);
  return { status: state.statusCode, json: JSON.parse(state.body) as { ok: boolean; data?: any; error?: string } };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("fixer RCA lane", () => {
  test("creates root causes, regression tests, rollback pointers, and a validation receipt", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    writeEpisodeRecord({
      workspace: ws,
      report: report(),
      source: "cli",
      command: "amc",
    });

    const written = writeFixerRcaReport({ workspace: ws, agentId: "default", selector: "trace-run-rca-1" });

    expect(existsSync(written.path)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.report.callRecords.length).toBeGreaterThan(0);
    expect(written.report.rootCauses.length).toBeGreaterThanOrEqual(2);
    expect(written.report.regressionTests.length).toBe(written.report.rootCauses.length);
    expect(written.report.proposals.every((proposal) => proposal.status === "proposed")).toBe(true);
    expect(written.report.proposals.every((proposal) => proposal.rollbackPointer)).toBe(true);
    expect(written.report.validationReceipt.status).toBe("passed");

    const listed = listFixerRcaReports({ workspace: ws, agentId: "default", redacted: true });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.workspace).toBe("$WORKSPACE");

    const loaded = loadFixerRcaReport({ workspace: ws, agentId: "default", selector: written.report.reportId });
    expect(loaded.reportId).toBe(written.report.reportId);
  });

  test("blocks proposed patches when no mutable Enforce resource is available", () => {
    const ws = workspace();
    writeEpisodeRecord({
      workspace: ws,
      report: report("trace-run-rca-blocked"),
      source: "cli",
      command: "amc",
    });

    const written = writeFixerRcaReport({ workspace: ws, agentId: "default", selector: "trace-run-rca-blocked" });

    expect(written.report.proposals.length).toBeGreaterThan(0);
    expect(written.report.proposals.every((proposal) => proposal.status === "blocked")).toBe(true);
    expect(written.report.validationReceipt.status).toBe("blocked");
  });

  test("exposes fixer RCA reports through the API", async () => {
    const ws = workspace();
    writeMutableManifest(ws);
    writeEpisodeRecord({
      workspace: ws,
      report: report("trace-run-rca-api"),
      source: "cli",
      command: "amc",
    });

    const created = await callApi({
      pathname: "/api/v1/fixer/rca",
      method: "POST",
      body: { agentId: "default", selector: "trace-run-rca-api" },
      workspace: ws,
    });
    expect(created.status).toBe(201);
    expect(created.json.data.report.workspace).toBe("$WORKSPACE");
    expect(created.json.data.report.validationReceipt.status).toBe("passed");

    const list = await callApi({ pathname: "/api/v1/fixer/rca", workspace: ws });
    expect(list.status).toBe(200);
    expect(list.json.data.total).toBe(1);

    const show = await callApi({ pathname: "/api/v1/fixer/rca/trace-run-rca-api", workspace: ws });
    expect(show.status).toBe(200);
    expect(show.json.data.runId).toBe("trace-run-rca-api");
  });
});
