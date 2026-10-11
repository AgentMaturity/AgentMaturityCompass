import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { createAmcPiExtension, piActionId, type PiExtensionApi, type PiToolCallContext } from "../src/adapters/pi/amcPiExtension.js";
import { PI_CONTROL_PATH, PI_OBSERVE_PATH } from "../src/adapters/pi/piControlClient.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { CONTROL_HOOK_PATH } from "../src/bridge/hookControl.js";
import { OBSERVED_AEP_HOOK_PATH } from "../src/bridge/hookIngress.js";
import { openLedger } from "../src/ledger/ledger.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "pi-extension-agent";
const UNAVAILABLE = { block: true, reason: "AMC control unavailable; action denied." };
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  removeFixtureWorkspaces();
});

type Handler = (event: Record<string, unknown>, ctx: PiToolCallContext) => unknown;

/** Pi's dispatch as the 1.0.2 and 1.0.4 bundles run it: handlers in order, the first block wins, a throw blocks. */
function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const api: PiExtensionApi = {
    on: (name, handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler as Handler]);
      return () => undefined;
    },
  };
  const emit = async (name: string, event: Record<string, unknown>, ctx: PiToolCallContext) => {
    for (const handler of handlers.get(name) ?? []) {
      try {
        const result = await handler(event, ctx) as { block?: boolean } | undefined;
        if (result?.block) return result;
      } catch (error) {
        return { block: true, reason: `Extension failed, blocking execution: ${String(error)}` };
      }
    }
    return undefined;
  };
  return { api, handlers, emit };
}

function context(mode: PiToolCallContext["mode"] = "print", confirm: () => Promise<boolean> = async () => false): PiToolCallContext {
  return { mode, hasUI: mode === "tui" || mode === "rpc", sessionManager: { getSessionId: () => "pi-session-1" },
    ui: { confirm, notify: () => undefined } };
}

async function loaded(workspace: string, mode: "control" | "observe", options: { piVersion?: string; timeoutMs?: number } = {}) {
  const pi = fakePi();
  await createAmcPiExtension({ workspace, mode, piVersion: options.piVersion ?? "1.0.4", timeoutMs: options.timeoutMs ?? 2_000 })(pi.api);
  return pi;
}

async function withBridge(workspace: string, mode: "control" | "observe") {
  const port = await freePort();
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  servers.push({ close: (done: () => void) => void bridge.close().then(done) } as unknown as Server);
  installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${port}`, mode });
}

/** A loopback server that answers every request with `respond`, installed as the workspace's Bridge. */
async function withFakeBridge(workspace: string, respond: (res: import("node:http").ServerResponse) => void) {
  const server = createServer((req, res) => { req.resume(); respond(res); });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${address.port}`, mode: "control" });
}

function decisionRows(workspace: string, actionId: string) {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { actionId?: string }).actionId === actionId);
  } finally {
    ledger.close();
  }
}

describe("AMC Pi extension", () => {
  test("posts to the Bridge's own control and observation routes", () => {
    expect(PI_CONTROL_PATH).toBe(CONTROL_HOOK_PATH);
    expect(PI_OBSERVE_PATH).toBe(OBSERVED_AEP_HOOK_PATH);
  });

  test("control: an allowed read runs, its outcome is observed without arguments or output, and the lifecycle verifies", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    const path = join(workspace, "workspace", "public.txt");
    const call = { type: "tool_call", toolName: "read", toolCallId: "toolu_read_1", input: { path } };

    expect(await pi.emit("tool_call", call, context())).toBeUndefined();
    await pi.emit("tool_result", { ...call, type: "tool_result", content: [{ type: "text", text: "public fixture" }], isError: false }, context());

    const actionId = piActionId("pi-session-1", "toolu_read_1");
    const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId });
    expect(lifecycle).toMatchObject({ status: "completed", valid: true, failClosed: false, provider: "pi" });
    const ledger = openLedger(workspace);
    const all = JSON.stringify(ledger.getAllEvents());
    ledger.close();
    expect(all).not.toContain("public fixture");
    expect(all).not.toContain(path);
  });

  test("control: unmapped tools and unqualified Pi versions are blocked with AMC's reason", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    expect(await pi.emit("tool_call", { toolName: "my_ext_tool", toolCallId: "c1", input: {} }, context()))
      .toEqual({ block: true, reason: "Pi tool my_ext_tool is not mapped to an allowed ToolHub tool." });

    const old = await loaded(workspace, "control", { piVersion: "1.1.0" });
    expect(await old.emit("tool_call", { toolName: "read", toolCallId: "c2", input: { path: "workspace/public.txt" } }, context()))
      .toEqual({ block: true, reason: "AMC has not qualified Pi 1.1.0" });
  });

  test("control: a restarted extension replays the recorded decision instead of making a second one", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const call = { toolName: "read", toolCallId: "toolu_restart", input: { path: join(workspace, "workspace", "public.txt") } };
    expect(await (await loaded(workspace, "control")).emit("tool_call", call, context())).toBeUndefined();
    expect(await (await loaded(workspace, "control")).emit("tool_call", call, context())).toBeUndefined();
    expect(decisionRows(workspace, piActionId("pi-session-1", "toolu_restart"))).toHaveLength(1);
    // The same Pi call id with other input is a conflict at the control route, never a replayed allow.
    expect(await (await loaded(workspace, "control")).emit("tool_call", { ...call, input: { path: "workspace/other.txt" } }, context()))
      .toEqual(UNAVAILABLE);
  });

  test("control: an ask is put to the person only in the TUI; their no blocks; print mode is denied by AMC", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    const write = (id: string) => ({ toolName: "write", toolCallId: id, input: { path: join(workspace, "workspace", "output", `${id}.txt`), content: "x" } });
    const asked: string[] = [];
    const confirm = (answer: boolean) => async () => { asked.push("asked"); return answer; };

    expect(await pi.emit("tool_call", write("w1"), context("tui", confirm(true)))).toBeUndefined();
    expect(await pi.emit("tool_call", write("w2"), context("tui", confirm(false))))
      .toEqual({ block: true, reason: expect.stringContaining("not approved in Pi") });
    expect(asked).toHaveLength(2);
    expect(await pi.emit("tool_call", write("w3"), context("print", confirm(true))))
      .toEqual({ block: true, reason: expect.stringContaining("no interactive confirmation") });
    expect(asked).toHaveLength(2);
  });

  test("control fails closed: Bridge down, timeout, HTTP 500, malformed or unbound answers", async () => {
    const cases: Array<[string, (res: import("node:http").ServerResponse) => void]> = [
      ["HTTP 500", (res) => { res.writeHead(500).end("{}"); }],
      ["malformed JSON", (res) => { res.writeHead(201, { "content-type": "application/json" }).end("{not json"); }],
      ["an allow for another action", (res) => { res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({
        controlled: true, provider: "pi", actionId: "pi.someone-else", decision: "allow", providerResponse: { block: false },
        providerResponseSha256: "0".repeat(64) })); }],
      ["timeout", () => undefined],
    ];
    for (const [, respond] of cases) {
      const workspace = controlledWorkspace(agentId);
      await withFakeBridge(workspace, respond);
      const pi = await loaded(workspace, "control", { timeoutMs: 300 });
      expect(await pi.emit("tool_call", { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } }, context())).toEqual(UNAVAILABLE);
    }

    const down = controlledWorkspace(agentId);
    installHookIntegration({ workspace: down, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${await freePort()}`, mode: "control" });
    expect(await (await loaded(down, "control")).emit("tool_call", { toolName: "read", toolCallId: "c", input: { path: "x" } }, context())).toEqual(UNAVAILABLE);
  });

  test("control fails closed on the lease and the installation: missing lease, lease mode 0644, no manifest, mode mismatch", async () => {
    const call = { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } };
    const setups: Array<(workspace: string) => void> = [
      (workspace) => rmSync(join(workspace, ".amc", "hooks", "pi.lease")),
      (workspace) => chmodSync(join(workspace, ".amc", "hooks", "pi.lease"), 0o644),
      (workspace) => rmSync(join(workspace, ".amc", "hooks", "pi.json")),
      (workspace) => {
        const path = join(workspace, ".amc", "hooks", "pi.json");
        writeFileSync(path, readFileSync(path, "utf8").replace('"mode": "control"', '"mode": "observe"'));
      },
    ];
    for (const setup of setups) {
      const workspace = controlledWorkspace(agentId);
      await withBridge(workspace, "control");
      setup(workspace);
      expect(await (await loaded(workspace, "control")).emit("tool_call", call, context())).toEqual(UNAVAILABLE);
    }
  });

  test("observe: never blocks, even with the Bridge down, and records outcomes only", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "observe");
    const pi = await loaded(workspace, "observe");
    const call = { toolName: "bash", toolCallId: "b1", input: { command: "echo SECRET_ARG" } };
    expect(await pi.emit("tool_call", call, context())).toBeUndefined();
    await pi.emit("tool_result", { ...call, content: [{ type: "text", text: "SECRET_OUTPUT" }], isError: true }, context());
    const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId: piActionId("pi-session-1", "b1") });
    expect(lifecycle).toMatchObject({ status: "failed", valid: true, phases: { decision: null } });
    const ledger = openLedger(workspace);
    const all = JSON.stringify(ledger.getAllEvents());
    ledger.close();
    expect(all).not.toContain("SECRET_ARG");
    expect(all).not.toContain("SECRET_OUTPUT");

    const down = controlledWorkspace(agentId);
    installHookIntegration({ workspace: down, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${await freePort()}`, mode: "observe" });
    const quiet = await loaded(down, "observe", { timeoutMs: 300 });
    expect(await quiet.emit("tool_call", call, context())).toBeUndefined();
    await expect(quiet.emit("tool_result", { ...call, content: [], isError: false }, context())).resolves.toBeUndefined();
  });
});
