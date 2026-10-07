import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { ensureAgentDirs, getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { handleApiRoute } from "../src/api/index.js";
import { writeFileAtomic } from "../src/utils/fs.js";
import { initWorkspace } from "../src/workspace.js";

interface MockResponseState {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const roots: string[] = [];
const originalCwd = process.cwd();

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-agent-timeline-api-test-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function mockReq(method: string, url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: MockResponseState } {
  const state: MockResponseState = {
    statusCode: 0,
    headers: {},
    body: ""
  };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        state.body += chunk.toString();
      }
    }
  } as unknown as ServerResponse;
  return { res, state };
}

function appendEvidence(params: {
  workspace: string;
  id: string;
  ts: number;
  agentId: string;
  trustTier: "OBSERVED" | "OBSERVED_HARDENED" | "ATTESTED" | "SELF_REPORTED";
  questionId?: string;
}): void {
  const ledger = openLedger(params.workspace);
  try {
    ledger.appendEvidence({
      id: params.id,
      ts: params.ts,
      sessionId: "session-api",
      runtime: "gateway",
      eventType: "audit",
      meta: {
        agentId: params.agentId,
        trustTier: params.trustTier,
        questionId: params.questionId ?? "AMC-2.3",
        severity: params.trustTier === "SELF_REPORTED" ? "warn" : "info"
      }
    });
  } finally {
    ledger.close();
  }
}

function writeRun(
  workspace: string,
  agentId: string,
  runId: string,
  ts: number,
  finalLevels: number[],
  evidenceEventIds: string[]
): void {
  const paths = getAgentPaths(workspace, agentId);
  ensureAgentDirs(paths);
  const payload = {
    runId,
    ts,
    integrityIndex: 0.9,
    trustLabel: "HIGH TRUST",
    questionScores: finalLevels.map((level, index) => ({
      questionId: `AMC-${index + 1}.1`,
      finalLevel: level,
      evidenceEventIds
    }))
  };
  writeFileAtomic(join(paths.runsDir, `${runId}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

afterEach(() => {
  process.chdir(originalCwd);
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("agent timeline API route", () => {
  test("GET /api/v1/agents/:id/timeline returns score + evidence timeline data", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    appendEvidence({
      workspace,
      id: "ev-1",
      ts: 1_700_000_000_000,
      agentId: "agent-api",
      trustTier: "OBSERVED",
      questionId: "AMC-2.3"
    });
    appendEvidence({
      workspace,
      id: "ev-2",
      ts: 1_700_000_100_000,
      agentId: "agent-api",
      trustTier: "OBSERVED_HARDENED",
      questionId: "AMC-2.3"
    });
    writeRun(workspace, "agent-api", "run-a", 1_700_000_050_000, [2, 3], ["ev-1"]);
    writeRun(workspace, "agent-api", "run-b", 1_700_000_150_000, [4, 4], ["ev-2"]);

    const req = mockReq("GET", "/api/v1/agents/agent-api/timeline");
    const { res, state } = mockRes();
    const handled = await handleApiRoute("/api/v1/agents/agent-api/timeline", "GET", req, res, workspace);
    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);

    const body = JSON.parse(state.body) as {
      ok: boolean;
      data: {
        scoreSeries: Array<{ runId: string; scorePercent: number }>;
        evidenceSeries: Array<{ eventId: string }>;
        timeline: Array<{ kind: string }>;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.scoreSeries).toHaveLength(2);
    expect(body.data.scoreSeries[0]!.runId).toBe("run-a");
    expect(body.data.evidenceSeries.map((row) => row.eventId)).toEqual(["ev-1", "ev-2"]);
    expect(body.data.timeline.some((row) => row.kind === "score_change")).toBe(true);
    expect(body.data.timeline.some((row) => row.kind === "evidence_event")).toBe(true);
  });

  test("filters out evidence for other agents", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    appendEvidence({
      workspace,
      id: "ev-match",
      ts: 1_700_000_010_000,
      agentId: "agent-filter",
      trustTier: "OBSERVED"
    });
    appendEvidence({
      workspace,
      id: "ev-other",
      ts: 1_700_000_020_000,
      agentId: "different-agent",
      trustTier: "OBSERVED"
    });
    writeRun(workspace, "agent-filter", "run-filter", 1_700_000_030_000, [3], ["ev-match", "ev-other"]);

    const req = mockReq("GET", "/api/v1/agents/agent-filter/timeline");
    const { res, state } = mockRes();
    await handleApiRoute("/api/v1/agents/agent-filter/timeline", "GET", req, res, workspace);
    const body = JSON.parse(state.body) as {
      data: { evidenceSeries: Array<{ eventId: string }> };
    };
    expect(body.data.evidenceSeries.map((row) => row.eventId)).toEqual(["ev-match"]);
  });

  test("returns empty timeline sections when no runs or evidence exist", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    const req = mockReq("GET", "/api/v1/agents/agent-empty/timeline");
    const { res, state } = mockRes();
    await handleApiRoute("/api/v1/agents/agent-empty/timeline", "GET", req, res, workspace);
    const body = JSON.parse(state.body) as {
      ok: boolean;
      data: { scoreSeries: unknown[]; evidenceSeries: unknown[]; timeline: unknown[]; summary: { runCount: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.data.scoreSeries).toEqual([]);
    expect(body.data.evidenceSeries).toEqual([]);
    expect(body.data.timeline).toEqual([]);
    expect(body.data.summary.runCount).toBe(0);
  });

  test("includes anomaly detections in timeline response", async () => {
    const workspace = newWorkspace();
    process.chdir(workspace);

    appendEvidence({
      workspace,
      id: "ev-t1",
      ts: 1_700_000_000_000,
      agentId: "agent-anomaly",
      trustTier: "OBSERVED_HARDENED"
    });
    appendEvidence({
      workspace,
      id: "ev-t2",
      ts: 1_700_000_001_000,
      agentId: "agent-anomaly",
      trustTier: "SELF_REPORTED"
    });
    writeRun(workspace, "agent-anomaly", "run-1", 1_700_000_050_000, [2], ["ev-t1"]);
    writeRun(workspace, "agent-anomaly", "run-2", 1_700_000_060_000, [2], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-3", 1_700_000_070_000, [2], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-4", 1_700_000_080_000, [2], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-5", 1_700_000_090_000, [1], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-6", 1_700_000_100_000, [5], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-7", 1_700_000_110_000, [1], ["ev-t2"]);
    writeRun(workspace, "agent-anomaly", "run-8", 1_700_000_120_000, [5], ["ev-t2"]);

    const req = mockReq("GET", "/api/v1/agents/agent-anomaly/timeline");
    const { res, state } = mockRes();
    await handleApiRoute("/api/v1/agents/agent-anomaly/timeline", "GET", req, res, workspace);
    const body = JSON.parse(state.body) as {
      data: { anomalies: Array<{ type: string }> };
    };
    const types = body.data.anomalies.map((row) => row.type);
    expect(types).toContain("TRUST_TIER_REGRESSION");
    expect(types).toContain("SCORE_VOLATILITY_SPIKE");
  });
});
