import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";
import {
  runLiveScoreBehaviorDrift,
  type LiveDriftSampleRow,
  type RunLiveScoreBehaviorDriftInput,
} from "../src/watch/liveDriftAlerts.js";

const malformedEvidenceCases: Array<{ name: string; value: unknown }> = [
  {
    name: "mixed invalid array",
    value: [null, 42, {}, false, "", "   "],
  },
  {
    name: "null",
    value: null,
  },
  {
    name: "non-array string",
    value: "evidence:scalar-not-an-array",
  },
  {
    name: "non-array object",
    value: { evidence: "not-an-array" },
  },
];

function sampleRow(
  phase: "baseline" | "live",
  index: number,
  evidenceRefs: unknown,
): LiveDriftSampleRow {
  return {
    traceId: `${phase}-${index}`,
    scenarioId: `scenario-${index}`,
    timestamp: `2026-07-29T0${phase === "baseline" ? 0 : 1}:0${index}:00.000Z`,
    score0to1: 0.9,
    passed: true,
    refused: false,
    errored: false,
    behaviorSignature: `stable-behavior-${index}`,
    toolCallCount: 1,
    latencyMs: 100,
    costUsd: 0.001,
    evidenceRefs,
    signedEvidenceRefs: evidenceRefs,
  } as unknown as LiveDriftSampleRow;
}

function liveDriftInput(evidenceRefs: unknown): RunLiveScoreBehaviorDriftInput {
  return {
    agentId: "evidence-trust-boundary",
    baselineWindow: {
      windowId: "baseline-evidence-trust-boundary",
      startedAt: "2026-07-29T00:00:00.000Z",
      endedAt: "2026-07-29T00:05:00.000Z",
      rows: [0, 1, 2].map((index) => sampleRow("baseline", index, evidenceRefs)),
    },
    liveWindow: {
      windowId: "live-evidence-trust-boundary",
      startedAt: "2026-07-29T01:00:00.000Z",
      endedAt: "2026-07-29T01:05:00.000Z",
      rows: [0, 1, 2].map((index) => sampleRow("live", index, evidenceRefs)),
    },
  };
}

function mockRequest(pathname: string, body: unknown): IncomingMessage {
  const payload = JSON.stringify(body);
  const req = Readable.from([Buffer.from(payload, "utf8")]) as unknown as IncomingMessage;
  (req as { method?: string }).method = "POST";
  (req as { url?: string }).url = pathname;
  return req;
}

function mockResponse(): {
  res: ServerResponse;
  state: { statusCode: number; body: string };
} {
  const state = { statusCode: 0, body: "" };
  const res = {
    writeHead: (statusCode: number) => {
      state.statusCode = statusCode;
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

function expectFailClosedReceipt(receipt: {
  failClosed: boolean;
  alerts: Array<{ metricId: string }>;
  baselineRows: Array<{ evidenceRefs: string[]; signedEvidenceRefs: string[] }>;
  liveRows: Array<{ evidenceRefs: string[]; signedEvidenceRefs: string[] }>;
}): void {
  expect(receipt.failClosed).toBe(true);
  expect(receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
    "evidenceRefs",
    "signedEvidenceRefs",
  ]));
  expect([...receipt.baselineRows, ...receipt.liveRows].every((row) => (
    row.evidenceRefs.length === 0 && row.signedEvidenceRefs.length === 0
  ))).toBe(true);
}

describe("live drift evidence trust boundary", () => {
  test.each(malformedEvidenceCases)(
    "runner fails closed without throwing for $name evidence references",
    ({ value }) => {
      const receipt = runLiveScoreBehaviorDrift(liveDriftInput(value));

      expectFailClosedReceipt(receipt);
    },
  );

  test.each([
    {
      name: "Watch",
      pathname: "/api/v1/watch/live-drift",
      handler: handleWatchRoute,
    },
    {
      name: "Score",
      pathname: "/api/v1/score/live-drift",
      handler: handleScoreRoute,
    },
  ].flatMap((route) => malformedEvidenceCases.map((evidence) => ({
    ...route,
    evidenceName: evidence.name,
    value: evidence.value,
  }))))(
    "$name API returns a fail-closed receipt for $evidenceName evidence references",
    async ({ pathname, handler, value }) => {
      const req = mockRequest(pathname, liveDriftInput(value));
      const { res, state } = mockResponse();

      const handled = await handler(pathname, "POST", req, res, process.cwd());
      const payload = JSON.parse(state.body);

      expect(handled).toBe(true);
      expect(state.statusCode).toBe(200);
      expect(payload.ok).toBe(true);
      expectFailClosedReceipt(payload.data.receipt);
    },
  );
});
