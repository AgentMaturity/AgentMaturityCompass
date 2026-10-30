import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveNativeMcpOAuth } from "../../src/mcp/oauth/authorize.js";
import { NativeMcpOAuthTokenStore, type NativeMcpOAuthGrant } from "../../src/mcp/oauth/tokenStore.js";
import { resolveNativeMcpServer, type NativeMcpConfiguration } from "../../src/setup/nativeMcpConfig.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName } from "../../src/mcp/nativeMcpClient.js";
import { agentToolset } from "../../src/agent/agentToolset.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { SessionService } from "../../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../../src/workspace.js";
import { removeActionPolicy } from "../helpers/actionPolicyFixtures.js";

/**
 * WP41 (PXA-18, PXA-19, PXB-09): a loopback authorization server that rotates
 * refresh tokens and rejects reuse, as a public-client AS with reuse detection does.
 */
const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const TIMEOUT = 3000;
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const done of cleanups.splice(0).reverse()) await done(); vi.unstubAllEnvs(); });

interface Authority {
  origin: string; endpoint: URL; issuer: string; root: string; store: NativeMcpOAuthTokenStore; home: string; file: string;
  refreshRequests: number; reuseRejected: number; bearers: string[];
  /** Token lifetime for the next issued access token. */
  nextExpiresIn: number;
  tokenDelayMs: number;
  validAccess: Set<string>;
  refresh: string;
}

async function authority(): Promise<Authority> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp41-oauth-")));
  const home = join(root, "credentials"); mkdirSync(home, { mode: 0o700 });
  const file = join(home, ".credentials.yaml");
  const a: Authority = { origin: "", endpoint: new URL("http://127.0.0.1/"), issuer: "", root, home, file,
    store: new NativeMcpOAuthTokenStore({ homeDir: home, path: file, projectDir: null, userEnvPath: join(root, "unused-env"), includeDotenv: false, env: {} }),
    refreshRequests: 0, reuseRejected: 0, bearers: [], nextExpiresIn: 3600, tokenDelayMs: 150, validAccess: new Set(["access-0"]), refresh: "refresh-0" };
  let generation = 0;
  const json = (res: import("node:http").ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", connection: "close", ...headers }); res.end(JSON.stringify(body));
  };
  const http: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const path = new URL(req.url ?? "/", a.origin).pathname;
    if (req.method === "GET" && path === "/prm") { json(res, 200, { resource: a.endpoint.href, authorization_servers: [a.issuer] }); return; }
    if (req.method === "GET" && path === "/.well-known/oauth-authorization-server/issuer/path") {
      json(res, 200, { issuer: a.issuer, authorization_endpoint: a.origin + "/authorize", token_endpoint: a.origin + "/token",
        code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true }); return;
    }
    if (req.method === "POST" && path === "/token") {
      a.refreshRequests++;
      const form = new URLSearchParams(body);
      await new Promise(resolve => setTimeout(resolve, a.tokenDelayMs));
      if (form.get("grant_type") !== "refresh_token" || form.get("refresh_token") !== a.refresh) { a.reuseRejected++; json(res, 400, { error: "invalid_grant" }); return; }
      generation++;
      a.refresh = `refresh-${generation}`;
      const access = `access-${generation}`; a.validAccess.add(access);
      json(res, 200, { access_token: access, token_type: "Bearer", refresh_token: a.refresh, expires_in: a.nextExpiresIn, scope: "read" }); return;
    }
    if (req.method === "POST" && path === "/mcp/v1") {
      const authorization = req.headers.authorization;
      if (authorization === undefined) {
        json(res, 401, {}, { "www-authenticate": `Bearer resource_metadata="${a.origin}/prm", scope="read"` }); return;
      }
      const rpc = JSON.parse(body) as { id?: number | string; method?: string };
      a.bearers.push(`${rpc.method} ${authorization}`);
      if (!a.validAccess.has(authorization.replace(/^Bearer /, ""))) { json(res, 401, {}); return; }
      let result: unknown;
      if (rpc.method === "server/discover") result = { resultType: "complete", supportedVersions: ["2026-07-28"],
        _meta: { "io.modelcontextprotocol/serverInfo": { name: "wp41-oauth", version: "1" } } };
      else if (rpc.method === "tools/list") result = { resultType: "complete", tools: [{ name: "lookup", description: "lookup",
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }] };
      else if (rpc.method === "tools/call") result = { resultType: "complete", content: [{ type: "text", text: "ok" }] };
      else { json(res, 400, {}); return; }
      json(res, 200, { jsonrpc: "2.0", id: rpc.id, result }); return;
    }
    json(res, 404, {});
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address(); if (!address || typeof address === "string") throw new Error("listen failed");
  a.origin = `http://127.0.0.1:${address.port}`; a.endpoint = new URL(a.origin + "/mcp/v1"); a.issuer = a.origin + "/issuer/path";
  cleanups.push(async () => { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  return a;
}

function grant(a: Authority, expiresAt: Date): NativeMcpOAuthGrant {
  return { v: 1, issuer: a.issuer, resource: a.endpoint.href, clientId: "synthetic-client", scopes: ["read"],
    accessToken: "access-0", refreshToken: "refresh-0", expiresAt: expiresAt.toISOString() };
}
const config = { kind: "oauth2" as const, clientId: "synthetic-client" };
const otherStore = (a: Authority) => new NativeMcpOAuthTokenStore({ homeDir: a.home, path: a.file, projectDir: null,
  userEnvPath: join(a.root, "unused-env"), includeDotenv: false, env: {} });

describe("WP41 MCP OAuth refresh coordination", () => {
  test("PXA-18: two concurrent refreshes in one process redeem one rotating refresh token", async () => {
    const a = await authority();
    await a.store.save(grant(a, new Date(0)));
    const resolveWith = (store: NativeMcpOAuthTokenStore) => resolveNativeMcpOAuth({ endpoint: a.endpoint, config, store, timeoutMs: TIMEOUT });
    const [first, second] = await Promise.all([resolveWith(a.store), resolveWith(otherStore(a))]);
    expect(a.refreshRequests).toBe(1);
    expect(a.reuseRejected).toBe(0);
    expect(first.accessToken).toBe("access-1");
    expect(second.accessToken).toBe("access-1");
    expect((await a.store.load(a.issuer, a.endpoint.href))?.refreshToken).toBe("refresh-1");
  });

  test.skipIf(!existsSync(join(CHECKOUT, "dist/mcp/oauth/authorize.js")))("PXA-18: a refresh in another process and one here redeem one rotating refresh token", async () => {
    const a = await authority();
    a.tokenDelayMs = 400;
    await a.store.save(grant(a, new Date(0)));
    const script = `
      const { resolveNativeMcpOAuth } = await import(${JSON.stringify(join(CHECKOUT, "dist/mcp/oauth/authorize.js"))});
      const { NativeMcpOAuthTokenStore } = await import(${JSON.stringify(join(CHECKOUT, "dist/mcp/oauth/tokenStore.js"))});
      const store = new NativeMcpOAuthTokenStore(${JSON.stringify({ homeDir: a.home, path: a.file, projectDir: null, userEnvPath: join(a.root, "unused-env"), includeDotenv: false, env: {} })});
      const resolved = await resolveNativeMcpOAuth({ endpoint: new URL(${JSON.stringify(a.endpoint.href)}), config: ${JSON.stringify(config)}, store, timeoutMs: ${TIMEOUT} });
      process.stdout.write(resolved.accessToken);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    const exited = new Promise<number | null>(resolve => child.once("close", resolve));
    await vi.waitFor(() => expect(a.refreshRequests).toBe(1), { timeout: 10_000 });
    const here = await resolveNativeMcpOAuth({ endpoint: a.endpoint, config, store: otherStore(a), timeoutMs: TIMEOUT });
    expect(await exited, stderr).toBe(0);
    expect(a.refreshRequests).toBe(1);
    expect(a.reuseRejected).toBe(0);
    expect([stdout, here.accessToken]).toEqual(["access-1", "access-1"]);
  });

  test("PXA-18: a rotated token is stored even when the caller stops waiting", async () => {
    const a = await authority();
    a.tokenDelayMs = 300;
    await a.store.save(grant(a, new Date(0)));
    const controller = new AbortController();
    const waiting = resolveNativeMcpOAuth({ endpoint: a.endpoint, config, store: a.store, timeoutMs: TIMEOUT, signal: controller.signal });
    await vi.waitFor(() => expect(a.refreshRequests).toBe(1));
    controller.abort();
    await expect(waiting).rejects.toThrow(/cancelled/);
    await vi.waitFor(async () => expect((await a.store.load(a.issuer, a.endpoint.href))?.refreshToken).toBe("refresh-1"));
    const again = await resolveNativeMcpOAuth({ endpoint: a.endpoint, config, store: otherStore(a), timeoutMs: TIMEOUT });
    expect(again.accessToken).toBe("access-1");
    expect(a.refreshRequests).toBe(1);
  });

  test("PXA-19: a bearer that expires mid-session is renewed for the next tools/call", async () => {
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp41-oauth-fixture-vault");
    const a = await authority();
    const workspace = a.root;
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    removeActionPolicy(workspace); // AXR-02: no Action Policy configured, as before; this file is not about it (amc init signs one). initBudgets(workspace);
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    const name = nativeMcpToolName("oauth_fixture", "lookup"), configured = loadToolsConfig(workspace);
    initToolsConfig(workspace, { ...configured, tools: { ...configured.tools, allowedTools: [...configured.tools.allowedTools, { name, actionClass: "READ_ONLY" }] } });
    const session = new SessionService(workspace);
    session.open({ agentId: "default", harnessVersion: "wp41", compositionDigest: "wp41", policyDigest: "wp41" });
    session.startTurn({ trigger: "user" }); session.startStep();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: session.sessionId, recorder: session });
    cleanups.push(() => { toolset.close(); session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" });
      session.sealTurn(); session.close({ reason: "completed" }); });
    const configuration: NativeMcpConfiguration = { schemaVersion: 1, server: { transport: "streamable-http", id: "oauth_fixture",
      url: a.endpoint.href, origin: a.origin, protocolVersion: "2026-07-28", timeoutMs: TIMEOUT, auth: config } };
    // Outside the 60 s refresh margin at mount, inside it a few seconds later.
    const expiresAt = Date.now() + 65_000;
    await a.store.save(grant(a, new Date(expiresAt)));
    const server = await resolveNativeMcpServer(configuration, { workspace, credentialsHome: a.home, credentialsFile: a.file });
    const reviewed = await discoverNativeMcpCatalog(server, workspace);
    const mount = await mountNativeMcpServer({ server, workspace, agentId: "default", toolset,
      expectedCatalogDigest: reviewed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
    cleanups.push(() => mount.close());
    expect(a.refreshRequests).toBe(0);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - 60_000 - Date.now() + 200)));
    const outcome = await toolset.seam.execute({ callId: "wp41-renew", toolName: name, rawArguments: JSON.stringify({ query: "renew" }),
      sessionId: session.sessionId, turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal });
    expect(outcome.outcome).toBe("OK");
    expect(a.refreshRequests).toBe(1);
    expect(a.bearers.filter(line => line.startsWith("tools/call"))).toEqual(["tools/call Bearer access-1"]);
    expect(String(outcome.content)).not.toContain("access-1");
  });
});
