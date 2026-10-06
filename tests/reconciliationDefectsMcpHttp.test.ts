// AMC-1535: the two AMC-1515 properties over Streamable HTTP. The local
// server follows the fixture in tests/nativeMcpHttp.test.ts. On tools/call it
// answers with one JSON batch whose first message announces a catalog change,
// so the grant is disposed while the already received result is delivered.
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
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
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import type { NativeMcpHttpServer } from "../src/mcp/nativeMcpHttpTransport.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const done of cleanup.splice(0).reverse()) await done(); vi.unstubAllEnvs(); });

async function fixture(notifyOnCall: boolean) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "http-mcp-reconcile-fixture");
  const workspace = mkdtempSync(join(tmpdir(), "amc-reconcile-http-mcp-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBudgets(workspace);
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const configured = loadToolsConfig(workspace), name = nativeMcpToolName("fixture", "lookup");
  initToolsConfig(workspace, { ...configured, tools: { ...configured.tools,
    allowedTools: [...configured.tools.allowedTools, { name, actionClass: "READ_ONLY" }] } });
  const session = new SessionService(workspace);
  session.open({ agentId: "default", harnessVersion: "http-fixture", compositionDigest: "http-fixture", policyDigest: "http-fixture" });
  session.startTurn({ trigger: "user" }); session.startStep();
  const toolset = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session });
  const sockets = new Set<Socket>();
  let remoteCalls = 0;
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as { id?: number; method?: string; params?: Record<string, unknown> } : {};
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (req.method === "GET") { res.writeHead(405); res.end(); return; }
    if (parsed.method === "notifications/initialized") { res.writeHead(202); res.end(); return; }
    let result: unknown = {};
    if (parsed.method === "initialize") result = { protocolVersion: parsed.params?.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "fixture", version: "1" } };
    else if (parsed.method === "tools/list") result = { tools: [{ name: "lookup", description: "fixture lookup",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }] };
    else if (parsed.method === "tools/call") { remoteCalls++; result = { content: [{ type: "text", text: "remote side effect committed" }] }; }
    const reply = { jsonrpc: "2.0", id: parsed.id, result };
    const body = notifyOnCall && parsed.method === "tools/call" ? [{ jsonrpc: "2.0", method: "notifications/tools/list_changed" }, reply] : reply;
    res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "http-reconcile-session" }); res.end(JSON.stringify(body));
  });
  http.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address(); if (!address || typeof address === "string") throw new Error("fixture listen failed");
  const origin = `http://127.0.0.1:${address.port}`;
  const server: NativeMcpHttpServer = { transport: "streamable-http", id: "fixture", url: `${origin}/mcp`, origin, timeoutMs: 1200 };
  const reviewed = await discoverNativeMcpCatalog(server, workspace);
  const mount = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset,
    expectedCatalogDigest: reviewed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
  cleanup.push(async () => {
    try { await mount.close().catch(() => {}); }
    finally {
      toolset.close(); session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "completed" });
      for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => http.close(() => resolve())); rmSync(workspace, { recursive: true, force: true });
    }
  });
  const body = toolset.registry.visible("default").get(name)!.body;
  return {
    remoteCalls: () => remoteCalls,
    call: () => toolset.seam.execute({ callId: "http-reconcile-call", toolName: name, rawArguments: '{"query":"fixture"}',
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal }),
    simulate: (args: Record<string, unknown>) => body({ agentId: "default", workspace, effectiveMode: "SIMULATE", arguments: args } as never)
  };
}

describe("AMC-1535 Streamable HTTP — AMC-1515 outcomes", () => {
  test("a non-EXECUTE call with schema-invalid arguments is refused without a remote call", async () => {
    const f = await fixture(false);
    await expect(f.simulate({ query: 12 })).rejects.toThrow("MCP arguments do not match the reviewed tool schema");
    expect(f.remoteCalls()).toBe(0);
  });
  test("a result received after grant disposal is reported as executed and discarded", async () => {
    const f = await fixture(true);
    const outcome = await f.call();
    expect(f.remoteCalls()).toBe(1);
    expect(outcome.outcome).toBe("ERROR");
    expect(String(outcome.content)).toContain("the remote tool executed and its received result was discarded");
  });
});
