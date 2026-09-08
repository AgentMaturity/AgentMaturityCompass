import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { SessionService } from "../src/session/sessionService.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import { NATIVE_MCP_HTTP_LIMITS, NativeMcpHttpTransport, nativeMcpHttpEndpoint, type NativeMcpHttpServer } from "../src/mcp/nativeMcpHttpTransport.js";
import { loadNativeMcpConfiguration, resolveNativeMcpServer } from "../src/setup/nativeMcpConfig.js";
import { sha256Hex } from "../src/utils/hash.js";

const SECRET = "synthetic-http-mcp-credential-41a9";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const done of cleanup.splice(0).reverse()) await done(); vi.unstubAllEnvs(); });
interface State {
  sse?: boolean; redirect?: string; unauthorized?: boolean; rotateSession?: boolean; large?: "declared" | "streamed";
  changed?: boolean; notify?: boolean; hold?: boolean; remoteError?: boolean; leakCatalog?: boolean;
}
interface Call { method: string; rpc?: string; session?: string; origin?: string; authorization?: string; args?: unknown }
async function fixture(state: State = {}, options: Partial<NativeMcpHttpServer> = {}) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "http-mcp-fixture-vault-only");
  const workspace = mkdtempSync(join(tmpdir(), "amc-http-mcp-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBudgets(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const configured = loadToolsConfig(workspace), name = nativeMcpToolName("fixture", "lookup");
  initToolsConfig(workspace, { ...configured, tools: { ...configured.tools,
    allowedTools: [...configured.tools.allowedTools, { name, actionClass: "READ_ONLY" }] } });
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "http-fixture", compositionDigest: "http-fixture", policyDigest: "http-fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const toolset = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session });
  const calls: Call[] = [], sockets = new Set<Socket>(), notifications = new Set<ServerResponse>();
  let sequence = 0, currentSession = "";
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as { id?: number; method?: string; params?: Record<string, unknown> } : {};
    calls.push({ method: req.method!, rpc: parsed.method, session: req.headers["mcp-session-id"] as string | undefined,
      origin: req.headers.origin, authorization: req.headers.authorization, args: parsed.params?.arguments });
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (state.redirect) { res.writeHead(307, { location: state.redirect }); res.end(); return; }
    if (state.unauthorized) { res.writeHead(401, { "www-authenticate": 'Bearer resource_metadata="https://must-not-fetch.invalid/oauth"' }); res.end(SECRET); return; }
    if (req.method === "GET") {
      if (!state.notify) { res.writeHead(405); res.end(); return; }
      res.writeHead(200, { "content-type": "text/event-stream" }); res.write(": connected\n\n"); notifications.add(res);
      res.on("close", () => notifications.delete(res)); return;
    }
    if (parsed.method === "notifications/initialized") { res.writeHead(202); res.end(); return; }
    let result: unknown;
    if (parsed.method === "initialize") {
      currentSession = `http-fixture-session-${++sequence}`;
      result = { protocolVersion: parsed.params?.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "fixture", version: "1" } };
    } else if (parsed.method === "tools/list") {
      if (state.large) {
        res.writeHead(200, { "content-type": "application/json", ...(state.large === "declared" ? { "content-length": NATIVE_MCP_HTTP_LIMITS.responseBytes + 1 } : {}) });
        res.end(" ".repeat(NATIVE_MCP_HTTP_LIMITS.responseBytes + 1)); return;
      }
      result = { tools: [{ name: "lookup", description: state.leakCatalog ? SECRET : state.changed ? "changed catalog" : "fixture lookup",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }] };
    } else if (parsed.method === "tools/call") {
      if (state.hold) return;
      result = { ...(state.remoteError ? { isError: true } : {}), content: [{ type: "text", text: `${SECRET} ${currentSession}` }], structuredContent: { result: "fixture", token: SECRET } };
    } else result = {};
    const reply = { jsonrpc: "2.0", id: parsed.id, result };
    const headers = { "content-type": state.sse ? "text/event-stream" : "application/json",
      "mcp-session-id": state.rotateSession && parsed.method !== "initialize" ? "replacement-session" : currentSession };
    res.writeHead(200, headers); res.end(state.sse ? `event: message\ndata: ${JSON.stringify(reply)}\n\n` : JSON.stringify(reply));
  });
  http.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address(); if (!address || typeof address === "string") throw new Error("fixture listen failed");
  const origin = `http://127.0.0.1:${address.port}`;
  const server: NativeMcpHttpServer = { transport: "streamable-http", id: "fixture", url: `${origin}/mcp`, origin,
    headers: { Authorization: `Bearer ${SECRET}` }, timeoutMs: 1200, ...options };
  const mounts: MountedNativeMcpServer[] = [];
  cleanup.push(async () => {
    try { for (const mount of mounts) await mount.close().catch(() => {}); }
    finally {
      toolset.close(); session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" });
      for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => http.close(() => resolve())); rmSync(workspace, { recursive: true, force: true });
    }
  });
  return { workspace, server, state, calls, toolset, notifications,
    mount: async () => { const reviewed = await discoverNativeMcpCatalog(server, workspace); const mount = await mountNativeMcpServer({
      server, workspace, agentId: "default", toolset, expectedCatalogDigest: reviewed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] }); mounts.push(mount); return mount; },
    call: (signal = new AbortController().signal) => toolset.seam.execute({ callId: `http-call-${++sequence}`, toolName: name, rawArguments: '{"query":"fixture"}',
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal }) };
}

describe("governed native Streamable HTTP", () => {
  test.each([false, true])("executes %s SSE with pinned origin/session and private header redaction", async sse => {
    const f = await fixture({ sse }); const mount = await f.mount(); const out = await f.call();
    expect(out.outcome).toBe("OK"); expect(String(out.content)).not.toContain(SECRET); expect(String(out.content)).not.toContain("http-fixture-session-");
    expect(String(out.content)).toContain("[REDACTED]"); expect(f.calls.filter(call => call.rpc === "tools/call")).toHaveLength(1);
    expect(f.calls.every(call => call.origin === f.server.origin && call.authorization === `Bearer ${SECRET}`)).toBe(true);
    await mount.close(); expect(f.calls.filter(call => call.method === "DELETE")).toHaveLength(2);
    expect(f.toolset.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false);
  });
  test("configuration resolves header references only, pins bytes and refuses control/origin fields", async () => {
    const f = await fixture(); const path = join(f.workspace, "http-mcp.json");
    const config = { schemaVersion: 1, server: { transport: "streamable-http", id: "fixture", url: f.server.url, origin: f.server.origin,
      headerRefs: { Authorization: "AMC_HTTP_FIXTURE_AUTH" }, notificationLifetimeMs: 7_200_000 } };
    writeFileSync(path, JSON.stringify(config)); vi.stubEnv("AMC_HTTP_FIXTURE_AUTH", `Bearer ${SECRET}`);
    const loaded = loadNativeMcpConfiguration(path, sha256Hex(readFileSync(path)));
    expect(JSON.stringify(loaded)).not.toContain(SECRET);
    expect(await resolveNativeMcpServer(loaded.config, { workspace: f.workspace })).toMatchObject({ headers: { Authorization: `Bearer ${SECRET}` }, notificationLifetimeMs: 7_200_000 });
    for (const patch of [{ headers: { Authorization: SECRET } }, { headerRefs: { Origin: "REF" } },
      { headerRefs: { Authorization: "REF", authorization: "REF" } }, { origin: "https://elsewhere.invalid" },
      { url: "http://example.invalid/mcp", origin: "http://example.invalid" }, { url: `${f.server.url}?token=secret` },
      ...[0, -1, 1.5, "3600", 86_400_001].map(notificationLifetimeMs => ({ notificationLifetimeMs }))]) {
      writeFileSync(path, JSON.stringify({ ...config, server: { ...config.server, ...patch } })); expect(() => loadNativeMcpConfiguration(path)).toThrow();
    }
    expect(() => nativeMcpHttpEndpoint("https://u:p@example.invalid/mcp", "https://example.invalid")).toThrow();
    expect(() => nativeMcpHttpEndpoint("https://example.invalid/mcp", "https://example.invalid")).not.toThrow();
  });
  test("redirects never send credentials to a second origin", async () => {
    const target = await fixture(); const f = await fixture({ redirect: target.server.url });
    await expect(discoverNativeMcpCatalog(f.server, f.workspace)).rejects.toThrow(/redirects/);
    expect(target.calls).toEqual([]); expect(f.calls).toHaveLength(1);
  });
  test("authentication challenges do not enroll OAuth or expose response credentials", async () => {
    const f = await fixture({ unauthorized: true });
    const failure = await discoverNativeMcpCatalog(f.server, f.workspace).catch(error => error as Error);
    expect(String(failure)).toContain("headerRefs"); expect(String(failure)).toContain("OAuth"); expect(String(failure)).not.toContain(SECRET); expect(f.calls).toHaveLength(1);
  });
  test("session replacement is refused without using the replacement identity", async () => {
    const f = await fixture({ rotateSession: true });
    await expect(discoverNativeMcpCatalog(f.server, f.workspace)).rejects.toThrow(/session identity/);
    expect(f.calls.some(call => call.session === "replacement-session")).toBe(false); expect(f.calls.filter(call => call.rpc === "tools/call")).toEqual([]);
  });
  test.each(["declared", "streamed"] as const)("bounds %s oversized bodies", async large => {
    const f = await fixture({ large }); await expect(discoverNativeMcpCatalog(f.server, f.workspace)).rejects.toThrow(/limit|size/);
    expect(f.calls.filter(call => call.rpc === "tools/call")).toEqual([]);
  });
  test("catalog changes and credential leaks do not reach a remote tool", async () => {
    const f = await fixture(); await f.mount(); f.state.changed = true;
    expect((await f.call()).outcome).toBe("ERROR"); expect(f.calls.filter(call => call.rpc === "tools/call")).toEqual([]);
    f.state.leakCatalog = true; await expect(discoverNativeMcpCatalog(f.server, f.workspace)).rejects.toThrow();
  });
  test("catalog notifications dispose the grant without automatic reconnect", async () => {
    const f = await fixture({ notify: true }); await f.mount(); await vi.waitFor(() => expect(f.notifications.size).toBe(1));
    for (const stream of f.notifications) stream.write('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n');
    await vi.waitFor(() => expect(f.toolset.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false));
    expect((await f.call()).outcome).toBe("DENIED"); const initializations = f.calls.filter(call => call.rpc === "initialize").length;
    await new Promise(resolve => setTimeout(resolve, 100)); expect(f.calls.filter(call => call.rpc === "initialize")).toHaveLength(initializations);
  });
  test("idle notifications outlive request timeout, then expire at the independently configured bound", async () => {
    const f = await fixture({ notify: true }, { timeoutMs: 1000, notificationLifetimeMs: 2500 });
    await f.mount(); await vi.waitFor(() => expect(f.notifications.size).toBe(1));
    await new Promise(resolve => setTimeout(resolve, 1150));
    expect((await f.call()).outcome).toBe("OK");
    await vi.waitFor(() => expect(f.toolset.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false), { timeout: 3000 });
    expect((await f.call()).outcome).toBe("DENIED");
    expect(f.calls.filter(call => call.rpc === "initialize")).toHaveLength(2);
    await vi.waitFor(() => expect(f.notifications.size).toBe(0));
  });
  test("protocol failure tolerates reentrant error and close handlers with one bounded termination", async () => {
    const f = await fixture({ unauthorized: true }); const transport = new NativeMcpHttpTransport(f.server, 1200);
    const closings: Promise<void>[] = []; let errors = 0, closes = 0;
    transport.onerror = () => { errors++; closings.push(transport.close()); };
    transport.onclose = () => { closes++; closings.push(transport.close()); };
    await transport.start();
    await expect(transport.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fixture", version: "1" }
    } })).rejects.toThrow(/authentication refused/);
    await transport.close(); await Promise.all(closings);
    expect(errors).toBe(1); expect(closes).toBe(1); expect(closings).toHaveLength(2);
    expect(closings.every(promise => promise === transport.close())).toBe(true); expect(f.calls).toHaveLength(1);
  });
  test("a notification flood exhausts the bounded connection instead of accumulating state", async () => {
    const f = await fixture({ notify: true }); await f.mount(); await vi.waitFor(() => expect(f.notifications.size).toBe(1));
    for (const stream of f.notifications) {
      for (let i = 0; i <= NATIVE_MCP_HTTP_LIMITS.notifications; i++) stream.write(`event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "unowned", progress: i }
      })}\n\n`);
    }
    await vi.waitFor(() => expect(f.toolset.registry.visible("default").has(nativeMcpToolName("fixture", "lookup"))).toBe(false));
    expect((await f.call()).outcome).toBe("DENIED"); expect(f.calls.filter(call => call.rpc === "tools/call")).toEqual([]);
  });
  test("cancellation aborts the active stream, terminates the session and removes the grant", async () => {
    const f = await fixture({ hold: true }); await f.mount(); const controller = new AbortController(); const call = f.call(controller.signal);
    await vi.waitFor(() => expect(f.calls.filter(call => call.rpc === "tools/call")).toHaveLength(1)); controller.abort();
    expect((await call).outcome).toBe("CANCELLED"); expect((await f.call()).outcome).toBe("DENIED");
    await vi.waitFor(() => expect(f.calls.filter(call => call.method === "DELETE")).toHaveLength(2));
  });
  test("timeouts and remote error results retain distinct failure facts", async () => {
    const f = await fixture({ remoteError: true }); const mount = await f.mount();
    expect(await f.call()).toMatchObject({ outcome: "ERROR", timedOut: false, exitCode: 1 });
    f.state.hold = true; expect(await f.call()).toMatchObject({ outcome: "ERROR", timedOut: true, exitCode: 1 }); await mount.close();
  });
});
