import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyManagedLease } from "../src/adapters/managedHookLease.js";
import { verifyBridgeLease } from "../src/bridge/bridgeAuth.js";
import { initGatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { leaseRevocationPaths, revokeLease } from "../src/leases/leaseStore.js";
import { authenticateStudioAgent } from "../src/studio/agentCredentialAuth.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { lockVault } from "../src/vault/vault.js";
import { createWireDispatcher } from "../src/wire/wireDispatcher.js";
import { initWorkspace } from "../src/workspace.js";
import { createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";

// P0-30 / AMC-1542: every consumer of the signed revocation list named by the spec (managedHookLease, bridgeAuth,
// gateway, workspaceRouter, wireDispatcher, agentCredentialAuth, studioServer verifyLeaseForScope) admits an
// unrevoked lease on a valid list and refuses EVERY lease once the list cannot be verified: a revoked id removed
// beside the old signature, or the list deleted with its signature kept.
const ADMIN = "lease-consumers-fixture-admin";

// A one-shot hook that runs right after the revocation list's signature verifies, to swap the file on disk
// between that check and any later use of the list.
const afterVerify = vi.hoisted(() => ({ next: null as null | { digest: string; run: () => void } }));
// P1-08: the store is one signed file, read once and verified by readAnchoredRevocationList.
vi.mock("../src/keys/revocationList.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/keys/revocationList.js")>();
  return { ...actual, readAnchoredRevocationList: (location: Parameters<typeof actual.readAnchoredRevocationList>[0]) => {
    const bytes = existsSync(location.path) ? readFileSync(location.path) : null;
    const signed = actual.readAnchoredRevocationList(location);
    const hook = afterVerify.next;
    if (bytes !== null && hook?.digest === sha256Hex(bytes)) { afterVerify.next = null; hook.run(); }
    return signed;
  } };
});
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

function directory(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function newWorkspace(path = directory("amc-lease-consumers-")): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "lease-consumers-fixture-passphrase");
  initWorkspace({ workspacePath: path, agentId: "default", trustBoundaryMode: "isolated" });
  return path;
}

function issue(workspace: string, scopes: string, routes: string, workspaceId?: string): string {
  return issueLeaseForCli({ workspace, ...(workspaceId ? { workspaceId } : {}), agentId: "default", ttl: "1h", scopes, routes,
    models: "*", rpm: 1000, tpm: 1_000_000, maxCostUsdPerDay: null }).token;
}

const leaseId = (token: string) => (JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { leaseId: string }).leaseId;

async function listen(server: Server): Promise<number> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  closers.push(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
  return (server.address() as { port: number }).port;
}

interface Consumer {
  name: string;
  scopes: string;
  routes: string;
  setup(): Promise<{ workspace: string; workspaceId?: string; admits(token: string): Promise<boolean> }>;
}

const consumers: Consumer[] = [
  { name: "managedHookLease", scopes: "hook:observe", routes: "/hooks", async setup() {
    const workspace = newWorkspace();
    const tokenPath = join(workspace, "hook.token");
    return { workspace, async admits(token) {
      writeFileSync(tokenPath, token); chmodSync(tokenPath, 0o600);
      return verifyManagedLease({ workspace, tokenPath, mode: "observe" }).valid;
    } };
  } },
  { name: "bridgeAuth", scopes: "gateway:llm", routes: "/openai", async setup() {
    const workspace = newWorkspace();
    return { workspace, admits: async (token) => verifyBridgeLease({ workspace, headers: { "x-amc-lease": token },
      requestUrl: new URL("http://127.0.0.1/openai/v1/chat/completions"), routePath: "/openai", requiredScope: "gateway:llm" }).ok };
  } },
  { name: "gateway", scopes: "gateway:llm", routes: "/openai", async setup() {
    const workspace = newWorkspace();
    const upstreamPort = await listen(createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "consumer-fixture", choices: [], usage: { total_tokens: 0 } }));
    }));
    initGatewayConfig(workspace, {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: { headerKeysDenylist: ["authorization"], jsonPathsDenylist: [], textRegexDenylist: [] },
      upstreams: { local: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true } },
      routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
      streamPassthrough: false,
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true },
      lease: { allowQueryCarrier: false }
    });
    const gateway = await startGateway({ workspace });
    closers.push(() => gateway.close());
    return { workspace, async admits(token) {
      const response = await fetch(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, { method: "POST",
        headers: { "content-type": "application/json", "x-amc-lease": token, "x-amc-agent-id": "default" },
        body: JSON.stringify({ model: "fixture", messages: [{ role: "user", content: "fixture" }] }) });
      await response.arrayBuffer();
      return response.status === 200;
    } };
  } },
  { name: "workspaceRouter", scopes: "gateway:llm", routes: "/", async setup() {
    const hostDir = directory("amc-lease-consumers-host-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "lease-consumers-fixture-passphrase");
    initHostDb(hostDir);
    createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
    const workspace = newWorkspace(hostWorkspaceDir(hostDir, "ws-a"));
    const probe = createServer();
    await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((done) => probe.close(() => done()));
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "ws-a" });
    closers.push(() => router.close());
    return { workspace, workspaceId: "ws-a", async admits(token) {
      const response = await fetch(`http://127.0.0.1:${port}/w/ws-a/api/state`, { headers: { "x-amc-lease": token } });
      // The router's own check answers with a "lease ..." error; anything else (here 404, or the workspace's own
      // agent-auth 401) means the router passed the lease on. The workspace refusing too is defence in depth.
      return !/lease/i.test(await response.text());
    } };
  } },
  { name: "wireDispatcher", scopes: "wire:submit", routes: "/wire", async setup() {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    ledger.startSession({ sessionId: "intake", runtime: "amc", binaryPath: "test", binarySha256: "fixture" });
    closers.push(async () => ledger.close());
    const dispatcher = createWireDispatcher({ workspace, ledger, intakeSessionId: "intake", monitorPublicKeys: getPublicKeyHistory(workspace, "monitor") });
    return { workspace, async admits(token) {
      const out = dispatcher.handle(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "work/accept", lease: token,
        params: { prompt: "fixture", providerId: "anthropic" } })}\n`));
      return "result" in JSON.parse(out.replies[0]!.toString("utf8"));
    } };
  } },
  { name: "agentCredentialAuth", scopes: "toolhub:intent", routes: "/", async setup() {
    const workspace = newWorkspace();
    return { workspace, admits: async (token) => authenticateStudioAgent({ workspace, headers: { "x-amc-lease": token },
      rawHeaders: ["x-amc-lease", token], url: new URL("http://127.0.0.1/toolhub/tools"), allowQueryCarrier: false }) !== null };
  } },
  { name: "studioServer verifyLeaseForScope", scopes: "toolhub:intent", routes: "/", async setup() {
    const workspace = newWorkspace();
    initToolsConfig(workspace);
    const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
    closers.push(() => server.close());
    return { workspace, async admits(token) {
      // The bootstrap admin authenticates the request, so only the route's own lease check reads the revocation list.
      const response = await fetch(new URL("/toolhub/intent", server.url), { method: "POST",
        headers: { "content-type": "application/json", "x-amc-admin-token": ADMIN, "x-amc-lease": token },
        body: JSON.stringify({ agentId: "default", toolName: "fs.read", args: { path: "README.md" }, requestedMode: "SIMULATE" }) });
      const body = await response.text();
      return response.status === 200 && !/lease/i.test(body);
    } };
  } }
];

describe("AMC-1542 every revocation consumer refuses an unverifiable list", () => {
  it.each(consumers)("$name", async (consumer) => {
    const { workspace, workspaceId, admits } = await consumer.setup();
    const live = issue(workspace, consumer.scopes, consumer.routes, workspaceId);
    const revoked = issue(workspace, consumer.scopes, consumer.routes, workspaceId);
    revokeLease(workspace, leaseId(revoked), "consumer fixture revocation");
    expect(await admits(live), "valid list: unrevoked lease").toBe(true);
    expect(await admits(revoked), "valid list: revoked lease").toBe(false);

    const paths = leaseRevocationPaths(workspace);
    const signedList = readFileSync(paths.file);
    const body = JSON.parse(signedList.toString("utf8"));
    writeFileSync(paths.file, JSON.stringify({ ...body, list: { ...body.list, revoked: [] } }));
    expect(await admits(revoked), "revoked id removed beside the old signature: revoked lease").toBe(false);
    expect(await admits(live), "revoked id removed beside the old signature: unrevoked lease").toBe(false);

    rmSync(paths.file);
    expect(await admits(revoked), "list deleted, signature kept: revoked lease").toBe(false);
    expect(await admits(live), "list deleted, signature kept: unrevoked lease").toBe(false);

    writeFileSync(paths.file, signedList);
    expect(await admits(live), "restored signed list").toBe(true);
  }, 60_000);
});

describe("AMC-1542 a list swapped after its signature check is never used", () => {
  it.each(consumers)("$name decides on the verified bytes only (P0-30)", async (consumer) => {
    const { workspace, workspaceId, admits } = await consumer.setup();
    const revoked = issue(workspace, consumer.scopes, consumer.routes, workspaceId);
    revokeLease(workspace, leaseId(revoked), "consumer fixture revocation");
    const paths = leaseRevocationPaths(workspace);
    const signedList = readFileSync(paths.file);
    const body = JSON.parse(signedList.toString("utf8"));
    let swaps = 0;
    afterVerify.next = { digest: sha256Hex(signedList), run: () => {
      writeFileSync(paths.file, JSON.stringify({ ...body, list: { ...body.list, revoked: [] } }));
      swaps += 1;
    } };
    expect(await admits(revoked), "revoked lease after the list was emptied between check and use").toBe(false);
    expect(swaps, "the swap ran between the signature check and the decision").toBe(1);
  }, 60_000);
});

describe("Studio /leases/status reports from one verified read (P0-30 follow-up)", () => {
  it("takes the count from the bytes whose signature verified, and none from an unverified list", async () => {
    const workspace = newWorkspace();
    const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
    closers.push(() => server.close());
    revokeLease(workspace, "status-revoked", "status fixture revocation");
    const paths = leaseRevocationPaths(workspace);
    const signedList = readFileSync(paths.file);
    const status = async () => (await fetch(new URL("/leases/status", server.url), { headers: { "x-amc-admin-token": ADMIN } })).json();
    afterVerify.next = { digest: sha256Hex(signedList), run: () => {
      const body = JSON.parse(signedList.toString("utf8"));
      writeFileSync(paths.file, JSON.stringify({ ...body, list: { ...body.list, revoked: [] } }));
    } };
    expect(await status()).toMatchObject({ revocationSignatureValid: true, revokedLeaseCount: 1 });
    expect(await status()).toMatchObject({ revocationSignatureValid: false, revokedLeaseCount: null, updatedTs: null });
  }, 60_000);
});
