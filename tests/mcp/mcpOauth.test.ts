import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  NativeMcpOAuthRefused, discoverNativeMcpAuthorizationServer, discoverNativeMcpProtectedResource,
  nativeMcpOAuthChallenge, nativeMcpOAuthNetwork, nativeMcpOAuthFetch, nativeMcpOAuthUrl, type NativeMcpAuthorizationServer
} from "../../src/mcp/oauth/discovery.js";
import { authorizeNativeMcpOAuth, resolveNativeMcpOAuth, validateNativeMcpAuthorizationResponse, type NativeMcpOAuthConfig } from "../../src/mcp/oauth/authorize.js";
import { authorizeNativeMcpCatalog, resolveNativeMcpServer, type NativeMcpConfiguration } from "../../src/setup/nativeMcpConfig.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName, type MountedNativeMcpServer } from "../../src/mcp/nativeMcpClient.js";
import { NativeMcpOAuthTokenStore, type NativeMcpOAuthGrant } from "../../src/mcp/oauth/tokenStore.js";
import { NativeMcpHttpRefused } from "../../src/mcp/nativeMcpHttpTransport.js";
import { agentToolset, type AgentToolset } from "../../src/agent/agentToolset.js";
import { runToolCalls } from "../../src/agent/toolCalls.js";
import { DEFAULT_AGENT_LOOP_CONFIG } from "../../src/agent/loopTypes.js";
import type { ToolCallOutcome } from "../../src/agent/toolSeam.js";
import { toolCallId } from "../../src/llm/streamChunk.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { SessionService } from "../../src/session/sessionService.js";
import { readEventPayload } from "../../src/session/eventPayload.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const TIMEOUT = 2000;
type ErrorFact = { scope: string; name: string; message: string; stack: string | null; causes?: ErrorFact[] };
type ServerFact = { method: string; path: string; status: number; authorizationPresent: boolean;
  requestEnded: boolean; requestComplete: boolean; requestClosed: boolean; responseFinished: boolean; responseClosed: boolean };
type ClientFact = { phase: string; status: number; requestClosed: boolean; responseEnded: boolean;
  responseComplete: boolean; responseClosed: boolean; socketClosed: boolean; socketHadError: boolean };
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
type Route = (input: { url: URL; body: string; headers: IncomingHttpHeaders }) => Reply;
interface Fixture {
  root: string; origin: string; endpoint: URL; issuer: string; requests: ServerFact[];
  public: Record<string, unknown>; secret(value: string): string;
  route(method: string, path: string, handler: Route): void;
  get(url: URL, phase: string): Promise<{ status: number; location: string | null }>;
}

async function owned(label: string, body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p139-oauth-")));
  const secrets: string[] = [], errors: ErrorFact[] = [], cleanupErrors: unknown[] = [];
  const requests: ServerFact[] = [], clients: ClientFact[] = [], closures: Promise<void>[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const socketFacts: { closed: boolean; hadError: boolean }[] = [];
  const routes = new Map<string, Route>();
  let started = false, closed = false, bodyFailed = false, bodyError: unknown;
  const clean = (value: string) => secrets.reduce((text, secret) => text.split(secret).join("[private]"), value);
  const fact = (scope: string, error: unknown): ErrorFact => ({ scope,
    name: error instanceof Error ? error.name : typeof error,
    message: clean(error instanceof Error ? error.message : String(error)),
    stack: error instanceof Error && error.stack ? clean(error.stack) : null,
    ...(error instanceof AggregateError ? { causes: error.errors.map(cause => fact(scope, cause)) } : {}) });
  const f: Fixture = { root, origin: "", issuer: "", endpoint: new URL("http://127.0.0.1/"), requests, public: {},
    secret: value => { if (value && !secrets.includes(value)) secrets.push(value); return value; },
    route: (method, path, handler) => { routes.set(method + " " + path, handler); },
    get: (url, phase) => new Promise((resolve, reject) => {
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password) {
        reject(new Error("Owned OAuth driver accepts literal-loopback HTTP only")); return;
      }
      const row: ClientFact = { phase, status: 0, requestClosed: false, responseEnded: false,
        responseComplete: false, responseClosed: false, socketClosed: false, socketHadError: false };
      clients.push(row);
      const req = request(url, { method: "GET", agent: false, headers: { connection: "close" } }, res => {
        row.status = res.statusCode ?? 0;
        closures.push(new Promise<void>(done => res.once("close", () => {
          row.responseClosed = true; row.responseComplete = res.complete; done();
        })));
        res.on("error", error => { errors.push(fact("client-response", error)); reject(error); });
        res.on("aborted", () => reject(new Error("Owned OAuth driver response aborted")));
        res.resume();
        res.once("end", () => { row.responseEnded = true; resolve({ status: row.status,
          location: typeof res.headers.location === "string" ? res.headers.location : null }); });
      });
      closures.push(new Promise<void>(done => req.once("close", () => { row.requestClosed = true; done(); })));
      req.once("socket", socket => {
        closures.push(new Promise<void>(done => socket.once("close", hadError => {
          row.socketClosed = true; row.socketHadError = hadError; done();
        })));
      });
      req.on("error", error => { errors.push(fact("client-request", error)); reject(error); });
      req.end();
    }) };
  const http = createServer((req, res) => {
    const row: ServerFact = { method: req.method ?? "", path: "", status: 0,
      authorizationPresent: req.headers.authorization !== undefined,
      requestEnded: false, requestComplete: false, requestClosed: false, responseFinished: false, responseClosed: false };
    requests.push(row);
    req.on("error", error => errors.push(fact("server-request", error)));
    res.on("error", error => errors.push(fact("server-response", error)));
    req.once("end", () => { row.requestEnded = true; });
    res.once("finish", () => { row.responseFinished = res.writableFinished; });
    closures.push(new Promise<void>(done => req.once("close", () => {
      row.requestClosed = true; row.requestComplete = req.complete; done();
    })), new Promise<void>(done => res.once("close", () => { row.responseClosed = true; done(); })));
    const reply = (value: Reply) => {
      row.status = value.status;
      res.writeHead(value.status, { connection: "close", ...(value.body === undefined ? {} : { "content-type": "application/json" }), ...value.headers });
      res.end(value.body === undefined ? undefined : JSON.stringify(value.body));
    };
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const url = new URL(req.url ?? "/", f.origin); row.path = url.pathname;
      const handler = routes.get(row.method + " " + row.path);
      reply(handler ? handler({ url, body: Buffer.concat(chunks).toString("utf8"), headers: req.headers }) : { status: 404 });
    })().catch(error => { errors.push(fact("handler", error));
      if (!res.headersSent) reply({ status: 500 }); else if (!res.writableEnded) res.end(); });
  });
  http.on("error", error => errors.push(fact("server", error)));
  http.once("close", () => { closed = true; });
  http.on("connection", socket => {
    sockets.add(socket); const row = { closed: false, hadError: false }; socketFacts.push(row);
    socket.on("error", error => errors.push(fact("server-socket", error)));
    closures.push(new Promise<void>(done => socket.once("close", hadError => {
      row.closed = true; row.hadError = hadError; sockets.delete(socket); done();
    })));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { http.removeListener("listening", onListen); reject(error); };
      const onListen = () => { http.removeListener("error", onError); resolve(); };
      http.once("error", onError); http.once("listening", onListen); http.listen(0, "127.0.0.1");
    });
    started = true; const address = http.address();
    if (!address || typeof address === "string") throw new Error("Owned OAuth fixture has no port");
    f.origin = "http://127.0.0.1:" + address.port;
    f.endpoint = new URL(f.origin + "/mcp/v1"); f.issuer = f.origin + "/issuer/path";
    await body(f);
  } catch (error) { bodyFailed = true; bodyError = error; }
  finally {
    try {
      if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      // A close promise may be registered while a previously recorded request drains.
      for (let seen = 0; seen < closures.length;) { const pending = closures.slice(seen); seen = closures.length; await Promise.all(pending); }
    } catch (error) { cleanupErrors.push(error); }
    if (started && (!closed || http.listening || sockets.size)) cleanupErrors.push(new Error("Owned OAuth server did not close completely"));
    for (const row of requests) if (!row.requestEnded || !row.requestComplete || !row.requestClosed || !row.responseFinished || !row.responseClosed) {
      cleanupErrors.push(new Error("Owned OAuth server HTTP lifecycle incomplete"));
    }
    for (const row of clients) if (!row.requestClosed || !row.responseEnded || !row.responseComplete || !row.responseClosed || !row.socketClosed || row.socketHadError) {
      cleanupErrors.push(new Error("Owned OAuth driver HTTP lifecycle incomplete"));
    }
    for (const row of socketFacts) if (!row.closed || row.hadError) cleanupErrors.push(new Error("Owned OAuth server socket lifecycle incomplete"));
    if (errors.length) cleanupErrors.push(new Error("Owned OAuth fixture recorded HTTP errors"));
    const evidence = join(root, "public-evidence.json");
    const record = { schema: "amc-p139-oauth-first/1", label, synthetic: true, checkout: CHECKOUT,
      retainedRoot: root, observations: f.public, requests, clients, sockets: socketFacts,
      lifecycle: { started, closed, listening: http.listening, openSockets: sockets.size }, errors,
      bodyFailed, bodyError: bodyFailed ? fact("body", bodyError) : null,
      cleanupErrors: cleanupErrors.map(error => fact("cleanup", error)), environmentMutated: false,
      productionCallbackServerCloseObserved: false, childProcessCreated: false, signalsSent: false };
    try {
      const encoded = JSON.stringify(record, null, 2);
      if (secrets.some(secret => encoded.includes(secret))) throw new Error("Private OAuth value would enter public evidence");
      writeFileSync(evidence, encoded + "\n", { flag: "wx", mode: 0o600 });
      console.log("AMC_P139_OAUTH_PUBLIC_EVIDENCE " + evidence);
    } catch (error) { cleanupErrors.push(error); console.log("AMC_P139_OAUTH_RETAINED_ROOT " + root); }
  }
  if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned OAuth cleanup failed");
  if (bodyFailed) throw bodyError;
}

function metadata(f: Fixture, issuer = f.issuer, methods: unknown = ["S256"]): Record<string, unknown> {
  return { issuer, authorization_endpoint: f.origin + "/authorize", token_endpoint: f.origin + "/token",
    code_challenge_methods_supported: methods, authorization_response_iss_parameter_supported: true };
}
function info(f: Fixture, issParameterSupported: boolean): NativeMcpAuthorizationServer {
  return { issuer: f.issuer, authorizationEndpoint: f.origin + "/authorize", tokenEndpoint: f.origin + "/token",
    clientIdMetadataDocumentSupported: false, issParameterSupported };
}
async function observation(operation: () => Promise<unknown>): Promise<{ failed: boolean; error: unknown }> {
  try { await operation(); return { failed: false, error: null }; } catch (error) { return { failed: true, error }; }
}

describe("P1-39 first local OAuth qualification", () => {
  test("discovers explicit and fallback protected-resource metadata and ordered issuer metadata", async () => {
    await owned("discovery-order", async f => {
      const resource = { resource: f.endpoint.href, authorization_servers: [f.issuer] };
      f.route("POST", "/mcp/v1", () => ({ status: 401, headers: { "www-authenticate": "Bearer resource_metadata=\"" + f.origin + "/explicit-prm\"" } }));
      f.route("GET", "/explicit-prm", () => ({ status: 200, body: resource }));
      f.route("GET", "/.well-known/oauth-protected-resource", () => ({ status: 200, body: resource }));
      f.route("GET", "/issuer/path/.well-known/openid-configuration", () => ({ status: 200, body: metadata(f) }));
      const network = nativeMcpOAuthNetwork(f.endpoint);
      const challenge = await nativeMcpOAuthChallenge(f.endpoint, TIMEOUT);
      const explicit = await discoverNativeMcpProtectedResource(f.endpoint, challenge, TIMEOUT, network);
      const server = await discoverNativeMcpAuthorizationServer(explicit.authorizationServer, network, TIMEOUT);
      const explicitOrder = f.requests.map(row => row.method + " " + row.path);
      const offset = f.requests.length;
      const fallback = await discoverNativeMcpProtectedResource(f.endpoint, {}, TIMEOUT, network);
      const fallbackOrder = f.requests.slice(offset).map(row => row.method + " " + row.path);
      f.public = { explicitOrder, fallbackOrder, explicitResourceMatches: explicit.resource === f.endpoint.href,
        issuerMatches: server.issuer === f.issuer, fallbackResourceMatches: fallback.resource === f.endpoint.href };
      expect(explicitOrder).toEqual(["POST /mcp/v1", "GET /explicit-prm", "GET /.well-known/oauth-authorization-server/issuer/path",
        "GET /.well-known/openid-configuration/issuer/path", "GET /issuer/path/.well-known/openid-configuration"]);
      expect(fallbackOrder).toEqual(["GET /.well-known/oauth-protected-resource/mcp/v1", "GET /.well-known/oauth-protected-resource"]);
      expect([explicit.resource === f.endpoint.href, server.issuer === f.issuer, fallback.resource === f.endpoint.href]).toEqual([true, true, true]);
      expect(f.requests.every(row => !row.authorizationPresent)).toBe(true);
    });
  });

  test("refuses a literal issuer mismatch after a matching issuer positive", async () => {
    await owned("literal-issuer-mismatch", async f => {
      let issuer = f.issuer;
      f.route("GET", "/.well-known/oauth-authorization-server/issuer/path", () => ({ status: 200, body: metadata(f, issuer) }));
      const network = nativeMcpOAuthNetwork(f.endpoint);
      const matching = await discoverNativeMcpAuthorizationServer(f.issuer, network, TIMEOUT);
      issuer = f.issuer + "/";
      const mismatch = await observation(() => discoverNativeMcpAuthorizationServer(f.issuer, network, TIMEOUT));
      f.public = { matchingIssuer: matching.issuer === f.issuer, mismatchFailed: mismatch.failed,
        mismatchClassified: mismatch.error instanceof NativeMcpOAuthRefused,
        mismatchFixedDiagnostic: mismatch.error instanceof Error && mismatch.error.message === "MCP authorization server metadata names a different issuer; it was refused.",
        requests: f.requests.length };
      expect(matching.issuer === f.issuer).toBe(true);
      expect(mismatch.failed).toBe(true);
      expect(mismatch.error).toBeInstanceOf(NativeMcpOAuthRefused);
      expect(f.public.mismatchFixedDiagnostic).toBe(true);
      expect(f.requests.map(row => row.method + " " + row.path)).toEqual([
        "GET /.well-known/oauth-authorization-server/issuer/path", "GET /.well-known/oauth-authorization-server/issuer/path"]);
    });
  });

  test("requires advertised S256 without masking its finite negative rows", async () => {
    await owned("S256-required", async f => {
      let methods: unknown = ["S256"];
      f.route("GET", "/.well-known/oauth-authorization-server/issuer/path", () => {
        const document = metadata(f);
        if (methods === undefined) delete document.code_challenge_methods_supported;
        else document.code_challenge_methods_supported = methods;
        return { status: 200, body: document };
      });
      const network = nativeMcpOAuthNetwork(f.endpoint);
      const positive = await discoverNativeMcpAuthorizationServer(f.issuer, network, TIMEOUT);
      const rows: { label: string; refused: boolean; fixed: boolean }[] = [];
      for (const [label, value] of [["absent", undefined], ["empty", []], ["plain-only", ["plain"]]] as const) {
        methods = value;
        const result = await observation(() => discoverNativeMcpAuthorizationServer(f.issuer, network, TIMEOUT));
        rows.push({ label, refused: result.error instanceof NativeMcpOAuthRefused,
          fixed: result.error instanceof Error && result.error.message === "MCP authorization server does not advertise S256 PKCE (code_challenge_methods_supported); authorization was refused." });
      }
      f.public = { positiveIssuerMatches: positive.issuer === f.issuer, rows };
      expect(f.public.positiveIssuerMatches).toBe(true);
      expect(rows).toEqual(["absent", "empty", "plain-only"].map(label => ({ label, refused: true, fixed: true })));
      expect(f.requests.length).toBe(4);
    });
  });

  test("validates the public RFC9207 iss table, exact state and fixed errors", async () => {
    await owned("state-and-iss-table", async f => {
      const state = f.secret("synthetic-state-" + randomUUID()), code = f.secret("synthetic-code-" + randomUUID());
      const canary = f.secret("synthetic-server-error-" + randomUUID());
      const cases = [
        { label: "required-match", required: true, iss: f.issuer, state, success: true },
        { label: "required-absent", required: true, iss: null, state, success: false },
        { label: "required-wrong", required: true, iss: f.issuer + "/", state, success: false },
        { label: "optional-absent", required: false, iss: null, state, success: true },
        { label: "optional-match", required: false, iss: f.issuer, state, success: true },
        { label: "optional-wrong", required: false, iss: f.issuer + "/", state, success: false },
        { label: "wrong-state", required: true, iss: f.issuer, state: state + "-wrong", success: false },
        { label: "wrong-issuer-error", required: true, iss: f.issuer + "/", state, success: false, error: true },
        { label: "server-error", required: true, iss: f.issuer, state, success: false, error: true }
      ];
      const rows = cases.map(row => {
        const params = new URLSearchParams({ state: row.state, code });
        if (row.iss !== null) params.set("iss", row.iss);
        if (row.error) { params.set("error", "access_denied"); params.set("error_description", canary); }
        let returned: string | null = null, error: unknown;
        try { returned = validateNativeMcpAuthorizationResponse(params, state, info(f, row.required)); } catch (caught) { error = caught; }
        return { label: row.label, acceptedExactCode: returned === code,
          classifiedRefusal: error instanceof NativeMcpOAuthRefused && error.code === "AUTH_REQUIRED",
          serverTextHidden: !(error instanceof Error) || !error.message.includes(canary) };
      });
      f.public = { rows };
      expect(rows).toEqual(cases.map(row => ({ label: row.label, acceptedExactCode: row.success,
        classifiedRefusal: !row.success, serverTextHidden: true })));
      expect(f.requests.length).toBe(0);
    });
  });

  test("performs real S256 resource-bound authorization and persists the real grant", async () => {
    await owned("real-PKCE-token-store", async f => {
      const code = f.secret("synthetic-authorization-code-" + randomUUID());
      const access = f.secret("synthetic-access-token-" + randomUUID());
      const refresh = f.secret("synthetic-refresh-token-" + randomUUID());
      let auth: URLSearchParams | null = null, tokenValid = false, authorizeValid = false;
      const controller = new AbortController();
      const drivers: Promise<void>[] = [], flowErrors: unknown[] = [];
      f.route("POST", "/mcp/v1", () => ({ status: 401, headers: { "www-authenticate": "Bearer resource_metadata=\"" + f.origin + "/prm\", scope=\"read\"" } }));
      f.route("GET", "/prm", () => ({ status: 200, body: { resource: f.endpoint.href, authorization_servers: [f.issuer] } }));
      f.route("GET", "/.well-known/oauth-authorization-server/issuer/path", () => ({ status: 200, body: metadata(f) }));
      f.route("GET", "/authorize", ({ url }) => {
        auth = new URLSearchParams(url.searchParams);
        const redirect = new URL(auth.get("redirect_uri") ?? "http://127.0.0.1/");
        authorizeValid = auth.get("response_type") === "code" && auth.get("client_id") === "synthetic-client"
          && auth.get("code_challenge_method") === "S256" && (auth.get("code_challenge")?.length ?? 0) >= 43
          && (auth.get("state")?.length ?? 0) >= 16 && auth.get("resource") === f.endpoint.href
          && auth.get("scope") === "read" && redirect.protocol === "http:" && redirect.hostname === "127.0.0.1" && redirect.pathname === "/callback";
        if (!authorizeValid) return { status: 400 };
        redirect.searchParams.set("code", code); redirect.searchParams.set("state", auth.get("state")!); redirect.searchParams.set("iss", f.issuer);
        return { status: 302, headers: { location: redirect.href } };
      });
      f.route("POST", "/token", ({ body }) => {
        const form = new URLSearchParams(body), verifier = form.get("code_verifier") ?? "";
        f.secret(verifier);
        tokenValid = auth !== null && form.get("grant_type") === "authorization_code" && form.get("code") === code
          && form.get("client_id") === "synthetic-client" && form.get("resource") === f.endpoint.href
          && form.get("redirect_uri") === auth.get("redirect_uri")
          && createHash("sha256").update(verifier).digest("base64url") === auth.get("code_challenge");
        return tokenValid ? { status: 200, body: { access_token: access, token_type: "Bearer", refresh_token: refresh, expires_in: 3600, scope: "read" } } : { status: 400 };
      });
      const home = join(f.root, "credentials"); mkdirSync(home, { mode: 0o700 });
      const credentialsFile = join(home, ".credentials.yaml");
      const store = new NativeMcpOAuthTokenStore({ homeDir: home, path: credentialsFile, projectDir: null,
        userEnvPath: join(f.root, "unused-env"), includeDotenv: false, env: {} });
      let receipt: Awaited<ReturnType<typeof authorizeNativeMcpOAuth>> | null = null;
      try {
        receipt = await authorizeNativeMcpOAuth({ endpoint: f.endpoint, config: { kind: "oauth2", clientId: "synthetic-client" }, store,
          timeoutMs: TIMEOUT, signal: controller.signal, onAuthorizationUrl: value => {
            const url = new URL(value); f.secret(url.searchParams.get("state") ?? ""); f.secret(url.searchParams.get("code_challenge") ?? "");
            const task = (async () => {
              const authorization = await f.get(url, "authorization");
              if (authorization.status !== 302 || !authorization.location) throw new Error("Owned authorization did not return its callback");
              const callback = await f.get(new URL(authorization.location), "callback");
              if (callback.status !== 200) throw new Error("Owned authorization callback was not accepted");
            })().catch(error => { flowErrors.push(error); controller.abort(); });
            drivers.push(task);
          } });
      } catch (error) { flowErrors.push(error); }
      await Promise.all(drivers);
      if (flowErrors.length > 1) throw new AggregateError(flowErrors, "Owned OAuth authorization/driver failed");
      if (flowErrors.length === 1) throw flowErrors[0];
      const grant = await store.load(f.issuer, f.endpoint.href);
      const grantMatches = grant !== null && grant.issuer === f.issuer && grant.resource === f.endpoint.href
        && grant.clientId === "synthetic-client" && grant.accessToken === access && grant.refreshToken === refresh;
      const receiptSafe = receipt !== null && receipt.issuer === f.issuer && receipt.scopes.join(" ") === "read"
        && typeof receipt.tokenExpiresAt === "string" && ![access, refresh, code].some(value => JSON.stringify(receipt).includes(value));
      f.public = { authorizeValid, tokenValid, grantMatches, receiptSafe,
        credentialFileMode: statSync(credentialsFile).mode & 0o777, credentialDirectoryMode: statSync(home).mode & 0o777,
        tokenRequests: f.requests.filter(row => row.path === "/token").length,
        productionCallbackCloseBoundary: "Product closeAllConnections/void close is not an awaitable server-close observation" };
      expect([authorizeValid, tokenValid, grantMatches, receiptSafe]).toEqual([true, true, true, true]);
      expect(f.public.credentialFileMode).toBe(0o600); expect(f.public.credentialDirectoryMode).toBe(0o700);
      expect(f.public.tokenRequests).toBe(1);
      expect(f.requests.every(row => !row.authorizationPresent)).toBe(true);
    });
  });
});

interface InteractiveState {
  expectedClientId: string; metadataClientId: boolean; confidential: boolean;
  registrations: number; authorizations: number; tokens: number; nativeRegistration: boolean;
  authorizeValid: boolean; tokenValid: boolean; access: string; refresh: string;
  authorizationScopes: string[][];
}
function storeAt(f: Fixture, leaf: string): { store: NativeMcpOAuthTokenStore; home: string; file: string } {
  const home = join(f.root, leaf); mkdirSync(home, { mode: 0o700 });
  const file = join(home, ".credentials.yaml");
  return { home, file, store: new NativeMcpOAuthTokenStore({ homeDir: home, path: file, projectDir: null,
    userEnvPath: join(f.root, "unused-env"), includeDotenv: false, env: {} }) };
}
function installInteractive(f: Fixture): InteractiveState {
  const state: InteractiveState = { expectedClientId: "synthetic-client", metadataClientId: false, confidential: false,
    registrations: 0, authorizations: 0, tokens: 0, nativeRegistration: false, authorizeValid: false, tokenValid: false,
    access: f.secret("synthetic-access-" + randomUUID()), refresh: f.secret("synthetic-refresh-" + randomUUID()), authorizationScopes: [] };
  let authorization: URLSearchParams | null = null, code = "", consumed = false;
  f.route("POST", "/mcp/v1", () => ({ status: 401, headers: { "www-authenticate": "Bearer resource_metadata=\"" + f.origin + "/prm\", scope=\"read\"" } }));
  f.route("GET", "/prm", () => ({ status: 200, body: { resource: f.endpoint.href, authorization_servers: [f.issuer] } }));
  f.route("GET", "/.well-known/oauth-authorization-server/issuer/path", () => ({ status: 200,
    body: { ...metadata(f), registration_endpoint: f.origin + "/register", client_id_metadata_document_supported: state.metadataClientId } }));
  f.route("POST", "/register", ({ body }) => {
    state.registrations++;
    const input = JSON.parse(body) as Record<string, unknown>;
    state.nativeRegistration = input.application_type === "native" && input.token_endpoint_auth_method === "none"
      && Array.isArray(input.redirect_uris) && input.redirect_uris.length === 1
      && JSON.stringify(input.grant_types) === JSON.stringify(["authorization_code", "refresh_token"])
      && JSON.stringify(input.response_types) === JSON.stringify(["code"]);
    return { status: 201, body: { client_id: state.expectedClientId,
      ...(state.confidential ? { client_secret: f.secret("synthetic-confidential-refusal") } : {}) } };
  });
  f.route("GET", "/authorize", ({ url }) => {
    state.authorizations++; authorization = new URLSearchParams(url.searchParams);
    code = f.secret("synthetic-code-" + randomUUID()); consumed = false;
    const redirect = new URL(authorization.get("redirect_uri") ?? "http://127.0.0.1/");
    state.authorizationScopes.push((authorization.get("scope") ?? "").split(" ").filter(Boolean));
    state.authorizeValid = authorization.get("response_type") === "code" && authorization.get("client_id") === state.expectedClientId
      && authorization.get("resource") === f.endpoint.href && authorization.get("code_challenge_method") === "S256"
      && (authorization.get("state")?.length ?? 0) >= 16 && redirect.protocol === "http:"
      && redirect.hostname === "127.0.0.1" && redirect.pathname === "/callback";
    if (!state.authorizeValid) return { status: 400 };
    redirect.searchParams.set("code", code); redirect.searchParams.set("state", authorization.get("state")!); redirect.searchParams.set("iss", f.issuer);
    return { status: 302, headers: { location: redirect.href } };
  });
  f.route("POST", "/token", ({ body }) => {
    state.tokens++; const form = new URLSearchParams(body), verifier = form.get("code_verifier") ?? "";
    f.secret(verifier);
    state.tokenValid = authorization !== null && !consumed && form.get("grant_type") === "authorization_code" && form.get("code") === code
      && form.get("client_id") === state.expectedClientId && form.get("resource") === f.endpoint.href
      && form.get("redirect_uri") === authorization.get("redirect_uri")
      && createHash("sha256").update(verifier).digest("base64url") === authorization.get("code_challenge");
    if (!state.tokenValid) return { status: 400 };
    consumed = true;
    return { status: 200, body: { access_token: state.access, token_type: "Bearer", refresh_token: state.refresh,
      expires_in: 3600, scope: (authorization?.get("scope") ?? "read") } };
  });
  return state;
}
function authorizationDriver(f: Fixture, controller: AbortController, drivers: Promise<void>[], errors: unknown[]): (value: string) => void {
  return value => {
    const url = new URL(value); f.secret(url.searchParams.get("state") ?? ""); f.secret(url.searchParams.get("code_challenge") ?? "");
    const task = (async () => {
      if (url.origin !== f.origin || url.pathname !== "/authorize") throw new Error("Owned OAuth authorization URL changed");
      const start = await f.get(url, "authorization");
      if (start.status !== 302 || !start.location) throw new Error("Owned OAuth authorization did not return a callback");
      const callback = await f.get(new URL(start.location), "callback");
      if (callback.status !== 200) throw new Error("Owned OAuth callback refused");
    })().catch(error => { errors.push(error); controller.abort(); });
    drivers.push(task);
  };
}
async function interactiveAttempt(f: Fixture, config: NativeMcpOAuthConfig, store: NativeMcpOAuthTokenStore): Promise<{ error: unknown; success: boolean }> {
  const controller = new AbortController(), drivers: Promise<void>[] = [], errors: unknown[] = [];
  let error: unknown = null;
  try { await authorizeNativeMcpOAuth({ endpoint: f.endpoint, config, store, timeoutMs: TIMEOUT,
    signal: controller.signal, onAuthorizationUrl: authorizationDriver(f, controller, drivers, errors) }); }
  catch (caught) { error = caught; errors.push(caught); }
  await Promise.all(drivers);
  if (errors.length > 1) throw new AggregateError(errors, "Owned OAuth authorization/driver failed");
  if (errors.length === 1 && error === null) throw errors[0];
  return { error, success: error === null };
}

describe("P1-39 OAuth registration and redirect qualification", () => {
  test("honors client priority and explicit dynamic registration opt-in", async () => {
    await owned("registration-priority-opt-in", async f => {
      const state = installInteractive(f), rows: Record<string, unknown>[] = [];
      const variants: { label: string; config: NativeMcpOAuthConfig; expectedClientId: string; metadataClientId: boolean;
        confidential: boolean; success: boolean; registration: number }[] = [
        { label: "pre-registered", config: { kind: "oauth2", clientId: "synthetic-client", allowDynamicRegistration: true },
          expectedClientId: "synthetic-client", metadataClientId: true, confidential: false, success: true, registration: 0 },
        { label: "metadata-document", config: { kind: "oauth2", clientIdMetadataUrl: "https://synthetic.invalid/client.json", allowDynamicRegistration: true },
          expectedClientId: "https://synthetic.invalid/client.json", metadataClientId: true, confidential: false, success: true, registration: 0 },
        { label: "default-off", config: { kind: "oauth2" }, expectedClientId: "synthetic-dynamic", metadataClientId: false,
          confidential: false, success: false, registration: 0 },
        { label: "explicit-off", config: { kind: "oauth2", allowDynamicRegistration: false }, expectedClientId: "synthetic-dynamic",
          metadataClientId: false, confidential: false, success: false, registration: 0 },
        { label: "explicit-on", config: { kind: "oauth2", allowDynamicRegistration: true }, expectedClientId: "synthetic-dynamic",
          metadataClientId: false, confidential: false, success: true, registration: 1 },
        { label: "confidential-refused", config: { kind: "oauth2", allowDynamicRegistration: true }, expectedClientId: "synthetic-dynamic",
          metadataClientId: false, confidential: true, success: false, registration: 1 }
      ];
      for (const row of variants) {
        state.expectedClientId = row.expectedClientId; state.metadataClientId = row.metadataClientId; state.confidential = row.confidential;
        const before = { registrations: state.registrations, tokens: state.tokens, authorizations: state.authorizations };
        const target = storeAt(f, row.label);
        const outcome = await interactiveAttempt(f, row.config, target.store);
        const grant = await target.store.load(f.issuer, f.endpoint.href);
        rows.push({ label: row.label, success: outcome.success, classifiedRefusal: outcome.error instanceof NativeMcpOAuthRefused,
          registrationCount: state.registrations - before.registrations, tokenCount: state.tokens - before.tokens,
          authorizationCount: state.authorizations - before.authorizations,
          correctClientStored: grant !== null && grant.clientId === row.expectedClientId,
          confidentialDiagnostic: outcome.error instanceof Error && outcome.error.message.includes("confidential client") });
      }
      f.public = { rows, publicNativeRegistration: state.nativeRegistration };
      expect(rows).toEqual(variants.map(row => ({ label: row.label, success: row.success, classifiedRefusal: !row.success,
        registrationCount: row.registration, tokenCount: row.success ? 1 : 0, authorizationCount: row.success ? 1 : 0,
        correctClientStored: row.success, confidentialDiagnostic: row.confidential })));
      expect(state.nativeRegistration).toBe(true);
    });
  });

  test("refuses OAuth redirects and forbidden non-loopback HTTP URLs before target fetch", async () => {
    await owned("redirect-source", async f => {
      await owned("redirect-target", async target => {
        f.route("GET", "/redirect-metadata", () => ({ status: 302, headers: { location: target.origin + "/never-fetch" } }));
        f.route("POST", "/mcp/v1", () => ({ status: 307, headers: { location: target.origin + "/never-fetch" } }));
        const network = nativeMcpOAuthNetwork(f.endpoint);
        const metadataRedirect = await observation(() => nativeMcpOAuthFetch(new URL(f.origin + "/redirect-metadata"), { method: "GET" }, TIMEOUT, network));
        const challengeRedirect = await observation(() => nativeMcpOAuthChallenge(f.endpoint, TIMEOUT));
        const forbidden = ["http://synthetic.invalid/metadata", "http://localhost/metadata", "http://192.0.2.1/metadata"].map(value => {
          let refused = false;
          try { nativeMcpOAuthUrl(value, true); } catch (error) { refused = error instanceof NativeMcpOAuthRefused; }
          return refused;
        });
        const facts = { metadataRefused: metadataRedirect.error instanceof NativeMcpOAuthRefused,
          metadataFixed: metadataRedirect.error instanceof Error && metadataRedirect.error.message === "MCP OAuth redirects are refused; review the server's authorization metadata.",
          challengeRefused: challengeRedirect.error instanceof NativeMcpOAuthRefused,
          challengeFixed: challengeRedirect.error instanceof Error && challengeRedirect.error.message.includes("redirects or endpoint changes are refused"),
          forbidden, targetRequests: target.requests.length, sourceRequests: f.requests.length };
        f.public = facts; target.public = { requestsFromRefusedRedirect: target.requests.length };
        expect(facts).toEqual({ metadataRefused: true, metadataFixed: true, challengeRefused: true, challengeFixed: true,
          forbidden: [true, true, true], targetRequests: 0, sourceRequests: 2 });
      });
    });
  });
});

function oauthConfiguration(f: Fixture): NativeMcpConfiguration {
  return { schemaVersion: 1, server: { transport: "streamable-http", id: "oauth_fixture", url: f.endpoint.href,
    origin: f.origin, protocolVersion: "2026-07-28", timeoutMs: TIMEOUT, auth: { kind: "oauth2", clientId: "synthetic-client" } } };
}
function grantAt(f: Fixture, access: string, refresh?: string): NativeMcpOAuthGrant {
  return { v: 1, issuer: f.issuer, resource: f.endpoint.href, clientId: "synthetic-client", scopes: ["read"],
    accessToken: access, ...(refresh === undefined ? {} : { refreshToken: refresh }) };
}
interface CatalogState { correctHeader: boolean; tokenInUrlOrBody: boolean; authenticatedMethods: string[]; calls: number }
function installCatalog(f: Fixture, access: string, scopeChallenges: readonly string[] = []): CatalogState {
  const state: CatalogState = { correctHeader: true, tokenInUrlOrBody: false, authenticatedMethods: [], calls: 0 };
  let challengeIndex = 0;
  f.route("POST", "/mcp/v1", ({ url, headers, body }) => {
    if (headers.authorization === undefined) return { status: 401,
      headers: { "www-authenticate": "Bearer resource_metadata=\"" + f.origin + "/prm\", scope=\"read\"" } };
    state.correctHeader &&= headers.authorization === "Bearer " + access;
    state.tokenInUrlOrBody ||= url.href.includes(access) || body.includes(access);
    const input = JSON.parse(body) as { id?: string | number; method?: string; params?: Record<string, unknown> };
    if (typeof input.method !== "string") throw new Error("Owned OAuth catalog requires an RPC method");
    state.authenticatedMethods.push(input.method);
    if (headers.authorization !== "Bearer " + access) return { status: 401 };
    if (input.method === "server/discover" && challengeIndex < scopeChallenges.length) {
      return { status: 403, headers: { "www-authenticate": "Bearer error=\"insufficient_scope\", scope=\"" + scopeChallenges[challengeIndex++] + "\"" } };
    }
    let result: unknown;
    if (input.method === "server/discover") result = { resultType: "complete", supportedVersions: ["2026-07-28"],
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "synthetic-oauth-catalog", version: "1" } } };
    else if (input.method === "tools/list") result = { resultType: "complete", tools: [{ name: "lookup", description: "Synthetic OAuth lookup",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } }] };
    else if (input.method === "tools/call") { state.calls++; result = { resultType: "complete", content: [{ type: "text", text: access }] }; }
    else throw new Error("Unexpected owned OAuth catalog RPC method");
    return { status: 200, body: { jsonrpc: "2.0", id: input.id, result } };
  });
  return state;
}

describe("P1-39 OAuth real-store refresh and binding qualification", () => {
  test("refreshes an expired real grant with resource binding, preserves an omitted refresh token and refuses unusable refresh", async () => {
    await owned("real-store-refresh", async f => {
      installInteractive(f);
      const rows: Record<string, unknown>[] = [];
      for (const variant of ["rotate", "retain", "refused", "missing"] as const) {
        const target = storeAt(f, "refresh-" + variant);
        const oldAccess = f.secret("synthetic-old-access-" + randomUUID());
        const oldRefresh = f.secret("synthetic-old-refresh-" + randomUUID());
        const newAccess = f.secret("synthetic-new-access-" + randomUUID());
        const newRefresh = f.secret("synthetic-new-refresh-" + randomUUID());
        const original: NativeMcpOAuthGrant = { ...grantAt(f, oldAccess, variant === "missing" ? undefined : oldRefresh),
          expiresAt: new Date(0).toISOString() };
        await target.store.save(original);
        let requests = 0, formValid = false;
        f.route("POST", "/token", ({ body, url, headers }) => {
          requests++; const form = new URLSearchParams(body);
          formValid = form.get("grant_type") === "refresh_token" && form.get("refresh_token") === oldRefresh
            && form.get("client_id") === "synthetic-client" && form.get("resource") === f.endpoint.href
            && !form.has("code") && !form.has("code_verifier") && !url.href.includes(oldRefresh) && headers.authorization === undefined;
          if (!formValid || variant === "refused") return { status: 400, body: { error: "invalid_grant" } };
          return { status: 200, body: { access_token: newAccess, token_type: "Bearer", expires_in: 3600,
            ...(variant === "rotate" ? { refresh_token: newRefresh, scope: "read write" } : {}) } };
        });
        let resolved: Awaited<ReturnType<typeof resolveNativeMcpOAuth>> | null = null, failure: unknown = null;
        try { resolved = await resolveNativeMcpOAuth({ endpoint: f.endpoint, config: { kind: "oauth2", clientId: "synthetic-client" },
          store: target.store, timeoutMs: TIMEOUT }); } catch (error) { failure = error; }
        const saved = await target.store.load(f.issuer, f.endpoint.href), successful = variant === "rotate" || variant === "retain";
        rows.push({ variant, success: resolved !== null, classifiedRefusal: failure instanceof NativeMcpOAuthRefused && failure.code === "AUTH_REQUIRED",
          tokenRequests: requests, formValid, returnedNewAccess: resolved !== null && resolved.accessToken === newAccess,
          savedExpectedGrant: saved !== null && (successful
            ? saved.accessToken === newAccess && saved.refreshToken === (variant === "rotate" ? newRefresh : oldRefresh)
              && saved.expiresAt !== original.expiresAt && saved.scopes.join(" ") === (variant === "rotate" ? "read write" : "read")
            : JSON.stringify(saved) === JSON.stringify(original)),
          receiptSafe: resolved === null || ![oldAccess, oldRefresh, newAccess, newRefresh].some(value => JSON.stringify(resolved.receipt).includes(value)) });
      }
      f.public = { rows, clockReplaced: false, realExpirySeed: true };
      expect(rows).toEqual(["rotate", "retain", "refused", "missing"].map(variant => {
        const success = variant === "rotate" || variant === "retain";
        return { variant, success, classifiedRefusal: !success, tokenRequests: variant === "missing" ? 0 : 1,
          formValid: variant !== "missing", returnedNewAccess: success, savedExpectedGrant: true, receiptSafe: true };
      }));
    });
  });

  test("separates real issuer and resource entries and resolves the selected token only into the MCP Authorization header", async () => {
    await owned("issuer-resource-binding-A", async first => {
      await owned("issuer-resource-binding-B", async second => {
        const a = installInteractive(first), b = installInteractive(second), target = storeAt(first, "shared-binding-store");
        for (const value of [a.access, a.refresh, b.access, b.refresh]) { first.secret(value); second.secret(value); }
        const grantA = grantAt(first, a.access), grantB = grantAt(second, b.access);
        // Each coordinate is varied independently before any matching B entry exists.
        await target.store.save(grantA);
        const wrongIssuer = await target.store.load(second.issuer, first.endpoint.href);
        const wrongResource = await target.store.load(first.issuer, second.endpoint.href);
        const absentB = await observation(() => resolveNativeMcpOAuth({ endpoint: second.endpoint,
          config: { kind: "oauth2", clientId: "synthetic-client" }, store: target.store, timeoutMs: TIMEOUT }));
        const requestsBeforeB = second.requests.length;
        await target.store.save(grantB);
        const resolved = await resolveNativeMcpServer(oauthConfiguration(second), { workspace: second.root,
          credentialsHome: target.home, credentialsFile: target.file });
        const headerOnly = resolved.transport === "streamable-http" && Object.keys(resolved.headers ?? {}).join(" ") === "Authorization"
          && resolved.headers?.Authorization === "Bearer " + b.access && !JSON.stringify(resolved.auth ?? null).includes(b.access);
        const wire = installCatalog(second, b.access);
        const catalog = await discoverNativeMcpCatalog(resolved, second.root);
        const savedA = await target.store.load(first.issuer, first.endpoint.href), savedB = await target.store.load(second.issuer, second.endpoint.href);
        const facts = { wrongIssuerMissing: wrongIssuer === null, wrongResourceMissing: wrongResource === null,
          missingBClassified: absentB.error instanceof NativeMcpOAuthRefused && absentB.error.code === "AUTH_REQUIRED",
          headerOnly, correctHeader: wire.correctHeader, tokenInUrlOrBody: wire.tokenInUrlOrBody,
          catalogRead: catalog.tools.length === 1 && catalog.tools[0]?.name === "lookup",
          grantsRemainSeparate: JSON.stringify(savedA) === JSON.stringify(grantA) && JSON.stringify(savedB) === JSON.stringify(grantB),
          authenticatedMethods: wire.authenticatedMethods, beforeGrantAuthorizationHeaders: second.requests.slice(0, requestsBeforeB).filter(row => row.authorizationPresent).length,
          setupCallerEnvironment: "Inherited process.env and user dotenv remain enabled by the public configuration caller" };
        first.public = facts; second.public = { correctHeader: wire.correctHeader, tokenInUrlOrBody: wire.tokenInUrlOrBody,
          authenticatedMethods: wire.authenticatedMethods };
        expect({ ...facts, setupCallerEnvironment: undefined }).toEqual({ wrongIssuerMissing: true, wrongResourceMissing: true,
          missingBClassified: true, headerOnly: true, correctHeader: true, tokenInUrlOrBody: false, catalogRead: true,
          grantsRemainSeparate: true, authenticatedMethods: ["server/discover", "tools/list"], beforeGrantAuthorizationHeaders: 0,
          setupCallerEnvironment: undefined });
      });
    });
  });
});

async function catalogAttempt(f: Fixture, home: string, file: string): Promise<{
  result: Awaited<ReturnType<typeof authorizeNativeMcpCatalog>> | null; error: unknown
}> {
  const controller = new AbortController(), drivers: Promise<void>[] = [], errors: unknown[] = [];
  const base = oauthConfiguration(f);
  if (base.server.transport !== "streamable-http") throw new Error("Owned OAuth catalog configuration lost HTTP transport");
  const auth: NativeMcpOAuthConfig = { kind: "oauth2", clientId: "synthetic-client", scopes: ["operator", "read"] };
  const config: NativeMcpConfiguration = { ...base, server: { ...base.server, auth } };
  let result: Awaited<ReturnType<typeof authorizeNativeMcpCatalog>> | null = null, error: unknown = null;
  try { result = await authorizeNativeMcpCatalog(config, { workspace: f.root, credentialsHome: home, credentialsFile: file,
    signal: controller.signal, onAuthorizationUrl: authorizationDriver(f, controller, drivers, errors) }); }
  catch (caught) { error = caught; errors.push(caught); }
  await Promise.all(drivers);
  if (errors.length > 1) throw new AggregateError(errors, "Owned OAuth catalog authorization/driver failed");
  if (errors.length === 1 && error === null) throw errors[0];
  return { result, error };
}

describe("P1-39 OAuth real catalog scope qualification", () => {
  test("unions operator, granted and new challenge scopes through two real catalog step-ups", async () => {
    await owned("catalog-scope-union", async f => {
      const state = installInteractive(f), wire = installCatalog(f, state.access, ["write", "admin"]);
      const target = storeAt(f, "catalog-scopes"), attempt = await catalogAttempt(f, target.home, target.file);
      const saved = await target.store.load(f.issuer, f.endpoint.href);
      const facts = { completed: attempt.result !== null, unexpectedError: attempt.error !== null,
        scopes: state.authorizationScopes, authorizations: state.authorizations, tokenRequests: state.tokens,
        tokenFormValid: state.tokenValid, correctHeader: wire.correctHeader, tokenInUrlOrBody: wire.tokenInUrlOrBody,
        authenticatedMethods: wire.authenticatedMethods, calls: wire.calls,
        savedScopes: saved?.scopes ?? null,
        receiptScopes: attempt.result?.server.transport === "streamable-http" ? attempt.result.server.auth?.scopes ?? null : null,
        catalogRead: attempt.result?.catalog.tools.length === 1 };
      f.public = facts;
      expect(facts).toEqual({ completed: true, unexpectedError: false,
        scopes: [["operator", "read"], ["operator", "read", "write"], ["operator", "read", "write", "admin"]],
        authorizations: 3, tokenRequests: 3, tokenFormValid: true, correctHeader: true, tokenInUrlOrBody: false,
        authenticatedMethods: ["server/discover", "server/discover", "server/discover", "tools/list"], calls: 0,
        savedScopes: ["operator", "read", "write", "admin"], receiptScopes: ["operator", "read", "write", "admin"], catalogRead: true });
    });
  });

  test("stops after two real catalog reauthorizations when another scope challenge remains", async () => {
    await owned("catalog-step-up-limit", async f => {
      const state = installInteractive(f), wire = installCatalog(f, state.access, ["write", "admin", "fourth"]);
      const target = storeAt(f, "catalog-limit"), attempt = await catalogAttempt(f, target.home, target.file);
      const facts = { completed: attempt.result !== null, classifiedRefusal: attempt.error instanceof NativeMcpHttpRefused,
        lastRequiredScopes: attempt.error instanceof NativeMcpHttpRefused ? attempt.error.requiredScopes ?? null : null,
        scopes: state.authorizationScopes, authorizations: state.authorizations, tokenRequests: state.tokens,
        tokenFormValid: state.tokenValid, correctHeader: wire.correctHeader, tokenInUrlOrBody: wire.tokenInUrlOrBody,
        authenticatedMethods: wire.authenticatedMethods, calls: wire.calls };
      f.public = facts;
      expect(facts).toEqual({ completed: false, classifiedRefusal: true, lastRequiredScopes: ["fourth"],
        scopes: [["operator", "read"], ["operator", "read", "write"], ["operator", "read", "write", "admin"]],
        authorizations: 3, tokenRequests: 3, tokenFormValid: true, correctHeader: true, tokenInUrlOrBody: false,
        authenticatedMethods: ["server/discover", "server/discover", "server/discover"], calls: 0 });
    });
  });
});

describe("P1-39 OAuth governed evidence secrecy qualification", () => {
  test("redacts a real header token echoed by a governed tool from the outcome and committed evidence payloads", async () => {
    await owned("governed-token-redaction", async f => {
      const state = installInteractive(f), wire = installCatalog(f, state.access), target = storeAt(f, "governed-credentials");
      let session: SessionService | undefined, toolset: AgentToolset | undefined, mount: MountedNativeMcpServer | undefined;
      let sessionOpened = false, turnStarted = false, stepStarted = false, sessionClosed = false;
      let stepEnded = false, turnEnded = false, turnSealed = false, toolsetClosed = false, mountClosed = false, disposedUnsealed = false;
      let bodyFailed = false, bodyError: unknown; const cleanupErrors: unknown[] = [];
      try {
        // The real Vitest runner supplies its documented test-vault environment;
        // this fixture neither sets a passphrase nor changes process.env.
        initWorkspace({ workspacePath: f.root, trustBoundaryMode: "isolated" }); initBudgets(f.root);
        writeRuntimeFirewallPolicy({ workspace: f.root, mode: "observe" });
        const name = nativeMcpToolName("oauth_fixture", "lookup"), configured = loadToolsConfig(f.root);
        initToolsConfig(f.root, { ...configured, tools: { ...configured.tools,
          allowedTools: [...configured.tools.allowedTools, { name, actionClass: "READ_ONLY" }] } });
        session = new SessionService(f.root);
        session.open({ agentId: "default", harnessVersion: "oauth-fixture", compositionDigest: "oauth-fixture", policyDigest: "oauth-fixture" });
        sessionOpened = true; session.startTurn({ trigger: "user" }); turnStarted = true; session.startStep(); stepStarted = true;
        toolset = agentToolset({ workspace: f.root, agentId: "default", sessionId: session.sessionId, recorder: session });
        const startedWithoutGrant = await target.store.load(f.issuer, f.endpoint.href) === null;
        const authorizationStart = f.requests.length;
        const authorization = await interactiveAttempt(f, { kind: "oauth2", clientId: "synthetic-client" }, target.store);
        const storedGrant = await target.store.load(f.issuer, f.endpoint.href);
        const grantReloadMatches = storedGrant !== null && storedGrant.issuer === f.issuer && storedGrant.resource === f.endpoint.href
          && storedGrant.clientId === "synthetic-client" && storedGrant.scopes.join(" ") === "read"
          && storedGrant.accessToken === state.access && storedGrant.refreshToken === state.refresh
          && typeof storedGrant.expiresAt === "string" && Number.isFinite(Date.parse(storedGrant.expiresAt));
        const authorizationFacts = { startedWithoutGrant, completed: authorization.success && authorization.error === null,
          authorizeValid: state.authorizeValid, tokenValid: state.tokenValid, grantReloadMatches,
          requests: f.requests.slice(authorizationStart).map(row => ({ method: row.method, path: row.path, status: row.status,
            authorizationPresent: row.authorizationPresent })) };
        f.public = { realAuthorization: authorizationFacts };
        const server = await resolveNativeMcpServer(oauthConfiguration(f), { workspace: f.root,
          credentialsHome: target.home, credentialsFile: target.file });
        const catalog = await discoverNativeMcpCatalog(server, f.root);
        mount = await mountNativeMcpServer({ server, workspace: f.root, agentId: "default", toolset,
          expectedCatalogDigest: catalog.digest, grants: [{ name: "lookup", actionClass: "READ_ONLY" }] });
        const activeSession = session, activeToolset = toolset, callId = toolCallId("oauth-redaction-call");
        const args = JSON.stringify({ query: "synthetic lookup" }), outcomes: ToolCallOutcome[] = [];
        activeSession.recordToolCall({ toolCallId: callId, toolName: name, dispatch: "native", parentToken: null, args });
        await runToolCalls({ session: activeSession, turn: 1, step: 1, signal: new AbortController().signal,
          maxParallel: 1, abandonGraceMs: DEFAULT_AGENT_LOOP_CONFIG.toolAbandonGraceMs, parentToken: null,
          acceptContext: () => { throw new Error("Unexpected owned OAuth additional context"); },
          calls: [{ kind: "tool_use", id: callId, name, arguments: args }],
          tools: { schemas: () => activeToolset.seam.schemas(), executionMode: request => activeToolset.seam.executionMode(request),
            execute: async request => { const outcome = await activeToolset.seam.execute(request); outcomes.push(outcome); return outcome; } } });
        const rows = activeSession.readEvents(), payloads = rows.map(row => readEventPayload(f.root, row));
        const toolRows = rows.filter(row => row.event_type === "tool/call" || row.event_type === "tool/result");
        const resultRows = rows.filter(row => row.event_type === "tool/result");
        const resultPayloads = resultRows.map(row => readEventPayload(f.root, row));
        const forbidden = [state.access, state.refresh, "Bearer " + state.access];
        const metadataSafe = !forbidden.some(value => JSON.stringify(rows).includes(value));
        const payloadsSafe = payloads.every(payload => payload.status === "ok"
          && !forbidden.some(value => payload.bytes.toString("utf8").includes(value)));
        const resultHasRedaction = resultPayloads.length === 1 && resultPayloads.every(payload => payload.status === "ok"
          && payload.bytes.toString("utf8").includes("[REDACTED]"));
        const outcome = outcomes[0], output = outcome === undefined ? "" : String(outcome.content);
        const receipt = mount.receipt;
        const receiptSafe = !forbidden.some(value => JSON.stringify(receipt).includes(value));
        const receiptMatchesReviewed = receipt.serverId === catalog.serverId && receipt.catalogDigest === catalog.digest
          && JSON.stringify(receipt.protocol) === JSON.stringify(catalog.protocol);
        const receiptStateless = receipt.protocol.mode === "stateless" && receipt.protocol.negotiatedVersion === "2026-07-28";
        const receiptAuthMatches = receipt.auth !== null
          && Object.keys(receipt.auth).sort().join(" ") === "issuer scopes tokenExpiresAt"
          && receipt.auth.issuer === f.issuer && receipt.auth.scopes.length === 1 && receipt.auth.scopes[0] === "read"
          && storedGrant !== null && typeof storedGrant.expiresAt === "string"
          && Number.isFinite(Date.parse(storedGrant.expiresAt)) && receipt.auth.tokenExpiresAt === storedGrant.expiresAt;
        const facts = { realAuthorization: { ...authorizationFacts, authorizations: state.authorizations, tokenRequests: state.tokens },
          authenticatedMethods: wire.authenticatedMethods,
          governedOutcomeOK: outcomes.length === 1 && outcome?.outcome === "OK" && !outcome.timedOut && !outcome.denied,
          callCount: wire.calls, correctHeader: wire.correctHeader, tokenInUrlOrBody: wire.tokenInUrlOrBody,
          outcomeTokenAbsent: !forbidden.some(value => output.includes(value)), outcomeHasRedaction: output.includes("[REDACTED]"),
          toolEvents: toolRows.map(row => row.event_type), toolEventsSigned: toolRows.every(row => row.writer_sig !== "unsigned"),
          metadataSafe, payloadsSafe, resultHasRedaction, committedPayloadsRead: payloads.length,
          receiptSafe, receiptMatchesReviewed, receiptStateless, receiptAuthMatches,
          sampleMountReceipt: receiptSafe ? receipt : null,
          setupCallerEnvironment: "Inherited process.env and user dotenv remain enabled by the public configuration caller" };
        f.public = facts;
        // All checks publish only booleans/counts: no raw token or echoed body is an assertion operand.
        expect({ governedOutcomeOK: facts.governedOutcomeOK, callCount: facts.callCount, correctHeader: facts.correctHeader,
          tokenInUrlOrBody: facts.tokenInUrlOrBody, outcomeTokenAbsent: facts.outcomeTokenAbsent, outcomeHasRedaction: facts.outcomeHasRedaction,
          toolEvents: facts.toolEvents, toolEventsSigned: facts.toolEventsSigned, metadataSafe, payloadsSafe, resultHasRedaction,
          receiptSafe, receiptMatchesReviewed, receiptStateless, receiptAuthMatches })
          .toEqual({ governedOutcomeOK: true, callCount: 1, correctHeader: true, tokenInUrlOrBody: false, outcomeTokenAbsent: true,
            outcomeHasRedaction: true, toolEvents: ["tool/call", "tool/result"], toolEventsSigned: true,
            metadataSafe: true, payloadsSafe: true, resultHasRedaction: true, receiptSafe: true,
            receiptMatchesReviewed: true, receiptStateless: true, receiptAuthMatches: true });
        expect(payloads.length).toBeGreaterThan(0);
        expect(facts.realAuthorization).toEqual({ startedWithoutGrant: true, completed: true, authorizeValid: true,
          tokenValid: true, grantReloadMatches: true, authorizations: 1, tokenRequests: 1, requests: [
            { method: "POST", path: "/mcp/v1", status: 401, authorizationPresent: false },
            { method: "GET", path: "/prm", status: 200, authorizationPresent: false },
            { method: "GET", path: "/.well-known/oauth-authorization-server/issuer/path", status: 200, authorizationPresent: false },
            { method: "GET", path: "/authorize", status: 302, authorizationPresent: false },
            { method: "POST", path: "/token", status: 200, authorizationPresent: false }
          ] });
        expect(facts.authenticatedMethods).toEqual(["server/discover", "tools/list", "server/discover", "tools/list", "tools/list", "tools/call"]);
      } catch (error) { bodyFailed = true; bodyError = error; }
      finally {
        const stage = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
        await stage(async () => { if (mount) { await mount.close(); mountClosed = true; } });
        await stage(() => { if (toolset) { toolset.close(); toolsetClosed = true; } });
        await stage(() => { if (session && stepStarted) { session.endStep({ stopReason: "end_turn", usage: null }); stepEnded = true; } });
        await stage(() => { if (session && turnStarted) { session.endTurn({ reason: bodyFailed ? "error" : "complete" }); turnEnded = true; } });
        await stage(() => { if (session && turnEnded) { session.sealTurn(); turnSealed = true; } });
        await stage(() => { if (session && sessionOpened) { session.close({ reason: bodyFailed ? "error" : "completed" }); sessionClosed = true; } });
        if (session && !sessionClosed) await stage(() => { session!.disposeWithoutClosing(); disposedUnsealed = true; });
        await stage(() => lockVault(f.root));
        if (mount && !mountClosed) cleanupErrors.push(new Error("Owned OAuth mount did not close"));
        if (toolset && !toolsetClosed) cleanupErrors.push(new Error("Owned OAuth toolset did not close"));
        if (sessionOpened && (!stepEnded || !turnEnded || !turnSealed || !sessionClosed)) cleanupErrors.push(new Error("Owned OAuth session lifecycle incomplete"));
        f.public.governedLifecycle = { sessionOpened, turnStarted, stepStarted, mountClosed, toolsetClosed, stepEnded, turnEnded,
          turnSealed, sessionClosed, disposedUnsealed, cleanupErrorCount: cleanupErrors.length };
      }
      if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "Owned OAuth governed cleanup failed");
      if (bodyFailed) throw bodyError;
    });
  });
});
