import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiError, apiInternalError } from "../src/api/apiHelpers.js";
import { handleApiRoute } from "../src/api/index.js";
import { setApiLogSink, type ApiErrorLogLine } from "../src/api/requestContext.js";

// Module mocks: kept out of apiRequestId.test.ts so the real routers run there.
vi.mock("../src/api/scoreRouter.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/scoreRouter.js")>()),
  handleScoreRoute: vi.fn(async () => {
    throw new Error("SQLITE_BUSY: database is locked at /Users/alice/.amc/amc.db");
  })
}));
vi.mock("../src/benchmarks/benchStore.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/benchmarks/benchStore.js")>()),
  listImportedBenchmarks: vi.fn(() => {
    throw new Error("EACCES: permission denied, open '/Users/alice/.amc/benchmarks/index.json'");
  })
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let lines: ApiErrorLogLine[] = [];

beforeEach(() => {
  lines = [];
  setApiLogSink((line) => { lines.push(line); });
});
afterEach(() => setApiLogSink(null));

function responseDouble(headersSent = false) {
  const state = { writeHeads: 0, destroys: 0, status: 0, headers: {} as Record<string, unknown>, body: "" };
  const res = {
    headersSent,
    writeHead(status: number, headers: Record<string, unknown> = {}) {
      state.writeHeads += 1;
      state.status = status;
      state.headers = headers;
      return res;
    },
    end(chunk?: string) { if (chunk) state.body += chunk; },
    destroy() { state.destroys += 1; }
  };
  return { res: res as unknown as ServerResponse, state };
}

async function get(pathname: string) {
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, { method: "GET", url: pathname, headers: {} });
  const { res, state } = responseDouble();
  expect(await handleApiRoute(pathname, "GET", req, res, process.cwd())).toBe(true);
  return state;
}

describe("internal errors never reach the response body (P1-55)", () => {
  test("a throwing router is a generic 500 with an id; the detail is only in the error log line", async () => {
    const state = await get("/api/v1/score/status");
    const body = JSON.parse(state.body) as { requestId: string };
    expect(state.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error", requestId: body.requestId });
    expect(body.requestId).toMatch(UUID);
    expect(state.headers["X-Request-Id"]).toBe(body.requestId);
    expect(state.body).not.toContain("SQLITE");
    expect(state.body).not.toContain("/Users/alice");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "error", requestId: body.requestId, method: "GET", path: "/api/v1/score/status", status: 500,
      error: "Internal server error", detail: { name: "Error" }
    });
    expect(lines[0]!.detail!.message).toContain("SQLITE_BUSY");
    expect(lines[0]!.detail!.stack!.split("\n").length).toBeLessThanOrEqual(10);
  });

  test("a router catch that passes err.message to a 500 is generic too (the 286 router-level sites)", async () => {
    const state = await get("/api/v1/benchmarks");
    const body = JSON.parse(state.body) as { requestId: string };
    expect(state.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error", requestId: body.requestId });
    expect(state.body).not.toContain("EACCES");
    expect(state.body).not.toContain("/Users/alice");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error", requestId: body.requestId, status: 500 });
    expect(lines[0]!.detail!.message).toContain("EACCES");
  });

  test("after headers are sent the error is logged and the socket destroyed, nothing written", () => {
    const { res, state } = responseDouble(true);
    apiInternalError(res, new Error("stream broke midway"));
    expect(state.writeHeads).toBe(0);
    expect(state.destroys).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error", status: 500, method: "unknown", path: "unknown" });
    expect(lines[0]!.requestId).toMatch(UUID);
    expect(lines[0]!.detail!.message).toBe("stream broke midway");
  });

  test("a deliberate 503 keeps its message and gains an id", () => {
    const { res, state } = responseDouble();
    apiError(res, 503, "no agent under test reachable: x. y");
    const body = JSON.parse(state.body) as { requestId: string };
    expect(state.status).toBe(503);
    expect(body).toEqual({ ok: false, error: "no agent under test reachable: x. y", requestId: body.requestId });
    expect(body.requestId).toMatch(UUID);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error", status: 503, requestId: body.requestId });
    expect(lines[0]!.detail).toBeUndefined();
  });

  test("the log line redacts secrets and caps the detail", () => {
    const { res } = responseDouble();
    apiError(res, 500, `upstream refused Bearer abcdef0123456789 ${"y".repeat(5_000)}`);
    const detail = lines[0]!.detail!;
    expect(detail.message).not.toContain("abcdef0123456789");
    expect(detail.message).toContain("<AMC_REDACTED>");
    expect(detail.message.length).toBeLessThanOrEqual(2_000);
  });
});
