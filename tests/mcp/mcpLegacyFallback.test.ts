import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, test } from "vitest";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type NativeMcpCatalog } from "../../src/mcp/nativeMcpClient.js";
import type { NativeMcpHttpServer } from "../../src/mcp/nativeMcpHttpTransport.js";
import { NativeMcpProtocolRefused } from "../../src/mcp/protocol/version.js";
import { initWorkspace } from "../../src/workspace.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig, loadVerifiedToolsConfigSnapshot } from "../../src/toolhub/toolhubValidators.js";
import { agentToolset } from "../../src/agent/agentToolset.js";
import { SessionService } from "../../src/session/sessionService.js";
import { lockVault } from "../../src/vault/vault.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const MODERN = "2026-07-28";
const SESSION = "synthetic-legacy-session";
const SERVER_INFO = { name: "synthetic-legacy-untrusted", version: "1" };
const INPUT_SCHEMA = { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false };
const TOOL = { name: "lookup", description: "Synthetic legacy lookup", inputSchema: INPUT_SCHEMA };
type ErrorFact = { scope: string; name: string; message: string; stack: string | null };
type HttpFact = {
  httpMethod: string; path: string; rpc: string | null; id: string | number | null; hasId: boolean;
  requestedVersion: string | null; responseVersion: string | null; protocolHeader: string | null; originMatches: boolean;
  requestSessionPresent: boolean; requestSessionMatches: boolean;
  requestEnded: boolean; requestComplete: boolean; requestClosed: boolean;
  responseStatus: number; responseErrorCode: number | null; responseSessionPresent: boolean;
  responseFinished: boolean; responseClosed: boolean;
};
interface Fixture {
  root: string; server: NativeMcpHttpServer; requests: HttpFact[]; errors: ErrorFact[];
  outcome: { catalog?: NativeMcpCatalog; refusal?: ErrorFact; evidence?: unknown } | null;
  responseVersion?: string;
  close: (() => Promise<void> | void)[];
  secrets: string[]; environmentMutated: boolean;
}
function errorFact(scope: string, error: unknown): ErrorFact {
  const clean = (text: string) => text.replaceAll(SESSION, "[owned-session]");
  return { scope, name: error instanceof Error ? error.name : typeof error,
    message: clean(error instanceof Error ? error.message : String(error)),
    stack: error instanceof Error && error.stack ? clean(error.stack) : null };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Owned legacy endpoint requires one JSON-RPC object");
  return value as Record<string, unknown>;
}

async function owned(label: string, protocolVersion: string | undefined, body: (f: Fixture) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p139-legacy-")));
  const requests: HttpFact[] = [], errors: ErrorFact[] = [], cleanupErrors: unknown[] = [];
  const requestClosures: Promise<void>[] = [], socketClosures: Promise<void>[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const socketFacts: { closed: boolean; hadError: boolean }[] = [];
  let origin = "", started = false, closed = false, initialized = false;
  let bodyError: unknown, bodyFailed = false;
  const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  const f: Fixture = { root, requests, errors, outcome: null, close: [], secrets: [SESSION], environmentMutated: false,
    server: { transport: "streamable-http", id: "legacy_fixture", url: "", origin: "" } };
  const http = createServer((req, res) => {
    const row: HttpFact = { httpMethod: req.method ?? "", path: req.url ?? "", rpc: null, id: null, hasId: false,
      requestedVersion: null, responseVersion: null,
      protocolHeader: typeof req.headers["mcp-protocol-version"] === "string" ? req.headers["mcp-protocol-version"] : null,
      originMatches: req.headers.origin === origin, requestSessionPresent: req.headers["mcp-session-id"] !== undefined,
      requestSessionMatches: req.headers["mcp-session-id"] === SESSION,
      requestEnded: false, requestComplete: false, requestClosed: false,
      responseStatus: 0, responseErrorCode: null, responseSessionPresent: false, responseFinished: false, responseClosed: false };
    requests.push(row);
    req.on("error", error => errors.push(errorFact("request", error)));
    res.on("error", error => errors.push(errorFact("response", error)));
    req.once("end", () => { row.requestEnded = true; });
    res.once("finish", () => { row.responseFinished = res.writableFinished; });
    requestClosures.push(new Promise<void>(resolve => req.once("close", () => {
      row.requestClosed = true; row.requestComplete = req.complete; resolve();
    })), new Promise<void>(resolve => res.once("close", () => { row.responseClosed = true; resolve(); })));
    const reply = (status: number, value?: unknown, session = false) => {
      row.responseStatus = status; row.responseSessionPresent = session;
      res.writeHead(status, { connection: "close", ...(value === undefined ? {} : { "content-type": "application/json" }),
        ...(session ? { "mcp-session-id": SESSION } : {}) });
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.method === "GET") { reply(405); return; }
      if (req.method === "DELETE") { reply(204); return; }
      if (req.method !== "POST" || req.url !== "/mcp") throw new Error("Unexpected owned legacy HTTP method or path");
      const rpc = object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") throw new Error("Invalid owned legacy JSON-RPC request");
      row.rpc = rpc.method; row.hasId = rpc.id !== undefined;
      if (typeof rpc.id === "string" || typeof rpc.id === "number") row.id = rpc.id;
      if (rpc.method === "notifications/initialized") { reply(202, undefined, initialized); return; }
      if (row.id === null) throw new Error("Owned legacy RPC request requires an id");
      if (rpc.method === "server/discover") {
        row.responseErrorCode = -32601;
        reply(200, { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Synthetic legacy method not found" } });
      } else if (rpc.method === "initialize") {
        const version = object(rpc.params).protocolVersion;
        if (typeof version !== "string" || !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) throw new Error("Unsupported requested legacy version");
        const responseVersion = f.responseVersion ?? version;
        if (!SUPPORTED_PROTOCOL_VERSIONS.includes(responseVersion)) throw new Error("Unsupported owned legacy response version");
        row.requestedVersion = version; initialized = true;
        row.responseVersion = responseVersion;
        reply(200, { jsonrpc: "2.0", id: rpc.id, result: { protocolVersion: responseVersion,
          capabilities: { tools: {} }, serverInfo: SERVER_INFO } }, true);
      } else if (rpc.method === "tools/list") {
        reply(200, { jsonrpc: "2.0", id: rpc.id, result: { tools: [TOOL] } }, initialized);
      } else throw new Error("Unexpected owned legacy RPC method");
    })().catch(error => {
      errors.push(errorFact("handler", error));
      if (!res.headersSent) reply(500);
      else if (!res.writableEnded) res.end();
    });
  });
  http.on("error", error => errors.push(errorFact("server", error)));
  http.once("close", () => { closed = true; });
  http.on("connection", socket => {
    sockets.add(socket);
    const row = { closed: false, hadError: false }; socketFacts.push(row);
    socket.on("error", error => errors.push(errorFact("socket", error)));
    socketClosures.push(new Promise<void>(resolve => socket.once("close", hadError => {
      row.closed = true; row.hadError = hadError; sockets.delete(socket); resolve();
    })));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { http.removeListener("listening", onListen); reject(error); };
      const onListen = () => { http.removeListener("error", onError); resolve(); };
      http.once("error", onError); http.once("listening", onListen); http.listen(0, "127.0.0.1");
    });
    started = true;
    const address = http.address();
    if (!address || typeof address === "string" || address.port <= 0) throw new Error("Owned legacy server has no positive port");
    origin = `http://127.0.0.1:${address.port}`;
    f.server = { transport: "streamable-http", id: "legacy_fixture", url: `${origin}/mcp`, origin,
      ...(protocolVersion === undefined ? {} : { protocolVersion }) };
    await body(f);
  } catch (error) { bodyFailed = true; bodyError = error; }
  finally {
    for (const close of f.close.reverse()) {
      try { await close(); } catch (error) { cleanupErrors.push(error); }
    }
    try {
      if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      await Promise.all([...requestClosures, ...socketClosures]);
    } catch (error) { cleanupErrors.push(error); }
    if (started && (!closed || http.listening || sockets.size !== 0)) cleanupErrors.push(new Error("Owned legacy server did not close completely"));
    for (const row of requests) {
      if (!row.requestEnded || !row.requestComplete || !row.requestClosed || !row.responseFinished || !row.responseClosed) {
        cleanupErrors.push(new Error("Owned legacy HTTP lifecycle incomplete"));
      }
    }
    for (const row of socketFacts) if (!row.closed || row.hadError) cleanupErrors.push(new Error("Owned legacy socket closure failed"));
    if (errors.length) cleanupErrors.push(new Error("Owned legacy endpoint recorded errors"));
    if (f.environmentMutated) {
      if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
      else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
    }
    const exactEnvironmentRestored = process.env.AMC_VAULT_PASSPHRASE === previousPassphrase;
    if (!exactEnvironmentRestored) cleanupErrors.push(new Error("Owned legacy environment restoration failed"));
    const evidence = join(root, "public-evidence.json");
    try {
      let serialized = JSON.stringify({ schema: "amc-p139-legacy/2", label, synthetic: true, checkout: CHECKOUT,
        retainedRoot: root, configuredProtocolVersion: protocolVersion ?? null, requests, sockets: socketFacts,
        lifecycle: { started, closed, listening: http.listening, openSockets: sockets.size }, errors, outcome: f.outcome,
        bodyFailed, bodyError: bodyFailed ? errorFact("body", bodyError) : null,
        cleanupErrors: cleanupErrors.map(error => errorFact("cleanup", error)),
        environmentMutated: f.environmentMutated, exactEnvironmentRestored,
        childProcessCreated: false, signalsSent: false }, null, 2);
      for (const secret of f.secrets) serialized = serialized.replaceAll(secret, "[owned-secret]");
      writeFileSync(evidence, `${serialized}\n`, { flag: "wx", mode: 0o600 });
      console.log(`AMC_P139_LEGACY_PUBLIC_EVIDENCE ${evidence}`);
    } catch (error) { cleanupErrors.push(error); console.log(`AMC_P139_LEGACY_RETAINED_ROOT ${root}`); }
  }
  if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned legacy cleanup failed");
  if (bodyFailed) throw bodyError;
}

function governed(f: Fixture) {
  const passphrase = randomUUID(); f.secrets.push(passphrase);
  f.environmentMutated = true; process.env.AMC_VAULT_PASSPHRASE = passphrase;
  f.close.push(() => lockVault(f.root));
  initWorkspace({ workspacePath: f.root, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(f.root, "default"); writeRuntimeFirewallPolicy({ workspace: f.root, mode: "observe" });
  const name = nativeMcpToolName("legacy_fixture", "lookup"), config = loadToolsConfig(f.root);
  initToolsConfig(f.root, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools,
    { name, actionClass: "READ_ONLY" }] } });
  const signed = loadVerifiedToolsConfigSnapshot(f.root);
  const session = new SessionService(f.root);
  let sessionClosed = false;
  f.close.push(() => { if (!sessionClosed) session.disposeWithoutClosing(); });
  session.open({ agentId: "default", harnessVersion: "legacy-receipt-fixture", compositionDigest: "legacy-receipt-fixture", policyDigest: "legacy-receipt-fixture" });
  f.close.push(() => { session.close({ reason: "completed" }); sessionClosed = true; });
  const tools = agentToolset({ workspace: f.root, agentId: "default", sessionId: session.sessionId, recorder: session });
  f.close.push(() => tools.close());
  return { tools, name, signed };
}

describe("P1-39 explicit legacy MCP discovery", () => {
  test("unpinned method-not-found probe discovers the negotiated legacy catalog", async () => {
    await owned("unpinned-legacy-catalog", undefined, async f => {
      const catalog = await discoverNativeMcpCatalog(f.server, f.root);
      f.outcome = { catalog };
      const posts = f.requests.filter(row => row.httpMethod === "POST");
      expect(posts.map(row => row.rpc)).toEqual(["server/discover", "initialize", "notifications/initialized", "tools/list"]);
      expect(posts[0]).toMatchObject({ responseStatus: 200, responseErrorCode: -32601, protocolHeader: MODERN,
        requestSessionPresent: false, responseSessionPresent: false });
      expect(posts[1]).toMatchObject({ requestedVersion: LATEST_PROTOCOL_VERSION, requestSessionPresent: false, responseSessionPresent: true });
      expect(posts.slice(2).every(row => row.requestSessionMatches && row.responseSessionPresent)).toBe(true);
      expect(catalog.protocol).toEqual({ mode: "legacy", negotiatedVersion: LATEST_PROTOCOL_VERSION, serverInfo: SERVER_INFO });
      expect(catalog.serverId).toBe("legacy_fixture");
      expect(catalog.tools).toEqual([{ ...TOOL, outputSchema: null, annotations: null, execution: null }]);
      expect(catalog.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(f.requests.some(row => row.rpc === "tools/call")).toBe(false);
      expect(f.requests.every(row => row.path === "/mcp" && row.originMatches)).toBe(true);
      expect(f.requests.filter(row => row.httpMethod === "DELETE").map(row => ({ status: row.responseStatus, session: row.requestSessionMatches })))
        .toEqual([{ status: 204, session: true }]);
    });
  });

  test("an exact modern pin refuses the same legacy endpoint before initialization", async () => {
    await owned("modern-pin-refuses-legacy", MODERN, async f => {
      let failure: unknown;
      try { f.outcome = { catalog: await discoverNativeMcpCatalog(f.server, f.root) }; }
      catch (error) { failure = error; f.outcome = { refusal: errorFact("expected-refusal", error) }; }
      expect(failure).toBeInstanceOf(NativeMcpProtocolRefused);
      expect(failure).toMatchObject({ name: "NativeMcpProtocolRefused", message: "MCP server did not accept the pinned protocol version 2026-07-28." });
      expect(f.requests.map(row => ({ method: row.httpMethod, rpc: row.rpc, status: row.responseStatus, errorCode: row.responseErrorCode })))
        .toEqual([{ method: "POST", rpc: "server/discover", status: 200, errorCode: -32601 }]);
      expect(f.requests[0]).toMatchObject({ protocolHeader: MODERN, requestSessionPresent: false, responseSessionPresent: false, originMatches: true });
    });
  });

  test("an exact supported legacy pin initializes without a discover probe", async () => {
    await owned("exact-legacy-pin", "2025-11-25", async f => {
      const catalog = await discoverNativeMcpCatalog(f.server, f.root);
      f.outcome = { catalog };
      const posts = f.requests.filter(row => row.httpMethod === "POST");
      expect(posts.map(row => row.rpc)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
      expect(posts[0]).toMatchObject({ requestedVersion: "2025-11-25", responseVersion: "2025-11-25",
        requestSessionPresent: false, responseSessionPresent: true });
      expect(catalog.protocol).toEqual({ mode: "legacy", negotiatedVersion: "2025-11-25", serverInfo: SERVER_INFO });
      expect(catalog.tools).toEqual([{ ...TOOL, outputSchema: null, annotations: null, execution: null }]);
      expect(catalog.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(f.requests.some(row => row.rpc === "tools/call")).toBe(false);
    });
  });

  test("a different supported initialize version refuses an exact legacy pin before catalog discovery", async () => {
    await owned("legacy-pin-mismatch", "2025-11-25", async f => {
      f.responseVersion = "2025-06-18";
      let failure: unknown;
      try { f.outcome = { catalog: await discoverNativeMcpCatalog(f.server, f.root) }; }
      catch (error) { failure = error; f.outcome = { refusal: errorFact("expected-refusal", error) }; }
      expect(failure).toBeInstanceOf(NativeMcpProtocolRefused);
      expect(failure).toMatchObject({ name: "NativeMcpProtocolRefused",
        message: "MCP server negotiated a protocol version that is unsupported or differs from the pinned one." });
      expect(f.requests.filter(row => row.httpMethod === "POST").map(row => ({ rpc: row.rpc, requested: row.requestedVersion,
        returned: row.responseVersion, status: row.responseStatus })))
        .toEqual([{ rpc: "initialize", requested: "2025-11-25", returned: "2025-06-18", status: 200 }]);
      expect(f.requests.filter(row => row.httpMethod !== "POST").map(row => ({ method: row.httpMethod,
        session: row.requestSessionMatches, status: row.responseStatus }))).toEqual([{ method: "DELETE", session: true, status: 204 }]);
    });
  });

  test("legacy mount receipts bind the reviewed version and a version-only change requires a new digest", async () => {
    await owned("legacy-receipt-version-review", undefined, async f => {
      const progress: unknown[] = []; f.outcome = { evidence: progress };
      const g = governed(f);
      progress.push({ stage: "governed-setup", signedPolicyVerified: g.signed.signatureValid });
      const first = await discoverNativeMcpCatalog(f.server, f.root);
      progress.push({ stage: "first-discovery", catalog: first });
      const original = await mountNativeMcpServer({ server: f.server, workspace: f.root, agentId: "default", toolset: g.tools,
        expectedCatalogDigest: first.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
      f.close.push(() => original.close());
      const originalReceipt = original.receipt, originalVisible = g.tools.registry.visible("default").has(g.name);
      progress.push({ stage: "first-mount", receipt: originalReceipt, visible: originalVisible });
      await original.close();
      const originalRemoved = !g.tools.registry.visible("default").has(g.name);
      progress.push({ stage: "first-mount-closed", removed: originalRemoved });

      f.responseVersion = "2025-06-18";
      const changed = await discoverNativeMcpCatalog(f.server, f.root);
      progress.push({ stage: "changed-version-discovery", catalog: changed });
      let staleAccepted = false, staleError: ErrorFact | null = null, staleVisible = false;
      try {
        const stale = await mountNativeMcpServer({ server: f.server, workspace: f.root, agentId: "default", toolset: g.tools,
          expectedCatalogDigest: first.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
        f.close.push(() => stale.close());
        staleAccepted = true; staleVisible = g.tools.registry.visible("default").has(g.name);
        await stale.close();
      } catch (error) {
        staleError = errorFact("expected-stale-digest-refusal", error);
        staleVisible = g.tools.registry.visible("default").has(g.name);
      }
      progress.push({ stage: "old-digest-attempt", staleAccepted, staleError, staleVisible });
      const reviewed = await mountNativeMcpServer({ server: f.server, workspace: f.root, agentId: "default", toolset: g.tools,
        expectedCatalogDigest: changed.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
      f.close.push(() => reviewed.close());
      const reviewedReceipt = reviewed.receipt, reviewedVisible = g.tools.registry.visible("default").has(g.name);
      progress.push({ stage: "reviewed-mount", receipt: reviewedReceipt, visible: reviewedVisible });
      await reviewed.close();
      const reviewedRemoved = !g.tools.registry.visible("default").has(g.name);
      const signedEntry = g.signed.config?.tools.allowedTools.some(entry => entry.name === g.name && entry.actionClass === "READ_ONLY") ?? false;
      f.outcome = { evidence: { progress, signedPolicyVerified: g.signed.signatureValid, signedEntry,
        first, originalReceipt, originalVisible, originalRemoved, changed, staleAccepted, staleError, staleVisible,
        reviewedReceipt, reviewedVisible, reviewedRemoved } };

      expect(g.signed.signatureValid).toBe(true); expect(signedEntry).toBe(true);
      expect(first.protocol).toEqual({ mode: "legacy", negotiatedVersion: LATEST_PROTOCOL_VERSION, serverInfo: SERVER_INFO });
      expect(changed.protocol).toEqual({ mode: "legacy", negotiatedVersion: "2025-06-18", serverInfo: SERVER_INFO });
      expect(changed.tools).toEqual(first.tools); expect(changed.serverId).toBe(first.serverId);
      expect(changed.digest).toMatch(/^[0-9a-f]{64}$/); expect(changed.digest).not.toBe(first.digest);
      expect(originalReceipt).toEqual({ serverId: "legacy_fixture", catalogDigest: first.digest,
        protocol: { mode: "legacy", negotiatedVersion: LATEST_PROTOCOL_VERSION, serverInfo: SERVER_INFO }, auth: null });
      expect(originalVisible).toBe(true); expect(originalRemoved).toBe(true);
      expect(staleAccepted).toBe(false); expect(staleVisible).toBe(false);
      expect(staleError).toMatchObject({ name: "Error", message: "MCP mount refused; review the configured server, catalog digest and tool grants" });
      expect(reviewedReceipt).toEqual({ serverId: "legacy_fixture", catalogDigest: changed.digest,
        protocol: { mode: "legacy", negotiatedVersion: "2025-06-18", serverInfo: SERVER_INFO }, auth: null });
      expect(reviewedVisible).toBe(true); expect(reviewedRemoved).toBe(true);
      expect(f.requests.some(row => row.rpc === "tools/call")).toBe(false);
    });
  });
});
