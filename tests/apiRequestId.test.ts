import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { handleComplianceRoute } from "../src/api/complianceRouter.js";
import { resolveRequestId, setApiLogSink, type ApiErrorLogLine } from "../src/api/requestContext.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OVERSIZED = "x".repeat(1_048_577);
const TOO_LARGE = "JSON body exceeds 1048576 bytes";
const workspace = mkdtempSync(join(tmpdir(), "amc-api-request-id-"));
let lines: ApiErrorLogLine[] = [];

beforeEach(() => {
  lines = [];
  setApiLogSink((line) => { lines.push(line); });
});
afterEach(() => setApiLogSink(null));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

function requestDouble(method: string, url: string, body = "", headers: Record<string, unknown> = {}): IncomingMessage {
  const req = Readable.from(body ? [Buffer.from(body, "utf8")] : []) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers });
  return req;
}

/** The apiRouters mockRes pattern, plus setHeader so the bound header is visible too. */
function responseDouble() {
  const state = { status: 0, headers: {} as Record<string, unknown>, set: {} as Record<string, unknown>, body: "" };
  const res = {
    headersSent: false,
    setHeader(name: string, value: unknown) { state.set[name.toLowerCase()] = value; },
    writeHead(status: number, headers: Record<string, unknown> = {}) {
      state.status = status;
      state.headers = headers;
      res.headersSent = true;
      return res;
    },
    end(chunk?: string) { if (chunk) state.body += chunk; }
  };
  return { res: res as unknown as ServerResponse, state };
}

async function call(method: string, url: string, body?: string, route = handleApiRoute) {
  const pathname = url.split("?")[0]!;
  const { res, state } = responseDouble();
  expect(await route(pathname, method, requestDouble(method, url, body), res, workspace)).toBe(true);
  const json = JSON.parse(state.body) as { ok: boolean; error?: string; requestId?: string };
  return { status: state.status, json, header: state.headers["X-Request-Id"], bound: state.set["x-request-id"] };
}

function expectOneLine(requestId: string | undefined, status: number, method: string, path: string): ApiErrorLogLine {
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ level: status >= 500 ? "error" : "warn", requestId, method, path, status });
  return lines[0]!;
}

describe("API request ids on error responses (P1-55)", () => {
  test("a schema-invalid body is 400 with a server UUID in the body, the header and one warn line", async () => {
    const out = await call("POST", "/api/v1/score/session", JSON.stringify({ agentId: 42 }));
    expect(out.status).toBe(400);
    expect(out.json.error).toMatch(/^Invalid request body/);
    expect(out.json.requestId).toMatch(UUID);
    expect(out.header).toBe(out.json.requestId);
    expect(out.bound).toBe(out.json.requestId);
    const line = expectOneLine(out.json.requestId, 400, "POST", "/api/v1/score/session");
    expect(line.error).toBe(out.json.error);
    expect(line.detail).toBeUndefined();
  });

  test("malformed JSON is 400 Invalid JSON body with an id", async () => {
    const out = await call("POST", "/api/v1/score/session", "{");
    expect(out.status).toBe(400);
    expect(out.json).toEqual({ ok: false, error: "Invalid JSON body", requestId: out.header });
    expect(out.json.requestId).toMatch(UUID);
    expectOneLine(out.json.requestId, 400, "POST", "/api/v1/score/session");
  });

  test("an oversized body is 413 with an id and a log line", async () => {
    const out = await call("POST", "/api/v1/score/session", OVERSIZED);
    expect(out.status).toBe(413);
    expect(out.json).toEqual({ ok: false, error: TOO_LARGE, requestId: out.header });
    expectOneLine(out.json.requestId, 413, "POST", "/api/v1/score/session");
  });

  test("an oversized body on the evidence-logic compile route is 413, not 400", async () => {
    const out = await call("POST", "/api/v1/policy/action/evidence-logic/compile", OVERSIZED);
    expect(out.status).toBe(413);
    expect(out.json.error).toBe(TOO_LARGE);
    expectOneLine(out.json.requestId, 413, "POST", "/api/v1/policy/action/evidence-logic/compile");
  });

  test("the compliance router's own status and message helpers keep a body-limit 413", async () => {
    const out = await call("POST", "/api/v1/policy/action/evidence-logic/compile", OVERSIZED, handleComplianceRoute);
    expect(out.status).toBe(413);
    expect(out.json.error).toBe(TOO_LARGE);
  });

  test("a streamed oversized body is 413 even where the route's own catch answers 500", async () => {
    const out = await call("POST", "/api/v1/watch/guard", OVERSIZED);
    expect(out.status).toBe(413);
    expect(out.json).toEqual({ ok: false, error: TOO_LARGE, requestId: out.header });
    expectOneLine(out.json.requestId, 413, "POST", "/api/v1/watch/guard");
  });

  test("the log line's path carries no query string", async () => {
    const out = await call("GET", "/api/v1/policy/action/evidence-logic?token=secret-123");
    expect(out.status).toBe(400);
    const line = expectOneLine(out.json.requestId, 400, "GET", "/api/v1/policy/action/evidence-logic");
    expect(JSON.stringify(line)).not.toContain("secret-123");
    expect(JSON.stringify(line)).not.toContain("?");
  });
});

describe("request ids over a real socket (P1-55)", () => {
  async function withServer<T>(run: (base: string) => Promise<T>): Promise<T> {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      void handleApiRoute(url.pathname, (req.method ?? "GET").toUpperCase(), req, res, workspace);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  test("a success carries a server-generated x-request-id and the dispatcher ignores an inbound one", async () => {
    await withServer(async (base) => {
      const plain = await fetch(`${base}/api/v1/score/status`);
      expect(plain.status).toBe(200);
      expect(plain.headers.get("x-request-id")).toMatch(UUID);
      const inbound = await fetch(`${base}/api/v1/score/status`, { headers: { "x-request-id": "trace-0001-abcd" } });
      expect(inbound.status).toBe(200);
      expect(inbound.headers.get("x-request-id")).toMatch(UUID);
    });
  });

  test("a declared oversized body is 413 before the route runs, even on a route that never reads its body", async () => {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/v1/enforce/formal/tla-spec`, { method: "POST", body: OVERSIZED });
      expect(response.status).toBe(413);
      const json = await response.json() as { error: string; requestId: string };
      expect(json.error).toBe(TOO_LARGE);
      expect(response.headers.get("x-request-id")).toBe(json.requestId);
      expectOneLine(json.requestId, 413, "POST", "/api/v1/enforce/formal/tla-spec");
    });
  });
});

describe("Studio honours an inbound id only from a trusted forwarder (P1-55)", () => {
  async function studioIds(trustedProxyHops: number, headers: Record<string, string>[]): Promise<(string | null)[]> {
    const dir = mkdtempSync(join(tmpdir(), "amc-studio-request-id-"));
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    const api = await startStudioApiServer({ workspace: dir, host: "127.0.0.1", port: 0, token: "test-token", trustedProxyHops });
    try {
      const ids: (string | null)[] = [];
      for (const header of headers) ids.push((await fetch(`${api.url}/api/v1/health`, { headers: header })).headers.get("x-request-id"));
      const unauthenticated = await fetch(`${api.url}/api/v1/score/status`);
      expect(unauthenticated.status).toBe(401);
      ids.push(unauthenticated.headers.get("x-request-id"));
      return ids;
    } finally {
      await api.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("behind a trusted proxy a valid id is echoed and an invalid one replaced", async () => {
    const [valid, invalid, studioOwn] = await studioIds(1, [{ "x-request-id": "trace-0001-abcd" }, { "x-request-id": "short" }]);
    expect(valid).toBe("trace-0001-abcd");
    expect(invalid).toMatch(UUID);
    expect(studioOwn).toMatch(UUID);
  });

  test("without a trusted proxy the inbound id is ignored", async () => {
    const [ignored] = await studioIds(0, [{ "x-request-id": "trace-0001-abcd" }]);
    expect(ignored).toMatch(UUID);
  });
});

describe("resolveRequestId (P1-55)", () => {
  const resolveWith = (value: unknown, trustInbound = true) =>
    resolveRequestId(requestDouble("GET", "/", "", { "x-request-id": value }), { trustInbound });

  test("keeps a valid inbound id only when the inbound header is trusted", () => {
    expect(resolveWith("trace-0001-abcd")).toBe("trace-0001-abcd");
    expect(resolveWith("trace-0001-abcd", false)).toMatch(UUID);
  });

  test.each([
    ["too short", "short"],
    ["spaces", "a b c d e f g h"],
    ["over 128 characters", "x".repeat(129)],
    ["CR/LF injection", "abc\r\nInjected: 1"],
    ["a two-value header", ["trace-0001-abcd", "trace-0002-abcd"]]
  ])("replaces %s with a fresh UUID", (_label, value) => {
    const id = resolveWith(value);
    expect(id).toMatch(UUID);
    expect(resolveWith(value)).not.toBe(id);
  });
});
