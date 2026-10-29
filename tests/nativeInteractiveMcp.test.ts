import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolset } from "../src/agent/agentToolset.js";
import type { MountedNativeMcpServer } from "../src/mcp/nativeMcpClient.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { createNativeInteractiveMcpView, reportNativeInteractiveMcpMount } from "../src/setup/nativeInteractiveMcp.js";

const RECEIPT = "amc/native-chat-mcp-receipt";
function mounted(): Pick<MountedNativeMcpServer, "receipt" | "toolNames"> {
  return { receipt: { serverId: "fixture", catalogDigest: "a".repeat(64),
    protocol: { negotiatedVersion: "2026-07-28", mode: "stateless", serverInfo: { name: "fixture server", version: "1" } },
    auth: { issuer: "https://auth.example.org", scopes: ["lookup"], tokenExpiresAt: "2026-10-30T10:00:00.000Z" } },
    toolNames: ["mcp_fixture_1234567890abcdef"] };
}
const message = (mount = mounted()) => ({ type: RECEIPT, v: 1, receipt: mount.receipt, toolNames: mount.toolNames });

describe("native chat read-only MCP receipt view", () => {
  let priorSend: PropertyDescriptor | undefined;
  let priorConnected: PropertyDescriptor | undefined;
  let send: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    priorSend = Object.getOwnPropertyDescriptor(process, "send");
    priorConnected = Object.getOwnPropertyDescriptor(process, "connected");
    send = vi.fn((_value: unknown, callback?: (error: Error | null) => void) => { callback?.(null); return true; });
    Object.defineProperty(process, "send", { configurable: true, writable: true, value: send });
    Object.defineProperty(process, "connected", { configurable: true, writable: true, value: true });
  });
  afterEach(() => {
    if (priorSend) Object.defineProperty(process, "send", priorSend); else Reflect.deleteProperty(process, "send");
    if (priorConnected) Object.defineProperty(process, "connected", priorConnected); else Reflect.deleteProperty(process, "connected");
    vi.restoreAllMocks();
  });
  it("does not infer a mount from configuration or an unrelated IPC message", () => {
    const view = createNativeInteractiveMcpView();
    view.accept({ type: "amc/native-approval-raised", v: 1 });
    expect(view.render().join("\n")).toContain("No MCP mount receipt");
    expect(view.render().join("\n")).toContain("unavailable");
  });
  it("reports only receipt fields and keeps existing progress without serializing credentials", () => {
    const mount = mounted();
    Object.assign(mount.receipt, { accessToken: "synthetic-secret", server: { env: { SECRET: "synthetic-secret" } } });
    Object.assign(mount.receipt.auth!, { refreshToken: "synthetic-secret" });
    const progress = vi.fn();
    reportNativeInteractiveMcpMount(mount, progress);
    expect(progress).toHaveBeenCalledWith(`Mounted reviewed MCP tools for this run: ${mount.toolNames.join(", ")}. Signed allowlist, approval gate and budgets remain in force.`);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]![0];
    expect(sent).toEqual(message()); expect(JSON.stringify(sent)).not.toContain("synthetic-secret");
  });
  it("shows mounted identity, protocol, auth and grants, then closes without reopening on late messages", () => {
    const view = createNativeInteractiveMcpView(); view.accept(message());
    const active = view.render().join("\n");
    for (const part of ["fixture", "a".repeat(64), "2026-07-28", "stateless", "https://auth.example.org", "lookup", "2026-10-30T10:00:00.000Z", "mcp_fixture_1234567890abcdef", "active"]) expect(active).toContain(part);
    view.settled(); const settled = view.render();
    const late = mounted(); Object.assign(late.receipt, { serverId: "late", catalogDigest: "b".repeat(64) });
    view.accept(message(late)); view.accept({ ...message(), v: 2 });
    expect(view.render()).toEqual(settled);
    expect(view.render().join("\n")).toContain("closed"); expect(view.render().join("\n")).not.toContain("state active");
  });
  it("copies receipt data and escapes untrusted display strings without interpreting terminal controls", () => {
    const mount = mounted();
    const auth = { issuer: "https://auth.example.org/\u001b[2J", scopes: ["lookup\rgrant"], tokenExpiresAt: null };
    const value = { ...message(mount), receipt: { ...mount.receipt, auth } };
    const view = createNativeInteractiveMcpView(); view.accept(value);
    auth.scopes[0] = "mutated scope";
    const output = view.render().join("\n");
    expect(output).toContain("lookup\\u000dgrant"); expect(output).toContain("\\u001b[2J");
    expect(output).not.toContain("\u001b"); expect(output).not.toContain("\r"); expect(output).not.toContain("mutated scope");
  });
  it.each(["digest", "protocol", "mode", "auth", "tools", "version", "large"])("refuses malformed %s receipts without partial mounted claims", defect => {
    const value = message() as any;
    if (defect === "digest") value.receipt.catalogDigest = "not-a-digest";
    if (defect === "protocol") value.receipt.protocol.negotiatedVersion = "future-version";
    if (defect === "mode") value.receipt.protocol.mode = "legacy";
    if (defect === "auth") value.receipt.auth.scopes = "all";
    if (defect === "tools") value.toolNames = ["invented", 42];
    if (defect === "version") value.v = 2;
    if (defect === "large") value.toolNames = Array(257).fill("mcp_fixture_1234567890abcdef");
    const view = createNativeInteractiveMcpView(); view.accept(value);
    const output = view.render().join("\n");
    expect(output).toContain("receipt refused"); expect(output).not.toContain("a".repeat(64)); expect(output).not.toContain("state active");
  });
  it("does not turn missing IPC, IPC errors or a display error into a run failure", () => {
    send.mockImplementation(() => { throw new Error("channel closed"); });
    expect(() => reportNativeInteractiveMcpMount(mounted(), () => { throw new Error("display gone"); })).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    Object.defineProperty(process, "connected", { configurable: true, writable: true, value: false });
    reportNativeInteractiveMcpMount(mounted(), () => {}); expect(send).toHaveBeenCalledTimes(1);
  });
  it("renders an actual fake stdio server's mounted receipt without rediscovery or reconnect", async () => {
    const { discoverNativeMcpCatalog, mountNativeMcpServer } = await import("../src/mcp/nativeMcpClient.js");
    const workspace = mkdtempSync(join(tmpdir(), "amc-chat-mcp-view-"));
    const log = join(workspace, "requests.jsonl");
    // Presentation-only registry fixture. No tool is executed or policy bypass claimed.
    const toolset = { registry: new ToolRegistry() } as unknown as AgentToolset;
    const server = { id: "fixture", command: process.execPath, timeoutMs: 2_000, args: ["-e", String.raw`
      const fs = require('node:fs');
      require('node:readline').createInterface({input:process.stdin}).on('line', line => {
        const request = JSON.parse(line); if (request.id === undefined) return;
        fs.appendFileSync(process.argv[1], request.method+'\n');
        const result = request.method === 'initialize' ? {protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}
          : request.method === 'tools/list' ? {tools:[{name:'lookup',inputSchema:{type:'object',properties:{},additionalProperties:false}}]} : {};
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
      });`, log] };
    let mount: MountedNativeMcpServer | undefined;
    try {
      const catalog = await discoverNativeMcpCatalog(server, workspace);
      mount = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset,
        expectedCatalogDigest: catalog.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
      const view = createNativeInteractiveMcpView(); send.mockImplementation(value => { view.accept(value); return true; });
      reportNativeInteractiveMcpMount(mount, () => {});
      const requests = readFileSync(log, "utf8");
      for (let index = 0; index < 3; index++) {
        const output = view.render().join("\n"); expect(output).toContain(catalog.digest); expect(output).toContain(mount.toolNames[0]!);
      }
      expect(readFileSync(log, "utf8")).toBe(requests);
      await mount.close(); view.settled(); expect(view.render().join("\n")).toContain("closed");
    } finally { await mount?.close(); rmSync(workspace, { recursive: true, force: true }); }
  }, 20_000);
});
