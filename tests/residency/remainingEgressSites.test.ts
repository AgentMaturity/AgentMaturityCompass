/**
 * The egress paths that bypassed checkEgress until W3: each one refuses an active kill switch (or, for AMC's own hook
 * traffic, is exempt from it) and a residency block before any socket is opened, and the typed refusal propagates.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { forwardProviderHookEvent } from "../../src/adapters/hookForwarder.js";
import { postToBridge, type PiHookConfig } from "../../src/adapters/pi/piControlClient.js";
import { createPaymentAdapter } from "../../src/lighthouse/finance/paymentAdapter.js";
import { createPaymentServiceClient } from "../../src/lighthouse/finance/paymentServiceClient.js";
import { nativeMcpOAuthChallenge, nativeMcpOAuthFetch, nativeMcpOAuthNetwork } from "../../src/mcp/oauth/discovery.js";
import { resolveNativeMcpServer } from "../../src/setup/nativeMcpConfig.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { destinationRegistryPath } from "../../src/residency/destinationRegistry.js";
import { KillSwitchDenied, activateKillSwitch } from "../../src/runtime/killSwitch.js";
import { startShellEgressProxy } from "../../src/sandbox/egress/shellEgressProxy.js";
import type { ShellEgressRow } from "../../src/sandbox/sandboxTypes.js";
import { scoreFaithfulnessLLM } from "../../src/score/faithfulness.js";
import { createSteerPipeline } from "../../src/steer/pipeline.js";
import { createRaceStage, raceModels } from "../../src/steer/race.js";
import { wrapFetch } from "../../src/runtime/wrapFetch.js";
import { DefiniteFailureError } from "../../src/tools/toolTypes.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;
let origin: { server: Server; port: number; connections: number; url: string };

const kill = () => activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "workspace", id: "workspace" },
  mode: "stop_all", reason: "W3 egress fixture", incidentId: "inc-w3" });
/** A registry without its signature: every residency check in the workspace is refused (registry_unverifiable). */
const blockResidency = () => {
  mkdirSync(dirname(destinationRegistryPath(workspace)), { recursive: true });
  writeFileSync(destinationRegistryPath(workspace), "schemaVersion: amc.residency-destinations/v1\n");
};
const BLOCKS = [["an active kill switch", kill, KillSwitchDenied], ["a residency block", blockResidency, EgressBlocked]] as const;

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-w3-egress-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => res.writeHead(201, { "content-type": "application/json" })
      .end(JSON.stringify({ observed: true, receiptId: "r-1", choices: [{ message: { content: "[]" } }] })));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const port = (server.address() as { port: number }).port;
  origin = { server, port, connections: 0, url: `http://127.0.0.1:${port}` };
  server.on("connection", () => { origin.connections += 1; });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  origin.server.closeAllConnections();
  await new Promise<void>((done) => origin.server.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

describe("shell egress proxy", () => {
  const through = async (method: "GET" | "CONNECT") => {
    const rows: ShellEgressRow[] = [];
    const proxy = await startShellEgressProxy({ allowHosts: ["127.0.0.1"], record: (row) => rows.push(row), workspace, agentId: "default" });
    try {
      const status = await new Promise<number>((done, fail) => {
        const req = httpRequest({ host: "127.0.0.1", port: proxy.port, method, path: method === "CONNECT" ? `127.0.0.1:${origin.port}` : `${origin.url}/x`,
          headers: { "proxy-authorization": `Basic ${Buffer.from(`amc:${proxy.token}`).toString("base64")}` } });
        req.on("response", (res) => { res.resume(); done(res.statusCode ?? 0); });
        req.on("connect", (res, socket) => { socket.destroy(); done(res.statusCode ?? 0); });
        req.on("error", fail);
        req.end();
      });
      return { status, rows };
    } finally { proxy.close(); }
  };

  test("an admitted connection reaches the origin", async () => {
    expect((await through("GET")).status).toBe(201);
    expect((await through("CONNECT")).status).toBe(200);
    expect(origin.connections).toBe(2);
  });

  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} refuses each new HTTP and CONNECT connection before it opens, recording the denial`, async () => {
      await arrange();
      for (const method of ["GET", "CONNECT"] as const) {
        const { status, rows } = await through(method);
        expect(status).toBe(403);
        expect(rows).toEqual([expect.objectContaining({ host: "127.0.0.1", port: origin.port, decision: "deny",
          reason: expect.stringMatching(type === KillSwitchDenied ? /kill_switch_active/ : /Residency egress blocked/) })]);
      }
      expect(origin.connections).toBe(0);
    });
  }
});

describe("MCP OAuth discovery", () => {
  const network = () => nativeMcpOAuthNetwork(new URL(`${origin.url}/mcp`), { workspace });
  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} refuses the challenge, metadata requests and the resolved server, typed and before any socket`, async () => {
      await arrange();
      await expect(nativeMcpOAuthChallenge(new URL(`${origin.url}/mcp`), 5_000, network())).rejects.toBeInstanceOf(type);
      await expect(nativeMcpOAuthFetch(new URL(`${origin.url}/.well-known/oauth-protected-resource`), { method: "GET" }, 5_000, network()))
        .rejects.toBeInstanceOf(type);
      await expect(resolveNativeMcpServer({ schemaVersion: 1, server: { transport: "streamable-http", id: "oauth_fixture", url: `${origin.url}/mcp`,
        origin: origin.url, timeoutMs: 5_000, auth: { kind: "oauth2", clientId: "synthetic-client" } } }, { workspace })).rejects.toBeInstanceOf(type);
      expect(origin.connections).toBe(0);
    });
  }
});

describe("provider hook forwarder (AMC's own traffic)", () => {
  const forward = () => forwardProviderHookEvent({ workspace, provider: "claude-code", agentId: "hook-agent", bridgeBase: origin.url,
    tokenFile: join(workspace, ".amc", "hooks", "claude-code.lease"), retryDelayMs: 0,
    rawInput: JSON.stringify({ session_id: "s-1", hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "toolu_w3_01", tool_input: { file_path: "a.txt" } }) });
  beforeEach(() => { installHookIntegration({ workspace, provider: "claude-code", agentId: "hook-agent", bridgeBase: origin.url }); });

  test("an active kill switch does not refuse the hook record (agentId system)", async () => {
    await kill();
    expect((await forward()).receiptId).toBe("r-1");
    expect(origin.connections).toBe(1);
  });

  test("a residency block refuses the POST typed, without a retry, before any socket", async () => {
    blockResidency();
    await expect(forward()).rejects.toBeInstanceOf(EgressBlocked);
    expect(origin.connections).toBe(0);
  });
});

describe("Pi extension Bridge client (AMC's own traffic)", () => {
  const config = (bridgeBase: string): PiHookConfig => ({ workspace, agentId: "pi-agent", bridgeBase, token: "t", receiptPublicKeys: [] });
  const fetched = () => vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ observed: true }), { status: 200 }));

  test("a residency block refuses a remote Bridge POST before fetch; a kill does not", async () => {
    const spy = fetched();
    await kill();
    await expect(postToBridge(config("https://bridge.example"), "/p", "{}", 5_000)).resolves.toEqual({ observed: true });
    blockResidency();
    await expect(postToBridge(config("https://bridge.example"), "/p", "{}", 5_000)).rejects.toBeInstanceOf(EgressBlocked);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("a loopback Bridge is AMC's own local process: no check is loaded", async () => {
    const spy = fetched();
    blockResidency();
    await expect(postToBridge(config(origin.url), "/p", "{}", 5_000)).resolves.toEqual({ observed: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("finance payment fixture client", () => {
  const client = () => createPaymentServiceClient({ baseUrl: origin.url, token: "fixture-token", workspace, agentId: "default" });
  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} is a definite failure carrying the typed refusal, before any socket, through the adapter too`, async () => {
      await arrange();
      const refusal = await client().listAccounts().then(() => null, (error: unknown) => error);
      expect(refusal).toBeInstanceOf(DefiniteFailureError);
      expect((refusal as Error).cause).toBeInstanceOf(type);
      const adapter = createPaymentAdapter({ client: client(), adapterId: "native" });
      await expect(adapter.dispatch({ executionId: "e-1", idempotencyKey: "idem-key-0001", args: { kind: "payout", sourceAccountId: "acct_1",
        payeeId: "payee_1", amountMinor: 100, currency: "USD", reference: "REF-1" } })).rejects.toBeInstanceOf(DefiniteFailureError);
      expect(origin.connections).toBe(0);
    });
  }
});

describe("faithfulness LLM judge", () => {
  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} refuses the judge call typed, never falling back to simulated scoring`, async () => {
      await arrange();
      await expect(scoreFaithfulnessLLM({ context: "The sky is blue.", output: "The sky is blue." },
        { mode: "llm", apiEndpoint: `${origin.url}/v1/chat/completions`, apiKey: "k", workspace })).rejects.toBeInstanceOf(type);
      expect(origin.connections).toBe(0);
    });
  }
});

describe("steer race fan-out", () => {
  const race = () => raceModels({ method: "POST", body: "{}" }, { workspace, agentId: "default",
    candidates: [{ id: "a", url: `${origin.url}/a` }, { id: "b", url: `${origin.url}/b` }] });

  test("without a block both candidates are raced", async () => {
    expect((await race()).candidates.filter((c) => !c.error)).toHaveLength(2);
  });

  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} refuses the whole race typed before any candidate is sent`, async () => {
      await arrange();
      await expect(race()).rejects.toBeInstanceOf(type);
      expect(origin.connections).toBe(0);
    });
  }

  test("a kill that lands during the race refuses wrapFetch's winner re-fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await kill();
      return new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }] }));
    });
    const original = vi.fn(async () => new Response("{}"));
    const wrapped = wrapFetch(original, { agentId: "default", gatewayBaseUrl: origin.url, forceBaseUrl: false,
      steerPipeline: createSteerPipeline({ stages: [createRaceStage({ workspace, candidates: [{ id: "a", url: `${origin.url}/a` }] })] }) });
    await expect(wrapped(`${origin.url}/v1`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(KillSwitchDenied);
    expect(original).not.toHaveBeenCalled();
  });
});

describe("wrapFetch ordinary dispatch", () => {
  const wrap = (original: typeof fetch, extra: { maxRetries?: number } = {}) => wrapFetch(original, { agentId: "default",
    gatewayBaseUrl: origin.url, forceBaseUrl: false, workspace, retryBaseDelayMs: 1, ...extra });

  test("without a block the request reaches the provider", async () => {
    expect((await wrap(fetch)(`${origin.url}/v1`, { method: "POST", body: "{}" })).status).toBe(201);
    expect(origin.connections).toBe(1);
  });

  for (const [name, arrange, type] of BLOCKS) {
    test(`${name} refuses typed before any socket, without a retry`, async () => {
      await arrange();
      const original = vi.fn(fetch);
      await expect(wrap(original, { maxRetries: 3 })(`${origin.url}/v1`, { method: "GET" })).rejects.toBeInstanceOf(type);
      expect(original).not.toHaveBeenCalled();
      expect(origin.connections).toBe(0);
    });
  }

  test("a kill that lands after a retriable status refuses the retry", async () => {
    const original = vi.fn(async () => { await kill(); return new Response("busy", { status: 503 }); });
    await expect(wrap(original, { maxRetries: 3 })(`${origin.url}/v1`, { method: "GET" })).rejects.toBeInstanceOf(KillSwitchDenied);
    expect(original).toHaveBeenCalledTimes(1);
  });

  test("a race stage without its own workspace is checked against wrapFetch's", async () => {
    blockResidency();
    const original = vi.fn(fetch);
    const wrapped = wrapFetch(original, { agentId: "default", gatewayBaseUrl: origin.url, forceBaseUrl: false, workspace,
      steerPipeline: createSteerPipeline({ stages: [createRaceStage({ candidates: [{ id: "a", url: `${origin.url}/a` }] })] }) });
    await expect(wrapped(`${origin.url}/v1`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(EgressBlocked);
    expect(original).not.toHaveBeenCalled();
    expect(origin.connections).toBe(0);
  });
});
