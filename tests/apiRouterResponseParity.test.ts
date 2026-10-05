import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request, type IncomingHttpHeaders } from "node:http";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import * as projections from "../src/api/routerResponseHelpers.js";

const archive = "unused-code/2026-10-02-native/api-router-responses";
const restoration = JSON.parse(readFileSync(resolve(archive, "restoration.json"), "utf8")) as {
  files: Array<{ path: string; archive?: string; sha256?: string }>;
  edits: Array<{ path: string; family: string; exactBefore: string; exactAfter: string }>;
};
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Runtime = Awaited<ReturnType<typeof import("../src/studio/studioServer.js").startStudioApiServer>>;

// Each side executes complete modules, including the unchanged real Studio consumer,
// dispatcher and admission layer. All other imports use their real built dependencies.
// Only full original/current source modules are selected; no dependency response is mocked.
function modules(original: boolean) {
  const cache = new Map<string, string>();
  const paths = new Set(restoration.files.filter(row => row.archive && row.path.startsWith("src/")).map(row => row.path));
  if (!original) paths.add("src/api/routerResponseHelpers.ts");
  const url = (path: string): string => {
    const cached = cache.get(path); if (cached) return cached;
    const row = restoration.files.find(value => value.path === path);
    const bytes = readFileSync(resolve(original ? row!.archive! : path));
    if (original && hash(bytes) !== row!.sha256) throw new Error("Complete original changed: " + path);
    if (!original && row?.archive && !["src/api/scoreRouter.ts", "src/api/shieldRouter.ts", "src/api/watchRouter.ts"].includes(path)
      && hash(bytes) !== row.sha256) throw new Error("Read-only dependency changed: " + path);
    const filename = resolve(path.replace(/^src\//, "dist/").replace(/\.ts$/, ".js"));
    const compiled = ts.transpileModule(bytes.toString("utf8"), { fileName: path, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
    if (compiled.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) throw new Error("Transpile failed: " + path);
    const resolvedSource = compiled.outputText.replace(/\b(from\s+|import\s*\(\s*|import\s+)(["'])([^"']+)\2/g,
      (_match, prefix: string, quote: string, specifier: string) => {
        if (specifier.startsWith("node:")) return prefix + quote + specifier + quote;
        if (!specifier.startsWith(".")) {
          const packageFile = createRequire(filename).resolve(specifier + "/package.json");
          const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
          const select = (value: unknown): string | undefined => {
            if (typeof value === "string") return value;
            if (!value || typeof value !== "object") return undefined;
            for (const condition of ["node", "import", "default"]) {
              const selected = select((value as Record<string, unknown>)[condition]); if (selected) return selected;
            }
            return undefined;
          };
          const entry = select(pkg.exports?.["."] ?? pkg.exports ?? pkg.module ?? pkg.main);
          if (!entry) throw new Error("No real Node import entry: " + specifier);
          return prefix + quote + pathToFileURL(resolve(dirname(packageFile), entry)).href + quote;
        }
        const resolved = resolve(dirname(filename), specifier);
        const source = resolved.startsWith(resolve("dist") + "/")
          ? "src/" + resolved.slice(resolve("dist").length + 1).replace(/\.js$/, ".ts") : "";
        return prefix + quote + (paths.has(source) ? url(source) : pathToFileURL(resolved).href) + quote;
      });
    const value = "data:text/javascript;base64," + Buffer.from(resolvedSource).toString("base64");
    cache.set(path, value); return value;
  };
  return { load: (path: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ url(path)) };
}

const laneSpecs: Array<[string, string, string[]]> = [
  ["promptLayer", "provider-drift", ["promptVersionId", "providerRouteId"]],
  ["promptfoo", "promptfoo-provider-drift", ["promptfooVersion"]],
  ["patronus", "patronus-provider-drift", ["projectId", "evaluationRunId"]],
  ["inspect", "inspect-provider-drift", ["taskId", "evalRunId", "inspectVersion", "providerRouteId"]],
  ["tensorZero", "tensorzero-provider-drift", ["tensorZeroVersion", "providerRouteId", "evaluationRunId"]],
  ["helm", "helm-provider-drift", ["helmVersion", "scenarioSuiteId", "runId", "providerRouteId"]],
  ["humanloop", "humanloop-provider-drift", ["fileVersionId", "environmentId", "evaluationRunId", "providerRouteId"]],
];
function fieldList(source: string, name: string): string[] {
  const value = source.match(new RegExp("const " + name + "[^=]*= \\[([\\s\\S]*?)\\];"))?.[1];
  if (!value) throw new Error("Missing metadata field list: " + name);
  return [...value.matchAll(/"([^"\n]+)"/g)].map(row => row[1]);
}
function row(): ProviderDriftCanaryRow {
  return { provider: "fixture-provider", model: "fixture-model", version: "v1", canaryId: "router-canary",
    sampleSize: 48, scoreMean0to1: 0.9, refusalRate0to1: 0.02, latencyMsP95: 1200,
    costUsdMean: 0.005, evidenceRefs: ["fixture:row"], signedEvidenceRefs: ["fixture:signed-ref"] };
}
function body(lane: typeof laneSpecs[number], incomplete = false): Record<string, any> {
  const source = readFileSync(resolve("src/benchmarks/" + lane[0] + "ProviderDrift.ts"), "utf8");
  const metadata = { provider: row().provider, model: row().model, canaryId: row().canaryId, providerVersion: "v1",
    ...Object.fromEntries(lane[2].map(field => [field, "fixture-id"])),
    ...Object.fromEntries(fieldList(source, "REQUIRED_HASH_FIELDS").map(field => [field, "a".repeat(64)])),
    metricIds: ["score", "latency"], metricCount: 2, ...(lane[0] === "inspect" ? { scorerIds: ["scorer"] } : {}) };
  return { agentId: "router-fixture", baseline: [row()], candidate: [row()],
    [lane[0]]: { baseline: [metadata], candidate: incomplete ? [] : [metadata] },
    ...(["promptLayer", "promptfoo"].includes(lane[0]) ? {} : { now: "2026-06-20T00:00:00.000Z" }) };
}

let fixture: string, cookie: string, viewerCookie: string, otherCookie: string, leaseToken: string;
const runtimes: Runtime[] = [], ports: number[] = [];
const originals = modules(true), current = modules(false);
beforeAll(async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "api-router-owned-fixture-passphrase");
  // Fix only Date so independent quota windows and default receipt timestamps agree.
  // Timers, signing, auth, request parsing and every product dependency remain real.
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-06-20T00:00:00.000Z");
  const actualRequire = createRequire(resolve("dist/workspace.js"));
  const { initWorkspace } = actualRequire("./workspace.js") as typeof import("../src/workspace.js");
  const { createTrackedSession, addUser, initUsersConfig } = actualRequire("./auth/authApi.js") as typeof import("../src/auth/authApi.js");
  const { issueLeaseToken } = actualRequire("./leases/leaseSigner.js") as typeof import("../src/leases/leaseSigner.js");
  fixture = mkdtempSync(join(tmpdir(), "amc-api-router-parity-"));
  const workspace = join(fixture, "alpha"), other = join(fixture, "beta");
  for (const workspacePath of [workspace, other]) {
    initWorkspace({ workspacePath, trustBoundaryMode: "isolated" });
    initUsersConfig({ workspace: workspacePath, username: "router-owner", password: "owned-router-owner-fixture" });
  }
  const session = (workspace: string, roles: Parameters<typeof createTrackedSession>[0]["roles"]) => {
    const user = addUser({ workspace, username: "router-" + roles[0], roles, password: "owned-router-user-fixture" });
    return "amc_session=" + createTrackedSession({ workspace, userId: user.userId, username: user.username, roles,
      ttlMs: 600_000, authSource: "LOCAL_USER" }).token;
  };
  cookie = session(workspace, ["OPERATOR"]); viewerCookie = session(workspace, ["VIEWER"]); otherCookie = session(other, ["OPERATOR"]);
  leaseToken = issueLeaseToken({ workspace, workspaceId: "default", agentId: "default", ttlMs: 600_000, scopes: ["gateway:llm"],
    routeAllowlist: ["/"], modelAllowlist: ["*"], maxRequestsPerMinute: 100, maxTokensPerMinute: 100_000, maxCostUsdPerDay: null }).token;
  for (const set of [originals, current]) {
    const start = (await set.load("src/studio/studioServer.ts")).startStudioApiServer as typeof import("../src/studio/studioServer.js").startStudioApiServer;
    const runtime = await start({ workspace, host: "127.0.0.1", port: 0, token: "api-router-fixture-admin", maxRequestBytes: 2_000_000 });
    runtimes.push(runtime); const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("Studio did not bind."); ports.push(address.port);
  }
}, 60_000);
afterAll(async () => {
  try {
    for (const runtime of runtimes.reverse()) { runtime.server.closeAllConnections(); await runtime.close(); }
    for (const port of ports) await new Promise<void>((done, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); reject(new Error("Owned Studio listener remains: " + port)); });
      socket.once("error", (error: NodeJS.ErrnoException) => error.code === "ECONNREFUSED" ? done() : reject(error));
    });
  } finally { if (fixture) rmSync(fixture, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); }
});

type Wire = { status: number; statusMessage: string; rawHeaders: string[]; body: Buffer };
async function call(port: number, path: string, method: string, payload?: unknown, headers: IncomingHttpHeaders = { cookie }): Promise<Wire> {
  const data = typeof payload === "string" ? payload : payload === undefined ? "" : JSON.stringify(payload);
  return new Promise((done, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { ...headers, Connection: "close", "Content-Type": "application/json" } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.once("error", reject);
      res.once("end", () => { const rawHeaders: string[] = [];
        // Date is generated by Node's transport independently of application response bytes.
        for (let i = 0; i < res.rawHeaders.length; i += 2) if (res.rawHeaders[i].toLowerCase() !== "date") rawHeaders.push(res.rawHeaders[i], res.rawHeaders[i + 1]);
        done({ status: res.statusCode!, statusMessage: res.statusMessage!, rawHeaders, body: Buffer.concat(chunks) });
      });
    }); req.once("error", reject); req.setTimeout(10_000, () => req.destroy(new Error("Router HTTP timeout"))); req.end(data);
  });
}
async function parity(path: string, method: string, payload?: unknown, headers?: IncomingHttpHeaders): Promise<Wire> {
  const before = await call(ports[0], path, method, payload, headers), after = await call(ports[1], path, method, payload, headers);
  expect({ ...after, body: after.body.toString("utf8") }).toEqual({ ...before, body: before.body.toString("utf8") });
  expect(after.body).toEqual(before.body); return after;
}

for (const lane of laneSpecs) for (const surface of ["score", "shield", "watch", "benchmarks"]) {
  if (lane[0] === "humanloop" && surface !== "watch") continue;
  if (surface === "benchmarks" && ["promptLayer", "patronus"].includes(lane[0])) continue;
  const path = "/api/v1/" + surface + "/" + lane[1] + (surface === "shield" ? "/verify" : "");
  describe(surface + " " + lane[0] + " actual public HTTP", () => {
    test("complete evidence preserves raw response", async () => {
      const wire = await parity(path, "POST", body(lane)); expect(wire.status).toBe(200);
      const result = JSON.parse(wire.body.toString()).data; expect(result.report?.failClosed ?? result.failClosed).toBe(false);
    });
    test("incomplete evidence remains fail closed", async () => {
      const wire = await parity(path, "POST", body(lane, true)); expect(wire.status).toBe(200);
      const result = JSON.parse(wire.body.toString()).data; expect(result.report?.failClosed ?? result.failClosed).toBe(true);
      if (surface === "shield") { expect(result.verification).toBe("blocked"); expect(result.activeAlerts.length).toBeGreaterThan(0); }
    });
    test("required provider metadata guard", async () => {
      const value = body(lane); delete value[lane[0]];
      const wire = await parity(path, "POST", value); expect(wire.status).toBe(400); expect(JSON.parse(wire.body.toString()).error).toContain("Required:");
    });
    test("native invalid JSON error policy", async () => {
      const wire = await parity(path, "POST", "{"); expect(wire.status).toBe(surface === "watch" || surface === "benchmarks" ? 500 : 400);
    });
    test("real computation error policy", async () => {
      const wire = await parity(path, "POST", { ...body(lane), now: "invalid-time" });
      expect(wire.status).toBe(surface === "shield" ? 400 : 500);
    });
  });
}
describe("unchanged public admission and other owned routes", () => {
  test.each(["score", "watch", "shield"])("%s status/auth/tenant/lease contract", async surface => {
    const path = "/api/v1/" + surface + "/status";
    expect((await parity(path, "GET")).status).toBe(200);
    expect((await parity(path, "GET", undefined, {})).status).toBe(401);
    expect((await parity(path, "GET", undefined, { cookie: otherCookie })).status).toBe(401);
    expect((await parity(path, "GET", undefined, { "x-amc-lease": leaseToken })).status).toBe(403);
  });
  test("viewer operation refusal and analyzer admission", async () => {
    expect((await parity("/api/v1/score/helm-provider-drift", "POST", body(laneSpecs[5]), { cookie: viewerCookie })).status).toBe(403);
    expect((await parity("/api/v1/shield/helm-provider-drift/verify", "POST", body(laneSpecs[5]), { cookie: viewerCookie })).status).toBe(200);
  });
  test.each(["/api/v1/score/unknown", "/api/v1/export/unknown", "/api/v1/benchmarks/unknown"])("unknown route %s", async path => {
    expect((await parity(path, "GET")).status).toBe(404);
  });
  test("export badge and validation contract", async () => {
    expect((await parity("/api/v1/export/badge/url?level=4&label=Router", "GET")).status).toBe(200);
    expect((await parity("/api/v1/export/badge/generate?level=2", "GET")).status).toBe(200);
    expect((await parity("/api/v1/export/badge/url?level=8", "GET")).status).toBe(400);
    expect((await parity("/api/v1/export/policy", "POST", {})).status).toBe(400);
    expect((await parity("/api/v1/export/policy", "POST", "{")).status).toBe(500);
  });
  test("watch invalid identifiers remain refused", async () => {
    expect((await parity("/api/v1/watch/hook-actions/bad%2Fid", "GET")).status).toBe(400);
    expect((await parity("/api/v1/watch/hooks/%ZZ/health", "GET")).status).toBe(400);
    expect((await parity("/api/v1/watch/hooks/claude-code/health", "POST", {})).status).toBe(405);
  });
  test("score schema guard and oversized body keep native status", async () => {
    expect((await parity("/api/v1/score/quick", "POST", { answers: { q: 6 } })).status).toBe(400);
    expect((await parity("/api/v1/score/helm-provider-drift", "POST", "x".repeat(1_048_577))).status).toBe(413);
  });
  test("complete router export contracts", async () => {
    for (const path of ["score", "watch", "shield", "benchmark", "export"].map(name => "src/api/" + name + "Router.ts")) {
      expect(Object.keys(await current.load(path))).toEqual(Object.keys(await originals.load(path)));
    }
  });
});

describe("projection evaluation order from archived authored literals", () => {
  for (const edit of restoration.edits.filter(row => row.family !== "import")) test(edit.path + " " + edit.family, () => {
    const key = edit.family + "EvidenceHash";
    const fn = edit.exactAfter.match(/\.\.\.(\w+)\(result|apiSuccess\(res, (\w+)\(result/);
    if (!fn) throw new Error("Missing projection helper.");
    const helper = projections[(fn[1] ?? fn[2]) as keyof typeof projections] as (result: any, field: string) => unknown;
    const trace = (original: boolean) => {
      const events: string[] = [];
      const wrap = (value: any, path: string): any => value && typeof value === "object" ? new Proxy(value, {
        get: (target, property, receiver) => { events.push(path + "." + String(property)); return wrap(Reflect.get(target, property, receiver), path + "." + String(property)); }
      }) : value;
      const result = wrap({ report: { providerVersions: ["v"], comparisons: [{ canaryId: "c", provider: "p", model: "m", driftStatistic: 1, status: "passed" }],
        failClosed: true, alerts: [{ waived: false, alertId: "active" }, { waived: true, alertId: "waived" }] },
        ciGate: { passed: false }, score: { providerVersions: ["v"], canaryResults: [], driftStatistics: [] },
        shield: {}, watch: {}, watchAlerts: [], sourceRefs: ["ref"], [key]: "hash" }, "result");
      const literal = edit.exactBefore.slice(edit.exactBefore.indexOf("{") + 1, edit.exactBefore.lastIndexOf("}"));
      const projected = original ? runInNewContext("({" + literal + "})", { result }) : helper(result, key);
      const payload = !original && edit.exactAfter.includes("shield: result.shield") ? { ...(projected as object), shield: result.shield, sourceRefs: result.sourceRefs } : projected;
      const reads = [...events], bytes = JSON.stringify(payload);
      return { reads, bytes, serializationReads: events.slice(reads.length) };
    };
    expect(trace(false)).toEqual(trace(true));
  });
});
