import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { writeEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../src/types.js";
import { listTraceFailureIndexes, loadTraceFailureIndex, topTraceFailureClusters } from "../src/watch/traceFailureIndex.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-trace-index-"));
  roots.push(dir);
  return dir;
}

function report(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "trace-run-1",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.72,
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
        evidenceEventIds: ["trace-a"],
        flags: ["unsupported claim"],
        narrative: "Unsupported claim leaked sk-live-secret-token-1234567890 in the answer.",
      },
      {
        questionId: "AMC-1.2",
        claimedLevel: 4,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.7,
        evidenceEventIds: ["trace-b"],
        flags: ["unsupported claim"],
        narrative: "Unsupported claim with no source citation.",
      },
      {
        questionId: "AMC-1.3",
        claimedLevel: 3,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.5,
        evidenceEventIds: ["trace-c"],
        flags: ["invalid json schema"],
        narrative: "Malformed JSON response missing required field.",
      },
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 2,
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

describe("trace failure index", () => {
  test("writes a redacted index and clusters repeated failure modes from EpisodeRecord data", () => {
    const ws = workspace();
    const written = writeEpisodeRecord({
      workspace: ws,
      report: report(),
      source: "cli",
      command: "amc"
    });

    expect(written.episode.traceFailureIndexRef?.entryCount).toBe(3);
    expect(written.episode.traceFailureIndexRef?.clusterCount).toBeGreaterThanOrEqual(2);

    const indexes = listTraceFailureIndexes({ workspace: ws, agentId: "default" });
    expect(indexes).toHaveLength(1);
    expect(indexes[0]!.signaturePath).toBeTruthy();
    expect(indexes[0]!.entries[0]!.redactedSnippet).not.toContain("sk-live-secret-token");
    expect(indexes[0]!.clusters[0]!.suggestedRepairInput.failureClass).toBeTruthy();

    const loaded = loadTraceFailureIndex({ workspace: ws, agentId: "default", selector: "trace-run-1", redacted: true });
    expect(loaded.workspace).toBe("$WORKSPACE");
    expect(loaded.summary.entryCount).toBe(3);

    const clusters = topTraceFailureClusters({ workspace: ws, agentId: "default", limit: 2 });
    expect(clusters[0]!.count).toBeGreaterThanOrEqual(2);
    expect(clusters[0]!.recommendationIds).toContain(`repair.${clusters[0]!.failureClass}`);
  });

  test("exposes trace indexes and failure clusters through evidence API", async () => {
    const ws = workspace();
    writeEpisodeRecord({
      workspace: ws,
      report: report(),
      source: "cli",
      command: "amc"
    });

    const indexes = await callApi({ pathname: "/api/v1/evidence/trace-indexes", workspace: ws });
    expect(indexes.status).toBe(200);
    expect(indexes.json.data.total).toBe(1);
    expect(indexes.json.data.indexes[0].workspace).toBe("$WORKSPACE");

    const inspected = await callApi({ pathname: "/api/v1/evidence/trace-indexes/trace-run-1", workspace: ws });
    expect(inspected.status).toBe(200);
    expect(inspected.json.data.summary.clusterCount).toBeGreaterThanOrEqual(2);

    const clusters = await callApi({ pathname: "/api/v1/evidence/failure-clusters", workspace: ws });
    expect(clusters.status).toBe(200);
    expect(clusters.json.data.total).toBeGreaterThanOrEqual(2);
    expect(clusters.json.data.clusters[0].sampleSnippet).not.toContain("sk-live-secret-token");
  });
});
