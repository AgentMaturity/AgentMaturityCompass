import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, request, Server, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTrackedSession } from "../src/auth/authApi.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { NATIVE_CSRF_HEADER, NATIVE_INTENT_HEADER, NATIVE_INTENT_VALUE, nativeCsrfTokenForSession } from "../src/studio/nativeAdmission.js";
import { writeControlError, writeControlJson } from "../src/utils/controlHttpResponses.js";
import { initWorkspace } from "../src/workspace.js";
import { createHostUser, createWorkspaceRecord, grantMembership, initHostDb, revokeMembershipRole } from "../src/workspaces/hostDb.js";
import { issueHostSessionToken } from "../src/workspaces/hostAuth.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { landedText } from "./helpers/landedSource.js";

const archive = "unused-code/2026-10-02-native/http-controls";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const map = JSON.parse(readFileSync(resolve(archive, "restoration.json"), "utf8")) as {
  base: string;
  files: Array<{ path: string; archive?: string; sha256?: string; candidateSha256?: string; exactBefore?: string; exactAfter?: string }>;
};
type Writer = (res: ServerResponse, status: number, payload: unknown) => void;

// Execute each full archived module with every unchanged runtime import resolved
// at its real built location. These are real dependency modules, not response stubs.
function originalModule<T>(path: string, writer: string): T & { originalWriter: Writer } {
  const row = map.files.find(value => value.path === path)!;
  const bytes = readFileSync(resolve(row.archive!));
  if (hash(bytes) !== row.sha256) throw new Error("Archived complete HTTP module changed: " + path);
  const filename = resolve(path.replace(/^src\//, "dist/").replace(/\.ts$/, ".js"));
  const compiled = ts.transpileModule(bytes.toString("utf8") + "\nexports.originalWriter = " + writer + ";", {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  });
  if (compiled.diagnostics?.some(value => value.category === ts.DiagnosticCategory.Error)) throw new Error("Original module did not transpile.");
  const exports = {};
  runInNewContext(compiled.outputText, { exports, module: { exports }, require: createRequire(filename),
    process, Buffer, console, URL, Date, Headers, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    __filename: filename, __dirname: resolve(filename, "..") }, { timeout: 10_000 });
  return exports as T & { originalWriter: Writer };
}
const bridgeOriginal = originalModule<typeof import("../src/bridge/bridgeServer.js")>("src/bridge/bridgeServer.ts", "writeJson");
const routerOriginal = originalModule<typeof import("../src/workspaces/workspaceRouter.js")>("src/workspaces/workspaceRouter.ts", "json");
const closers: Array<() => Promise<void>> = [];
const ports: number[] = [];
const browserOrigin = "http://control-http.fixture:41731";
let hostDir: string, workspace: string, bridgeUrls: string[], routerUrls: string[];
let ordinaryLease: string, observeLease: string, controlLease: string, otherTenantLease: string;
let memberCookie: string, outsiderCookie: string, workspaceCookie: string, nativeProof: string;
let member: ReturnType<typeof createHostUser>;
let restoreFixtureClock: (() => void) | undefined;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const address = server.address();
  await new Promise<void>((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()));
  if (!address || typeof address === "string") throw new Error("No local port.");
  return address.port;
}
function lease(scopes: Parameters<typeof issueLeaseToken>[0]["scopes"], workspaceId = "alpha", rpm = 60): string {
  return issueLeaseToken({ workspace, workspaceId, agentId: "default", ttlMs: 30 * 60_000, scopes,
    routeAllowlist: ["/"], modelAllowlist: ["*"], maxRequestsPerMinute: rpm, maxTokensPerMinute: 100_000, maxCostUsdPerDay: null }).token;
}

beforeAll(async () => {
  // Both real routers receive the same measured clock; network and server timers stay real.
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
  restoreFixtureClock = () => clock.mockRestore();
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "http-parity-owned-fixture-passphrase");
  hostDir = mkdtempSync(join(tmpdir(), "amc-control-http-parity-"));
  initHostDb(hostDir);
  for (const id of ["alpha", "beta"]) {
    createWorkspaceRecord({ hostDir, workspaceId: id, name: id });
    initWorkspace({ workspacePath: hostWorkspaceDir(hostDir, id), trustBoundaryMode: "isolated" });
  }
  workspace = hostWorkspaceDir(hostDir, "alpha");
  member = createHostUser({ hostDir, username: "http-member", password: "owned-member-fixture", isHostAdmin: false });
  const outsider = createHostUser({ hostDir, username: "http-outsider", password: "owned-outsider-fixture", isHostAdmin: false });
  grantMembership({ hostDir, username: member.username, workspaceId: "alpha", role: "OPERATOR" });
  memberCookie = "amc_host_session=" + issueHostSessionToken({ hostDir, userId: member.userId, username: member.username, isHostAdmin: false }).token;
  outsiderCookie = "amc_host_session=" + issueHostSessionToken({ hostDir, userId: outsider.userId, username: outsider.username, isHostAdmin: false }).token;
  const session = createTrackedSession({ workspace, userId: member.userId, username: member.username, roles: ["OPERATOR"], ttlMs: 30 * 60_000, authSource: "WORKSPACE_ROUTER" });
  workspaceCookie = "amc_session=" + session.token;
  nativeProof = nativeCsrfTokenForSession(session.payload);
  ordinaryLease = lease(["gateway:llm"]); observeLease = lease(["hook:observe"]); controlLease = lease(["hook:control"]);
  otherTenantLease = lease(["gateway:llm"], "beta");
  bridgeUrls = [];
  for (const start of [bridgeOriginal.startBridgeServer, startBridgeServer]) {
    const runtime = await start({ workspace, host: "127.0.0.1", port: 0, gatewayBaseUrl: "http://127.0.0.1:1", maxRequestBytes: 4096 });
    closers.push(runtime.close);
    const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("Bridge did not bind.");
    ports.push(address.port); bridgeUrls.push(`http://127.0.0.1:${address.port}`);
  }
  routerUrls = [];
  for (const start of [routerOriginal.startWorkspaceRouter, startWorkspaceRouter]) {
    const port = await freePort();
    const runtime = await start({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "alpha", maxRequestBytes: 256, corsAllowedOrigins: [browserOrigin] });
    closers.push(runtime.close); ports.push(port); routerUrls.push(`http://127.0.0.1:${port}`);
  }
}, 60_000);

afterAll(async () => {
  try {
    // Include the real inner Studio runtimes created by each router, as well as
    // the public listeners. No dependency implementation is replaced to observe them.
    for (const handle of (process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles()) {
      if (!(handle instanceof Server)) continue;
      const address = handle.address();
      if (address && typeof address !== "string" && !ports.includes(address.port)) ports.push(address.port);
    }
    for (const close of closers.splice(0).reverse()) await close();
    // Independent socket probes verify closure after the production close promises.
    for (const port of ports) {
      const state = await new Promise<string>(resolvePromise => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolvePromise("still listening"); });
        socket.once("error", (error: NodeJS.ErrnoException) => { socket.destroy(); resolvePromise(error.code ?? "error"); });
        socket.setTimeout(2_000, () => { socket.destroy(); resolvePromise("timeout"); });
      });
      expect(state).toBe("ECONNREFUSED");
    }
  } finally {
    restoreFixtureClock?.();
    vi.unstubAllEnvs();
    if (hostDir) rmSync(hostDir, { recursive: true, force: true });
  }
});

type Wire = { status: number; headers: IncomingHttpHeaders; body: string };
async function wire(base: string, path: string, method = "GET", body = "", headers: Record<string, string> = {}): Promise<Wire> {
  return new Promise((resolvePromise, reject) => {
    const req = request(base + path, { method, headers: { connection: "close", "content-type": "application/json", "content-length": Buffer.byteLength(body), ...headers } }, res => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk)); res.on("error", reject);
      res.on("end", () => {
        // Node generates the Date transport header independently of application code.
        const { date: _date, ...stableHeaders } = res.headers;
        resolvePromise({ status: res.statusCode ?? 0, headers: stableHeaders, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.once("error", reject); req.end(body);
  });
}
async function parity(urls: string[], path: string, method = "GET", body = "", headers: Record<string, string> = {}): Promise<Wire> {
  const before = await wire(urls[0], path, method, body, headers), after = await wire(urls[1], path, method, body, headers);
  expect(after).toEqual(before); return after;
}

const bridgeCases: Array<[string, string, string, string, number, () => Record<string, string>]> = [
  ["unknown public path", "/outside", "GET", "", 404, () => ({})],
  ["unknown bridge path", "/bridge/unknown", "POST", "{}", 404, () => ({})],
  ["method refusal before body parsing", "/bridge/lease/verify", "GET", "{", 405, () => ({})],
  ["invalid JSON", "/bridge/lease/verify", "POST", "{", 400, () => ({})],
  ["null token body", "/bridge/lease/verify", "POST", "null", 400, () => ({})],
  ["wrong token type", "/bridge/lease/verify", "POST", '{"token":42}', 400, () => ({})],
  ["body limit", "/bridge/lease/verify", "POST", " ".repeat(4097), 413, () => ({})],
  ["invalid signature", "/bridge/lease/verify", "POST", '{"token":"invalid.invalid"}', 401, () => ({})],
  ["authentication before invalid hook body", "/bridge/hooks/control/v1", "POST", "{", 401, () => ({ "x-amc-hook-provider": "claude-code" })],
  ["provider header before authentication", "/bridge/hooks/control/v1", "POST", "{", 400, () => ({})],
  ["scope refusal", "/bridge/hooks/control/v1", "POST", "{}", 403, () => ({ "x-amc-hook-provider": "claude-code", "x-amc-lease": ordinaryLease })],
  ["native control invalid input", "/bridge/hooks/control/v1", "POST", "{", 400, () => ({ "x-amc-hook-provider": "claude-code", "x-amc-lease": controlLease })],
  ["observed hook invalid input", "/bridge/hooks/aep/0.1/events", "POST", "{", 400, () => ({ "x-amc-lease": observeLease })],
  ["telemetry schema refusal", "/bridge/telemetry", "POST", "null", 400, () => ({ "x-amc-lease": ordinaryLease })],
  ["evidence required fields", "/bridge/evidence", "POST", "{}", 400, () => ({ "x-amc-lease": ordinaryLease })]
];
describe("actual public bridge HTTP parity", () => {
  it.each(bridgeCases)("%s", async (_name, path, method, body, status, headers) => {
    expect((await parity(bridgeUrls, path, method, body, headers())).status).toBe(status);
  });
  it("keeps health bytes with the same measured application clock input", async () => {
    expect((await parity(bridgeUrls, "/bridge/health")).status).toBe(200);
  });
  it("returns the real signed lease metadata without changing field order or bytes", async () => {
    const result = await parity(bridgeUrls, "/bridge/lease/verify", "POST", JSON.stringify({ token: ordinaryLease }));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ ok: true, valid: true, payload: { workspaceId: "alpha", scopes: ["gateway:llm"] } });
  });
});

const routerCases: Array<[string, string, string, string, number, () => Record<string, string>]> = [
  ["host health", "/host/healthz", "GET", "", 200, () => ({})],
  ["tenant health", "/w/alpha/healthz", "GET", "", 200, () => ({})],
  ["missing host session", "/host/api/users", "GET", "", 401, () => ({})],
  ["host role denial", "/host/api/users", "GET", "", 403, () => ({ cookie: memberCookie })],
  ["host lease refusal", "/host/api/workspaces", "GET", "", 403, () => ({ "x-amc-lease": ordinaryLease })],
  ["missing workspace session", "/w/alpha/api/status", "GET", "", 401, () => ({})],
  ["cross tenant membership refusal", "/w/beta/console", "GET", "", 403, () => ({ cookie: memberCookie })],
  ["outsider membership refusal", "/w/alpha/console", "GET", "", 403, () => ({ cookie: outsiderCookie })],
  ["lease workspace mismatch", "/w/alpha/api/status", "GET", "", 403, () => ({ "x-amc-lease": otherTenantLease })],
  ["malformed lease", "/w/alpha/api/status", "GET", "", 401, () => ({ "x-amc-lease": "invalid.invalid" })],
  ["login JSON parse error", "/host/api/login", "POST", "{", 400, () => ({})],
  ["login body limit", "/host/api/login", "POST", " ".repeat(257), 413, () => ({})],
  ["native authentication", "/w/alpha/api/v1/native-tasks", "POST", "{", 401, () => ({})],
  ["invalid workspace native error", "/w/x/readyz", "GET", "", 500, () => ({})],
  ["default alias query redirect", "/api/status?agentId=default", "GET", "", 307, () => ({})],
  ["not found", "/unmatched", "GET", "", 404, () => ({})]
];
describe("actual public workspace router HTTP parity", () => {
  it.each(routerCases)("%s", async (_name, path, method, body, status, headers) => {
    expect((await parity(routerUrls, path, method, body, headers())).status).toBe(status);
  });
  it("tenant membership refusal remains independent of response sharing", async () => {
    const result = await parity(routerUrls, "/w/beta/console", "GET", "", { cookie: memberCookie });
    expect(result).toMatchObject({ status: 403, body: '{"error":"membership required"}' });
  });
  it("native lease refusal prevents the agent branch bypassing human membership", async () => {
    const result = await parity(routerUrls, "/w/alpha/api/v1/native-tasks/options", "GET", "", { cookie: workspaceCookie, "x-amc-lease": ordinaryLease });
    expect(result).toMatchObject({ status: 403, body: '{"error":"agent leases cannot authorize native task workspace requests"}' });
  });
  it("native browser origin refusal happens before proxy and request parsing", async () => {
    const result = await parity(routerUrls, "/w/alpha/api/v1/native-tasks", "POST", "{", { cookie: workspaceCookie, origin: "https://attacker.invalid" });
    expect(result.status).toBe(403); expect(JSON.parse(result.body).code).toBe("NATIVE_ORIGIN_DENIED");
  });
  it("passes an authenticated native read through both full routers", async () => {
    const result = await parity(routerUrls, "/w/alpha/api/v1/native-tasks/options?agentId=default", "GET", "", { cookie: workspaceCookie });
    expect(result.status).toBe(200);
  });
  it("preserves native invalid JSON after actual signed human browser admission", async () => {
    const responses = [];
    for (const url of routerUrls) responses.push(await wire(url, "/w/alpha/api/v1/native-tasks", "POST", "{", {
      cookie: workspaceCookie, origin: browserOrigin, host: new URL(browserOrigin).host, [NATIVE_CSRF_HEADER]: nativeProof, [NATIVE_INTENT_HEADER]: NATIVE_INTENT_VALUE
    }));
    expect(responses[1]).toEqual(responses[0]); expect(responses[1].status).toBe(400);
  });
  it("refuses a tracked session after its real host membership is revoked", async () => {
    revokeMembershipRole({ hostDir, username: member.username, workspaceId: "alpha", role: "OPERATOR" });
    const result = await parity(routerUrls, "/w/alpha/api/status", "GET", "", { cookie: workspaceCookie });
    expect(result).toMatchObject({ status: 401, body: '{"error":"workspace session authority changed"}' });
    expect(result.headers["set-cookie"]?.[0]).toContain("Max-Age=0");
  });
});

function writerOutcome(fn: Writer, makePayload: (trace: string[]) => unknown) {
  const trace: string[] = [];
  const res = { set statusCode(value: number) { trace.push("status:" + value); },
    setHeader(name: string, value: string) { trace.push("header:" + name + ":" + value); },
    end(value: string | undefined) { trace.push("end:" + String(value)); } } as unknown as ServerResponse;
  try { fn(res, 403, makePayload(trace)); return { trace }; }
  catch (error) { const failure = error as Error; return { trace, error: { name: failure.name, message: failure.message } }; }
}
it("preserves response operation, getter/toJSON order and native serialization failures", () => {
  const cases: Array<(trace: string[]) => unknown> = [
    () => undefined, () => null, () => ({ error: undefined }), () => ({ error: "拒否 🤖\n" }),
    trace => ({ get error() { trace.push("get:error"); return "denied"; }, get code() { trace.push("get:code"); return "CODE"; } }),
    trace => ({ toJSON() { trace.push("toJSON"); return { ok: false }; } }),
    () => ({ error: 1n }),
    () => { const value: { self?: unknown } = {}; value.self = value; return value; },
    trace => ({ get error() { trace.push("get:error"); throw new TypeError("payload getter refused"); } })
  ];
  for (const original of [bridgeOriginal.originalWriter, routerOriginal.originalWriter]) {
    for (const make of cases) expect(writerOutcome(writeControlJson, make)).toEqual(writerOutcome(original, make));
    for (const make of cases) expect(writerOutcome(writeControlError, make)).toEqual(writerOutcome((res, status, error) => original(res, status, { error }), make));
  }
});
it("freezes full original modules and bounds every intentional response edit", () => {
  expect(map.base).toBe("b30e1c771b89e23ecedb13604cc0bf9102078136");
  for (const row of map.files.filter(value => value.exactBefore)) {
    expect(readFileSync(resolve(row.archive!), "utf8")).toBe(row.exactBefore);
    const current = landedText(row.path);
    expect(current).toBe(row.exactAfter); expect(hash(current)).toBe(row.candidateSha256);
    // The exact candidate-to-full-original reversal leaves all route/policy
    // declarations byte-identical, rather than deriving the baseline from copies.
    expect(hash(row.exactBefore!)).toBe(row.sha256);
  }
});
