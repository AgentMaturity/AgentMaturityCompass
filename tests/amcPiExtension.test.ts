import { generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { createAmcPiExtension, type PiExtensionApi, type PiToolCallContext } from "../src/adapters/pi/amcPiExtension.js";
import { piActionId } from "../src/adapters/pi/piIdentity.js";
import { PI_CONTROL_PATH, PI_OBSERVE_PATH } from "../src/adapters/pi/piControlClient.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { CONTROL_HOOK_PATH } from "../src/bridge/hookControl.js";
import { OBSERVED_AEP_HOOK_PATH } from "../src/bridge/hookIngress.js";
import { getPrivateKeyPem } from "../src/crypto/keys.js";
import { openLedger } from "../src/ledger/ledger.js";
import { mintReceipt } from "../src/receipts/receipt.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
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

function context(mode: PiToolCallContext["mode"] = "print"): PiToolCallContext {
  return { mode, hasUI: mode === "tui" || mode === "rpc", sessionManager: { getSessionId: () => "pi-session-1" },
    ui: { notify: () => undefined } };
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
async function withFakeBridge(workspace: string, respond: (res: ServerResponse, body: string, req: IncomingMessage) => void) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => respond(res, body, req));
  });
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

  test("control: a decision is single-use; a restarted Pi re-sending the call gets no second decision and is blocked", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const call = { toolName: "read", toolCallId: "toolu_restart", input: { path: join(workspace, "workspace", "public.txt") } };
    expect(await (await loaded(workspace, "control")).emit("tool_call", { ...call, input: { ...call.input } }, context())).toBeUndefined();
    expect(await (await loaded(workspace, "control")).emit("tool_call", { ...call, input: { ...call.input } }, context())).toEqual(UNAVAILABLE);
    expect(decisionRows(workspace, piActionId("pi-session-1", "toolu_restart"))).toHaveLength(1);
  });

  test("control: an allowed call's input is frozen, so a later Pi handler cannot change what runs", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    pi.api.on("tool_call", ((event: { input: Record<string, unknown> }) => { "use strict"; event.input.path = "/etc/passwd"; }) as never);
    const call = { toolName: "read", toolCallId: "toolu_frozen", input: { path: join(workspace, "workspace", "public.txt") } };
    expect(await pi.emit("tool_call", call, context())).toMatchObject({ block: true });
    expect(Object.isFrozen(call.input)).toBe(true);
    expect(call.input.path).toBe(join(workspace, "workspace", "public.txt"));
  });

  test("control: a call that needs approval is blocked in every mode; nothing is asked inside Pi", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    for (const mode of ["tui", "print"] as const) {
      const write = { toolName: "write", toolCallId: `w-${mode}`, input: { path: join(workspace, "workspace", "output", `${mode}.txt`), content: "x" } };
      expect(await pi.emit("tool_call", write, context(mode))).toEqual({ block: true, reason: expect.stringContaining("cannot carry an AMC approval") });
    }
  });

  test("control: an answer without a valid AMC signature over exactly this request is refused", async () => {
    const forged = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const signers: Array<(workspace: string) => { key: string; request?: string; actionId?: string }> = [
      () => ({ key: forged }),
      (workspace) => ({ key: getPrivateKeyPem(workspace, "monitor"), request: "{\"another\":\"request\"}" }),
      (workspace) => ({ key: getPrivateKeyPem(workspace, "monitor"), actionId: "pi.another-action" }),
    ];
    for (const signer of signers) {
      const workspace = controlledWorkspace(agentId);
      const signing = signer(workspace);
      await withFakeBridge(workspace, (res, body, req) => {
        if (req.url === PI_OBSERVE_PATH) return void res.writeHead(201, { "content-type": "application/json" }).end("{}");
        const actionId = signing.actionId ?? piActionId("pi-session-1", "c");
        const providerResponse = { block: false, requestSha256: sha256Hex(Buffer.from(signing.request ?? body, "utf8")) };
        const providerResponseSha256 = sha256Hex(Buffer.from(canonicalize(providerResponse), "utf8"));
        const { receipt } = mintReceipt({ kind: "action_state", ts: Date.now(), agentId, providerId: "hook-control:pi", model: null,
          eventHash: "0".repeat(64), bodySha256: providerResponseSha256, sessionId: "s", privateKeyPem: signing.key,
          action: { executionId: actionId, idempotencyKey: "c", authorizationRecordDigest: null, enforcement: { level: "enforced", boundary: "pi:tool_call" }, state: "authorized" } });
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ controlled: true, provider: "pi",
          actionId: piActionId("pi-session-1", "c"), decision: "allow", providerResponse, providerResponseSha256, receipt }));
      });
      expect(await (await loaded(workspace, "control")).emit("tool_call", { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } }, context()))
        .toEqual(UNAVAILABLE);
    }
  });

  test("control refuses a Pi event it does not recognise before sending anything", async () => {
    const workspace = controlledWorkspace(agentId);
    let requests = 0;
    await withFakeBridge(workspace, (res) => { requests += 1; res.writeHead(500).end(); });
    const pi = await loaded(workspace, "control");
    for (const event of [{ toolName: "read", input: { path: "x" } }, { toolName: "read", toolCallId: "c", input: "x" },
      { toolName: "", toolCallId: "c", input: {} }, { toolName: "read", toolCallId: "c", input: [] },
      { toolName: "read", toolCallId: "c", parentToolCallId: 7, input: {} }]) {
      expect(await pi.emit("tool_call", event, context())).toEqual(UNAVAILABLE);
    }
    expect(requests).toBe(0);
  });

  test("control fails closed: Bridge down, timeout, HTTP 500, malformed or unbound answers", async () => {
    const cases: Array<[string, (res: ServerResponse) => void]> = [
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

  test("control fails closed on the lease and the installation: missing lease, lease mode 0644, no manifest, mode mismatch, no receipt keys", async () => {
    const call = { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } };
    const setups: Array<(workspace: string) => void> = [
      (workspace) => rmSync(join(workspace, ".amc", "hooks", "pi.lease")),
      (workspace) => chmodSync(join(workspace, ".amc", "hooks", "pi.lease"), 0o644),
      (workspace) => rmSync(join(workspace, ".amc", "hooks", "pi.json")),
      (workspace) => {
        const path = join(workspace, ".amc", "hooks", "pi.json");
        writeFileSync(path, readFileSync(path, "utf8").replace('"mode": "control"', '"mode": "observe"'));
      },
      (workspace) => {
        const path = join(workspace, ".amc", "hooks", "pi.json");
        writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), receiptPublicKeys: [] }));
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
