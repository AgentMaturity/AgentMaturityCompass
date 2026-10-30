import { generateKeyPairSync } from "node:crypto";
import { chmodSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { createAmcPiExtension, type PiExtensionApi, type PiToolCallContext } from "../src/adapters/pi/amcPiExtension.js";
import { piActionId, piSessionSha256 } from "../src/adapters/pi/piIdentity.js";
import { piGovernance } from "../src/bridge/piSessionRegistry.js";
import { PI_CONTROL_PATH, PI_OBSERVE_PATH } from "../src/adapters/pi/piControlClient.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { CONTROL_HOOK_PATH } from "../src/bridge/hookControl.js";
import { OBSERVED_AEP_HOOK_PATH } from "../src/bridge/hookIngress.js";
import { getPrivateKeyPem } from "../src/crypto/keys.js";
import { rotatePurposeKeys } from "../src/keys/purposeKeys.js";
import { getHookIntegrationStatus } from "../src/adapters/hookIntegration.js";
import { openLedger } from "../src/ledger/ledger.js";
import { mintReceipt } from "../src/receipts/receipt.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { controlledWorkspace, fakePiPackage, freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "pi-extension-agent";
const UNAVAILABLE = { block: true, reason: "AMC control unavailable; action denied." };
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  removeFixtureWorkspaces();
});

type Handler = (event: Record<string, unknown>, ctx: PiToolCallContext) => unknown;

const BUILTINS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
type ToolInfo = { name: string; sourceInfo: { source: string; path: string } };
const builtinInfo = (name: string): ToolInfo => ({ name, sourceInfo: { source: "builtin", path: `builtin:${name}` } });

/**
 * Pi's dispatch as the 1.0.2 and 1.0.4 bundles run it: handlers in order, the first block wins, a throw blocks. Its
 * tool registry (`getAllTools`) lists Pi's built-ins unless `tools` says otherwise.
 */
function fakePi(tools: ToolInfo[] | null = BUILTINS.map(builtinInfo)) {
  const handlers = new Map<string, Handler[]>();
  const api: PiExtensionApi = {
    on: (name, handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler as Handler]);
      return () => undefined;
    },
    ...(tools ? { getAllTools: () => tools } : {}),
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

/** Pi's context; `cwd` is filled in by `loaded` with the workspace's physical path, as Pi's process.cwd() reports it. */
function context(mode: PiToolCallContext["mode"] = "print", sessionId = "pi-session-1"): PiToolCallContext {
  return { mode, hasUI: mode === "tui" || mode === "rpc", cwd: "", sessionManager: { getSessionId: () => sessionId },
    ui: { notify: () => undefined } };
}

/** The module the installation bound; the tests run the TypeScript source, so they name it. */
const MODULE = resolve("dist", "adapters", "pi", "amcPiExtension.js");

async function loaded(workspace: string, mode: "control" | "observe",
  options: { piVersion?: string | null; timeoutMs?: number; modulePath?: string; tools?: ToolInfo[] | null } = {}) {
  const pi = fakePi(options.tools);
  await createAmcPiExtension({ workspace, mode, piVersion: options.piVersion === undefined ? "1.0.4" : options.piVersion,
    timeoutMs: options.timeoutMs ?? 10_000, modulePath: options.modulePath ?? MODULE })(pi.api);
  const cwd = realpathSync.native(workspace);
  return { ...pi, emit: (name: string, event: Record<string, unknown>, ctx: PiToolCallContext) => pi.emit(name, event, { ...ctx, cwd: ctx.cwd || cwd }) };
}

/** A workspace's Pi control or observe installation, bound to a Pi `piVersion` on disk, served by a real Bridge. */
async function withBridge(workspace: string, mode: "control" | "observe", piVersion = "1.0.4") {
  const port = await freePort();
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  servers.push({ close: (done: () => void) => void bridge.close().then(done) } as unknown as Server);
  installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${port}`, mode, piPackageDir: fakePiPackage(piVersion) });
}

/** A registration answer signed with `key` (default: the workspace's real receipt purpose key), as AMC returns it. */
function registrationAnswer(workspace: string, body: string, key = getPrivateKeyPem(workspace, "receipt")): string {
  const pi = (JSON.parse(body) as { pi: { version: string; mode: string; sessionId: string; extensionSha256: string } }).pi;
  const record = { kind: "amc.pi-session-registration/v1", agentId, piSessionSha256: piSessionSha256(pi.sessionId), piVersion: pi.version,
    extensionSha256: pi.extensionSha256, piInstallSha256: "1".repeat(64), manifestSha256: "2".repeat(64), mode: pi.mode, qualified: true,
    requestSha256: sha256Hex(Buffer.from(body, "utf8")) };
  const { receipt } = mintReceipt({ kind: "work_accepted", ts: Date.now(), agentId, providerId: "hook-registration:pi", model: null,
    eventHash: "0".repeat(64), bodySha256: sha256Hex(Buffer.from(canonicalize(record), "utf8")), sessionId: "s", privateKeyPem: key });
  return JSON.stringify({ registered: true, idempotentReplay: false, provider: "pi", record, receipt });
}

/**
 * A loopback server installed as the workspace's Bridge. It answers session registrations as AMC would (signed with the
 * real receipt key), records observations, and answers every other request with `respond`, so the control answer is
 * what each case varies.
 */
async function withFakeBridge(workspace: string, respond: (res: ServerResponse, body: string, req: IncomingMessage) => void,
  registrationKey?: () => string) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => body.includes('"session_start"')
      ? void res.writeHead(201, { "content-type": "application/json" }).end(registrationAnswer(workspace, body, registrationKey?.()))
      : req.url === PI_OBSERVE_PATH ? void res.writeHead(201, { "content-type": "application/json" }).end('{"observed":true}')
        : respond(res, body, req));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${address.port}`, mode: "control", piPackageDir: fakePiPackage() });
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
    // The outcome is recorded at the control route too, bound to the decision it follows, with the input AMC authorized.
    expect(lifecycle).toMatchObject({ status: "completed", valid: true, failClosed: false, provider: "pi", authorizationMismatch: false, observationConflict: false });
    const ledger = openLedger(workspace);
    const all = JSON.stringify(ledger.getAllEvents());
    ledger.close();
    expect(all).not.toContain("public fixture");
    expect(all).not.toContain(path);
  });

  test("control: after the receipt key rotates, status reports drift and a reinstall pins the new key, so allowed reads run", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: process.env.AMC_VAULT_PASSPHRASE });
    const call = (id: string) => ({ toolName: "read", toolCallId: id, input: { path: join(workspace, "workspace", "public.txt") } });
    expect(await (await loaded(workspace, "control")).emit("tool_call", call("before-reinstall"), context())).toEqual(UNAVAILABLE);
    expect(getHookIntegrationStatus({ workspace, provider: "pi" })).toMatchObject({ state: "drifted",
      issues: expect.arrayContaining([expect.stringContaining("receipt signing keys changed")]) });
    const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "pi.json"), "utf8")) as { bridgeBase: string; piInstall: { packageDir: string } };
    installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: manifest.bridgeBase, mode: "control", piPackageDir: manifest.piInstall.packageDir });
    expect(await (await loaded(workspace, "control")).emit("tool_call", call("after-reinstall"), context())).toBeUndefined();
  });

  test("control: unmapped tools and unqualified Pi versions are blocked with AMC's reason", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    expect(await pi.emit("tool_call", { toolName: "my_ext_tool", toolCallId: "c1", input: {} }, context()))
      .toEqual({ block: true, reason: "Pi tool my_ext_tool is not mapped to an allowed ToolHub tool." });

    // A session reporting another Pi than the one bound on disk, or none it can read, cannot register: blocked.
    const old = await loaded(workspace, "control", { piVersion: "1.1.0" });
    expect(await old.emit("tool_call", { toolName: "read", toolCallId: "c2", input: { path: "workspace/public.txt" } }, context("print", "session-110")))
      .toEqual(UNAVAILABLE);
    const unreadable = await loaded(workspace, "control", { piVersion: null });
    expect(await unreadable.emit("tool_call", { toolName: "read", toolCallId: "c3", input: { path: "workspace/public.txt" } }, context("print", "session-unknown")))
      .toEqual(UNAVAILABLE);

    const unqualified = controlledWorkspace(agentId);
    await withBridge(unqualified, "control", "1.1.0");
    expect(await (await loaded(unqualified, "control", { piVersion: "1.1.0" })).emit("tool_call",
      { toolName: "read", toolCallId: "c4", input: { path: "workspace/public.txt" } }, context("print", "session-110")))
      .toEqual({ block: true, reason: "AMC has not qualified Pi 1.1.0" });
  }, 120_000);

  test("control: a mapped tool name an extension took over in Pi's registry, or a registry AMC cannot read, is blocked", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const call = (id: string) => ({ toolName: "read", toolCallId: id, input: { path: "workspace/public.txt" } });
    const replaced = [...BUILTINS.filter((name) => name !== "read").map(builtinInfo),
      { name: "read", sourceInfo: { source: "local", path: "/elsewhere/.pi/extensions/evil.js" } }];
    expect(await (await loaded(workspace, "control", { tools: replaced })).emit("tool_call", call("ext"), context()))
      .toEqual({ block: true, reason: expect.stringContaining("not Pi's built-in") });
    expect(await (await loaded(workspace, "control", { tools: null })).emit("tool_call", call("none"), context()))
      .toEqual({ block: true, reason: expect.stringContaining("not Pi's built-in") });
    expect(await (await loaded(workspace, "control")).emit("tool_call", call("builtin"), context())).toBeUndefined();
  });

  test("control: a decision is single-use; a restarted Pi re-sending the call gets no second decision and is blocked", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const call = { toolName: "read", toolCallId: "toolu_restart", input: { path: join(workspace, "workspace", "public.txt") } };
    expect(await (await loaded(workspace, "control")).emit("tool_call", { ...call, input: { ...call.input } }, context())).toBeUndefined();
    expect(await (await loaded(workspace, "control")).emit("tool_call", { ...call, input: { ...call.input } }, context())).toEqual(UNAVAILABLE);
    expect(decisionRows(workspace, piActionId("pi-session-1", "toolu_restart"))).toHaveLength(1);
  });

  test("control: the input is frozen before it is sent, so a mutation while AMC decides cannot change what runs", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    const path = join(workspace, "workspace", "public.txt");
    const call = { toolName: "read", toolCallId: "toolu_inflight", input: { path } };
    // Any code holding Pi's input object (another extension, a timer) tries to change it once the control request is on the wire.
    const realFetch = globalThis.fetch;
    let attempted = false;
    let mutated = false;
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(init?.body).includes('"tool_call"')) {
        attempted = true;
        try { (call.input as { path: string }).path = "/etc/hosts"; mutated = true; } catch { mutated = false; }
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      expect(await pi.emit("tool_call", call, context())).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
    expect({ attempted, mutated, path: call.input.path, frozen: Object.isFrozen(call.input) }).toEqual({ attempted: true, mutated: false, path, frozen: true });
  });

  test("control: input that is not plain data (getters, proxies, class instances, symbol keys, holes) is refused before anything is sent", async () => {
    const workspace = controlledWorkspace(agentId);
    let requests = 0;
    await withFakeBridge(workspace, (res) => { requests += 1; res.writeHead(500).end(); });
    const pi = await loaded(workspace, "control");
    const getter = Object.defineProperty({}, "path", { get: () => "workspace/public.txt", enumerable: true });
    const inputs: unknown[] = [getter, new Proxy({ path: "workspace/public.txt" }, {}), { path: new URL("file:///etc/hosts") },
      { path: "x", [Symbol("s")]: 1 }, { path: "x", edits: new Array(2) }, { path: "x", limit: Number.NaN }, Object.assign(Object.create({ inherited: 1 }), { path: "x" })];
    for (const [index, input] of inputs.entries()) {
      expect(await pi.emit("tool_call", { toolName: "read", toolCallId: `plain-${index}`, input }, context()), String(index)).toEqual(UNAVAILABLE);
    }
    expect(requests).toBe(0);
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
      // A ledger-row key that was never a receipt key shares the monitor role but is not pinned: only receipt keys are.
      (workspace) => {
        rotatePurposeKeys({ workspace, purposes: ["receipt"], passphrase: process.env.AMC_VAULT_PASSPHRASE });
        rotatePurposeKeys({ workspace, purposes: ["ledger-row"], passphrase: process.env.AMC_VAULT_PASSPHRASE });
        const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "pi.json"), "utf8")) as { bridgeBase: string };
        installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: manifest.bridgeBase, mode: "control", piPackageDir: fakePiPackage() });
        return { key: getPrivateKeyPem(workspace, "ledger-row") };
      },
      // A real AMC key of another purpose: only the receipt purpose's keys, pinned at install, are accepted.
      (workspace) => ({ key: getPrivateKeyPem(workspace, "artifact-seal") }),
      (workspace) => ({ key: getPrivateKeyPem(workspace, "receipt"), request: "{\"another\":\"request\"}" }),
      (workspace) => ({ key: getPrivateKeyPem(workspace, "receipt"), actionId: "pi.another-action" }),
    ];
    for (const signer of signers) {
      const workspace = controlledWorkspace(agentId);
      let signing: ReturnType<typeof signer> = { key: forged };
      await withFakeBridge(workspace, (res, body) => {
        const actionId = signing.actionId ?? piActionId("pi-session-1", "c");
        const providerResponse = { block: false, requestSha256: sha256Hex(Buffer.from(signing.request ?? body, "utf8")) };
        const providerResponseSha256 = sha256Hex(Buffer.from(canonicalize(providerResponse), "utf8"));
        const { receipt } = mintReceipt({ kind: "action_state", ts: Date.now(), agentId, providerId: "hook-control:pi", model: null,
          eventHash: "0".repeat(64), bodySha256: providerResponseSha256, sessionId: "s", privateKeyPem: signing.key,
          action: { executionId: actionId, idempotencyKey: "c", authorizationRecordDigest: null, enforcement: { level: "enforced", boundary: "pi:tool_call" }, state: "authorized" } });
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ controlled: true, provider: "pi",
          actionId: piActionId("pi-session-1", "c"), decision: "allow", providerResponse, providerResponseSha256, receipt }));
      });
      signing = signer(workspace);
      expect(await (await loaded(workspace, "control")).emit("tool_call", { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } }, context()))
        .toEqual(UNAVAILABLE);
    }
  }, 120_000);

  test("control: a session registers at session_start, before any call, as a lease-holder attestation AMC checks on disk", async () => {
    const workspace = controlledWorkspace(agentId);
    await withBridge(workspace, "control");
    const pi = await loaded(workspace, "control");
    expect(piGovernance(workspace, agentId)).toMatchObject({ claim: "not_governed", registeredSessions: 0 });
    for (const handler of pi.handlers.get("session_start") ?? []) await handler({ type: "session_start", reason: "startup" }, context());
    expect(piGovernance(workspace, agentId)).toMatchObject({ claim: "enforced_at_pi_tool_call", registeredSessions: 1, qualifiedSessions: 1 });
  });

  test("control: no session registration, no call: a module AMC did not install or a forged registration answer blocks", async () => {
    const call = { toolName: "read", toolCallId: "c", input: { path: "workspace/public.txt" } };
    const foreignModule = controlledWorkspace(agentId);
    await withBridge(foreignModule, "control");
    expect(await (await loaded(foreignModule, "control", { modulePath: resolve("package.json") })).emit("tool_call", call, context())).toEqual(UNAVAILABLE);
    expect(piGovernance(foreignModule, agentId)).toMatchObject({ registeredSessions: 0 });

    const forged = controlledWorkspace(agentId);
    let controlRequests = 0;
    const foreignKey = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await withFakeBridge(forged, (res) => { controlRequests += 1; res.writeHead(201, { "content-type": "application/json" }).end("{}"); }, () => foreignKey);
    expect(await (await loaded(forged, "control")).emit("tool_call", call, context())).toEqual(UNAVAILABLE);
    // Registration comes first; when its answer does not verify, nothing else is sent.
    expect(controlRequests).toBe(0);
  }, 120_000);

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
    installHookIntegration({ workspace: down, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${await freePort()}`, mode: "control", piPackageDir: fakePiPackage() });
    expect(await (await loaded(down, "control")).emit("tool_call", { toolName: "read", toolCallId: "c", input: { path: "x" } }, context())).toEqual(UNAVAILABLE);
  }, 120_000);

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
  }, 120_000);

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
  }, 120_000);
});
