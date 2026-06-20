import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  buildAgentTimelineData: vi.fn()
}));

vi.mock("../src/observability/timeline.js", () => ({
  buildAgentTimelineData: m.buildAgentTimelineData
}));

import { handleObserveRoute } from "../src/api/observeRouter.js";

function mockReq(method: string, url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  return req;
}

function mockRes(): {
  res: ServerResponse;
  state: { statusCode: number; headers: Record<string, string>; body: string };
} {
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

async function callObserve(params: { pathname: string; method?: string; url?: string; workspace?: string }) {
  const req = mockReq(params.method ?? "GET", params.url ?? params.pathname);
  const { res, state } = mockRes();
  const handled = await handleObserveRoute(
    params.pathname,
    params.method ?? "GET",
    req,
    res,
    params.workspace ?? "/tmp/amc-observe-test"
  );
  const json = state.body ? JSON.parse(state.body) : undefined;
  return { handled, status: state.statusCode, json };
}

function sampleTimelineData() {
  return {
    agentId: "agent-1",
    generatedTs: 123,
    scoreSeries: [
      {
        ts: 100,
        runId: "run-1",
        score: 3.5,
        scorePercent: 70,
        deltaPercent: null,
        integrityIndex: 0.91,
        trustLabel: "HIGH TRUST",
        linkedEvidenceEventIds: ["ev-1"]
      }
    ],
    evidenceSeries: [
      {
        ts: 90,
        eventId: "ev-1",
        eventType: "tool_call",
        trustTier: "OBSERVED",
        severity: "INFO",
        questionId: "AMC-1.1",
        dimension: "safety"
      }
    ],
    timeline: [{ ts: 100, kind: "score_change", runId: "run-1", scorePercent: 70 }],
    anomalies: [
      {
        type: "TRUST_TIER_REGRESSION",
        severity: "WARN",
        ts: 101,
        fromTier: "OBSERVED_HARDENED",
        toTier: "SELF_REPORTED",
        rankDrop: 2,
        message: "Trust tier regressed."
      },
      {
        type: "SCORE_VOLATILITY_SPIKE",
        severity: "HIGH",
        ts: 102,
        recentVolatility: 7,
        baselineVolatility: 2,
        spikeRatio: 3.5,
        message: "Score volatility spiked."
      }
    ],
    summary: {
      runCount: 1,
      evidenceCount: 1,
      startTs: 90,
      endTs: 100
    }
  };
}

describe("observe API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.buildAgentTimelineData.mockReturnValue(sampleTimelineData());
  });

  test("timeline route mirrors amc observe timeline with bounded query parameters", async () => {
    const result = await callObserve({
      pathname: "/api/v1/observe/timeline",
      url: "/api/v1/observe/timeline?agentId=agent-1&limit=12&maxEvidenceEvents=34",
      workspace: "/workspace"
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
    expect(m.buildAgentTimelineData).toHaveBeenCalledWith({
      workspace: "/workspace",
      agentId: "agent-1",
      maxRuns: 12,
      maxEvidenceEvents: 34
    });
    expect(result.json.data.source).toBe("amc observe timeline");
    expect(result.json.data.cliEquivalent).toBe("amc observe timeline --agent agent-1 --limit 12 --json");
    expect(result.json.data.scoreSeries[0].runId).toBe("run-1");
    expect(result.json.data.evidenceSeries[0].eventId).toBe("ev-1");
  });

  test("anomalies route returns only anomaly data while preserving summary evidence", async () => {
    const result = await callObserve({
      pathname: "/api/v1/observe/anomalies",
      url: "/api/v1/observe/anomalies?agentId=agent-1&limit=1&maxRuns=20",
      workspace: "/workspace"
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
    expect(m.buildAgentTimelineData).toHaveBeenCalledWith({
      workspace: "/workspace",
      agentId: "agent-1",
      maxRuns: 20,
      maxEvidenceEvents: 1000
    });
    expect(result.json.data.source).toBe("amc observe anomalies");
    expect(result.json.data.cliEquivalent).toBe("amc observe anomalies --agent agent-1 --json");
    expect(result.json.data.anomalies).toHaveLength(1);
    expect(result.json.data.summary.anomalyCount).toBe(2);
    expect(result.json.data.summary.returnedAnomalyCount).toBe(1);
  });

  test("status and method guards are explicit", async () => {
    const status = await callObserve({ pathname: "/api/v1/observe/status" });
    expect(status.handled).toBe(true);
    expect(status.status).toBe(200);
    expect(status.json.data).toEqual({ status: "operational", module: "observe" });

    const wrongMethod = await callObserve({ pathname: "/api/v1/observe/timeline", method: "POST" });
    expect(wrongMethod.handled).toBe(true);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.json.ok).toBe(false);
  });

  test("observe API is registered, documented, and OpenAPI-visible", () => {
    const apiIndex = readFileSync(resolve(process.cwd(), "src/api/index.ts"), "utf8");
    const surfaces = readFileSync(resolve(process.cwd(), "docs/API_SURFACES.md"), "utf8");
    const openapi = readFileSync(resolve(process.cwd(), "website/openapi.yaml"), "utf8");
    const audit = readFileSync(resolve(process.cwd(), "docs/AUDIT_50_AGENTS_BATCH5.md"), "utf8");

    expect(apiIndex).toContain("handleObserveRoute");
    expect(apiIndex).toContain("id: 'observe'");
    expect(apiIndex).toContain("prefixes: ['/api/v1/observe']");
    expect(surfaces).toContain("GET /api/v1/observe/timeline?agentId=<id>&limit=<n>&maxEvidenceEvents=<n>");
    expect(surfaces).toContain("GET /api/v1/observe/anomalies?agentId=<id>&limit=<n>&maxRuns=<n>");
    expect(openapi).toContain("  /v1/observe/timeline:");
    expect(openapi).toContain("  /v1/observe/anomalies:");
    expect(openapi).toContain("tags: [observe]");
    expect(audit).toContain("Observe CLI API parity — ✅ Resolved 2026-06-16.");
    expect(audit).toContain("OpenAPI Specification v3.2.0");
    expect(audit).not.toContain("only CLI output");
  });
});
