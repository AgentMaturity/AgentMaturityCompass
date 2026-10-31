/**
 * P0-55 follow-up (pending-checks P1-66): the shell egress proxy connects to every checked address in order, as the
 * gateway proxy does, and records which one it reached. The first checked address refuses; the second listens.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("node:dns/promises", async (original) => {
  const actual = await original<typeof import("node:dns/promises")>();
  const lookup = (async (host: string, options?: unknown) => host === "dual.test"
    ? [{ address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }]
    : actual.lookup(host, options as never)) as typeof actual.lookup;
  return { ...actual, lookup, default: { ...actual, lookup } };
});

const { startShellEgressProxy } = await import("../../src/sandbox/egress/shellEgressProxy.js");
const { initWorkspace } = await import("../../src/workspace.js");
type Row = Parameters<Parameters<typeof startShellEgressProxy>[0]["record"]>[0];

let root: string;
let workspace: string;
let origin: Server;
let port: number;
beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-shell-dual-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  origin = createServer((req, res) => { req.resume(); res.writeHead(201).end(); });
  // IPv4 loopback only: ::1 on the same port refuses.
  await new Promise<void>((done) => origin.listen(0, "127.0.0.1", done));
  port = (origin.address() as { port: number }).port;
});
afterEach(async () => {
  await new Promise<void>((done) => origin.close(() => done()));
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

async function through(method: "GET" | "CONNECT"): Promise<{ status: number; rows: Row[] }> {
  const rows: Row[] = [];
  const proxy = await startShellEgressProxy({ allowHosts: ["dual.test", "::1", "127.0.0.1"], record: (row) => rows.push(row), workspace, agentId: "default" });
  try {
    const status = await new Promise<number>((done, fail) => {
      const req = httpRequest({ host: "127.0.0.1", port: proxy.port, method, path: method === "CONNECT" ? `dual.test:${port}` : `http://dual.test:${port}/x`,
        headers: { "proxy-authorization": `Basic ${Buffer.from(`amc:${proxy.token}`).toString("base64")}` } });
      req.on("response", (res) => { res.resume(); done(res.statusCode ?? 0); });
      req.on("connect", (res, socket) => { socket.destroy(); done(res.statusCode ?? 0); });
      req.on("error", fail);
      req.end();
    });
    return { status, rows };
  } finally { proxy.close(); }
}

test("CONNECT falls back past a refusing first address and records the address it reached", async () => {
  const { status, rows } = await through("CONNECT");
  expect(status).toBe(200);
  expect(rows).toEqual([
    expect.objectContaining({ host: "dual.test", port, decision: "allow" }),
    expect.objectContaining({ host: "dual.test", port, decision: "allow", connectedAddress: "127.0.0.1" })
  ]);
});

test("a plain HTTP request falls back the same way", async () => {
  const { status } = await through("GET");
  expect(status).toBe(201);
});
