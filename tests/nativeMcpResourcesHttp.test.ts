import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import type { NativeMcpHttpServer } from "../src/mcp/nativeMcpHttpTransport.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../src/workspace.js";

const SECRET = "synthetic-resource-http-credential-2718";
const URI = "resource://fixture/docs/pinned";
const READ_NAME = nativeMcpToolName("fixture", "resources/read");
const NOTICE = { jsonrpc: "2.0", method: "notifications/resources/list_changed" };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const done of cleanup.splice(0).reverse()) await done(); vi.unstubAllEnvs(); });
type Mode = "legacy" | "stateless";
interface State { uri?: string; changed?: boolean; holdReads?: boolean; notifications?: boolean; notifyInRead?: boolean; text?: string }
interface Rpc { id?: string | number; method?: string; params?: Record<string, unknown> }
interface Call { method: string; path?: string; rpc?: Rpc; origin?: string; authorization?: string; session?: string; protocol?: string; name?: string; lastEventId?: string }
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("resource HTTP fixture listen failed");
  return `http://127.0.0.1:${address.port}`;
}
async function foreignResourceTrap() {
  let hits = 0;
  const http = createServer((_req, res) => { hits++; res.end("must never be fetched directly"); });
  const origin = await listen(http);
  cleanup.push(async () => { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); });
  return { uri: `${origin}/private-resource`, hits: () => hits };
}

// Real loopback HTTP and a signed governed session, with no mock fetch or OAuth enrollment.
async function fixture(mode: Mode, state: State = {}, timeoutMs = 1500) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "resource-http-fixture-vault-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-resource-http-")));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBudgets(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const capabilities = ["resources/list", "resources/read"].map(name => ({ name: nativeMcpToolName("fixture", name), actionClass: "READ_ONLY" as const }));
  const configured = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...configured, tools: { ...configured.tools, allowedTools: [...configured.tools.allowedTools, ...capabilities] } });
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "resource-http-fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const tools = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session, additionalCapabilities: capabilities });
  const calls: Call[] = [], sockets = new Set<Socket>(), notifications = new Set<ServerResponse>();
  const pendingReads = new Map<ServerResponse, () => void>();
  let sequence = 0, currentSession = "";
  const resource = () => ({ uri: state.uri ?? URI, name: "Pinned HTTP documentation", mimeType: "text/plain", description: state.changed ? "Changed generation" : "Reviewed generation" });
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rpc = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Rpc : {};
    calls.push({ method: req.method!, path: req.url, rpc, origin: req.headers.origin, authorization: req.headers.authorization,
      session: req.headers["mcp-session-id"] as string | undefined, protocol: req.headers["mcp-protocol-version"] as string | undefined,
      name: req.headers["mcp-name"] as string | undefined, lastEventId: req.headers["last-event-id"] as string | undefined });
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (req.method === "GET") {
      if (!state.notifications) { res.writeHead(405); res.end(); return; }
      res.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": currentSession });
      res.write(req.headers["last-event-id"] ? ": recovered\n\n" : `id: notification-${currentSession}\nevent: message\ndata:\n\n`);
      notifications.add(res); res.on("close", () => notifications.delete(res)); return;
    }
    if (rpc.id === undefined) { res.writeHead(202); res.end(); return; }
    const reply = (result: unknown, notification = false) => {
      if (res.destroyed) return;
      const message = { jsonrpc: "2.0", id: rpc.id, result };
      res.writeHead(200, { "content-type": notification ? "text/event-stream" : "application/json",
        ...(mode === "legacy" ? { "mcp-session-id": currentSession } : {}) });
      res.end(notification ? `event: message\ndata: ${JSON.stringify(NOTICE)}\n\nevent: message\ndata: ${JSON.stringify(message)}\n\n` : JSON.stringify(message));
    };
    if (rpc.method === "server/discover") reply({ supportedVersions: ["2026-07-28"], capabilities: { resources: { listChanged: true }, tools: {} },
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "resource-http-fixture", version: "1" } } });
    else if (rpc.method === "initialize") {
      currentSession = `resource-http-session-${++sequence}`;
      reply({ protocolVersion: rpc.params?.protocolVersion, capabilities: { resources: { listChanged: true }, tools: {} }, serverInfo: { name: "resource-http-fixture", version: "1" } });
    } else if (rpc.method === "tools/list") reply({ tools: [] });
    else if (rpc.method === "resources/list") reply({ resources: [resource()] });
    else if (rpc.method === "resources/templates/list") reply({ resourceTemplates: [] });
    else if (rpc.method === "resources/read") {
      const complete = () => { pendingReads.delete(res); reply({ contents: [{ uri: rpc.params?.uri, mimeType: "text/plain", text: state.text ?? "HTTP resource text" }] }, state.notifyInRead); };
      if (state.holdReads) { pendingReads.set(res, complete); res.on("close", () => pendingReads.delete(res)); }
      else complete();
    } else reply({});
  });
  http.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  const mounts: MountedNativeMcpServer[] = [];
  cleanup.push(async () => {
    try { for (const mount of mounts) await mount.close().catch(() => {}); }
    finally {
      try {
        tools.close();
        try { session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" }); }
        finally { session.disposeWithoutClosing(); }
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => http.close(() => resolve())); rmSync(workspace, { recursive: true, force: true });
      }
    }
  });
  const origin = await listen(http);
  const server: NativeMcpHttpServer = { transport: "streamable-http", id: "fixture", url: `${origin}/mcp`, origin,
    protocolVersion: mode === "stateless" ? "2026-07-28" : "2025-11-25", timeoutMs, notificationLifetimeMs: 10_000, headers: { Authorization: `Bearer ${SECRET}` } };
  const call = (name = "resources/read", signal = new AbortController().signal) => tools.seam.execute({
    callId: `resource-http-call-${++sequence}`, toolName: nativeMcpToolName("fixture", name), rawArguments: JSON.stringify(name === "resources/read" ? { uri: state.uri ?? URI } : {}),
    sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal
  });
  return { server, state, calls, tools, notifications, call,
    reads: () => calls.filter(call => call.rpc?.method === "resources/read"),
    resumes: () => calls.filter(call => call.method === "GET" && call.lastEventId !== undefined),
    releaseReads: () => { for (const complete of [...pendingReads.values()]) complete(); },
    mount: async () => {
      const reviewed = await discoverNativeMcpCatalog(server, workspace);
      const mounted = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset: tools, expectedCatalogDigest: reviewed.digest,
        grants: ["resources/list", "resources/read"].map(name => ({ name, actionClass: "READ_ONLY" })) });
      mounts.push(mounted); return mounted;
    }
  };
}

describe("governed native MCP HTTP resources", () => {
  test.each(["legacy", "stateless"] as const)("%s resources stay on the reviewed MCP endpoint, even when a resource URI is another HTTP origin", async mode => {
    const foreign = await foreignResourceTrap(), f = await fixture(mode, { uri: foreign.uri });
    const mounted = await f.mount();
    expect((await f.call("resources/list")).outcome).toBe("OK"); expect(f.reads()).toEqual([]);
    const read = await f.call(); expect(read.outcome).toBe("OK");
    const payload = JSON.parse(String(read.content));
    expect(payload.contents).toEqual([{ uri: foreign.uri, mimeType: "text/plain", text: "HTTP resource text" }]);
    expect(payload.amcProvenance).toMatchObject({ trust: "untrusted-external", catalogDigest: mounted.catalog.digest });
    expect(foreign.hits()).toBe(0); expect(f.reads()).toHaveLength(1);
    expect(f.calls.every(call => call.path === "/mcp" && call.origin === f.server.origin && call.authorization === `Bearer ${SECRET}`)).toBe(true);
    if (mode === "stateless") {
      expect(f.calls.every(call => call.method === "POST" && call.session === undefined)).toBe(true);
      expect(f.reads()[0]).toMatchObject({ name: foreign.uri, protocol: "2026-07-28", rpc: { params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } } });
    } else expect(f.reads()[0].session).toMatch(/^resource-http-session-/);
    await mounted.close(); const count = f.calls.length;
    expect((await f.call()).outcome).toBe("DENIED"); expect(f.calls).toHaveLength(count);
  });

  test.each(["legacy", "stateless"] as const)("%s resources/list_changed invalidates the resource grant, including transport-consumed SSE", async mode => {
    const f = await fixture(mode, { notifications: mode === "legacy", notifyInRead: mode === "stateless" }); await f.mount();
    if (mode === "legacy") {
      await vi.waitFor(() => expect(f.notifications.size).toBe(1));
      for (const stream of f.notifications) stream.write(`event: message\ndata: ${JSON.stringify(NOTICE)}\n\n`);
      await vi.waitFor(() => expect(f.tools.registry.visible("default").has(READ_NAME)).toBe(false));
    } else {
      const result = await f.call(); expect(result.outcome).toBe("ERROR");
      expect(String(result.content)).not.toContain("HTTP resource text"); expect(f.reads()).toHaveLength(1);
    }
    expect(f.tools.registry.visible("default").has(READ_NAME)).toBe(false);
    const count = f.calls.length; expect((await f.call()).outcome).toBe("DENIED"); expect(f.calls).toHaveLength(count);
  });

  test("a resource catalog altered while a read is in flight discards the received text and revokes the mount", async () => {
    const marker = "unreviewed-in-flight-resource-text";
    const f = await fixture("stateless", { holdReads: true, text: marker }); await f.mount(); const reading = f.call();
    await vi.waitFor(() => expect(f.reads()).toHaveLength(1));
    f.state.changed = true; f.releaseReads();
    const result = await reading; expect(result.outcome).toBe("ERROR"); expect(String(result.content)).not.toContain(marker);
    expect(f.reads()).toHaveLength(1); expect(f.tools.registry.visible("default").has(READ_NAME)).toBe(false);
    expect((await f.call()).outcome).toBe("DENIED");
  });

  test("notification recovery during a read invalidates its old generation even when the catalog bytes stay identical", async () => {
    const f = await fixture("legacy", { notifications: true, holdReads: true, text: "stale generation text" }); await f.mount();
    await vi.waitFor(() => expect(f.notifications.size).toBe(1)); const reading = f.call();
    await vi.waitFor(() => expect(f.reads()).toHaveLength(1));
    for (const stream of f.notifications) stream.end();
    await vi.waitFor(() => expect(f.resumes()).toHaveLength(1)); f.releaseReads();
    const result = await reading; expect(result.outcome).toBe("ERROR"); expect(String(result.content)).not.toContain("stale generation text");
    expect(f.reads()).toHaveLength(1);
    expect(f.calls.filter(call => call.rpc?.method === "initialize")).toHaveLength(2);
    expect(f.resumes()[0].lastEventId).toMatch(/^notification-resource-http-session-/);
    expect(f.tools.registry.visible("default").has(READ_NAME)).toBe(false); expect((await f.call()).outcome).toBe("DENIED");
  });

  test.each(["timeout", "abort"] as const)("a resource HTTP %s retains its failure fact and prevents calls on the disposed mount", async failure => {
    const f = await fixture("legacy", { holdReads: true }, failure === "timeout" ? 300 : 1500); await f.mount();
    const abort = new AbortController(), reading = f.call("resources/read", abort.signal);
    await vi.waitFor(() => expect(f.reads()).toHaveLength(1)); if (failure === "abort") abort.abort(new Error("private abort reason"));
    const result = await reading;
    expect(result).toMatchObject({ outcome: failure === "abort" ? "CANCELLED" : "ERROR", timedOut: failure === "timeout", exitCode: failure === "abort" ? null : 1 });
    expect(String(result.content)).not.toContain("private abort reason");
    expect(f.tools.registry.visible("default").has(READ_NAME)).toBe(false);
    const count = f.reads().length; expect((await f.call()).outcome).toBe("DENIED"); expect(f.reads()).toHaveLength(count);
  });
});
