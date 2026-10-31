import { spawn, type ChildProcess } from "node:child_process";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { identityInitCli, identityProviderAddOidcCli } from "../../src/identity/identityCli.js";
import { hostVaultStatus, lockHostVault } from "../../src/identity/hostVault.js";
import { consumePendingOidcLogin, savePendingOidcLogin } from "../../src/identity/pendingLoginStore.js";
import { initHostDb } from "../../src/workspaces/hostDb.js";
import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";

const TTL = 600_000;
const OPT_IN = "AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK";
const CLIENT = "synthetic-pending-client";
const PROVIDER = "synthetic-pending-provider";
const USERNAME = "pending-state@example.test";
const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const ROUTER_URL = pathToFileURL(join(CHECKOUT, "dist/workspaces/workspaceRouter.js")).href;
const VAULT_URL = pathToFileURL(join(CHECKOUT, "dist/identity/hostVault.js")).href;
type ErrorFact = { scope: string; name: string; message: string; code: string | null };
type HttpResult = { status: number; headers: IncomingHttpHeaders; body: string };
interface Fixture {
  root: string; hostDir: string; home: string; temp: string; passphrase: string;
  errors: ErrorFact[]; observations: unknown[]; close: (() => Promise<void> | void)[];
}
function fact(scope: string, error: unknown): ErrorFact {
  const code = (error as { code?: unknown } | null)?.code;
  return { scope, name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error), code: typeof code === "string" ? code : null };
}
async function owned(label: string, body: (f: Fixture) => Promise<void>): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p207-pending-")));
  const f: Fixture = { root, hostDir: join(root, "host"), home: join(root, "home"), temp: join(root, "tmp"),
    passphrase: randomUUID(), errors: [], observations: [], close: [] };
  const env = { HOME: f.home, TMPDIR: f.temp, AMC_HOME: join(f.home, ".amc"),
    AMC_HOST_VAULT_PASSPHRASE: f.passphrase, [OPT_IN]: "1" };
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  const cleanupErrors: unknown[] = [];
  let bodyError: unknown, failed = false;
  try {
    for (const path of [f.hostDir, f.home, f.temp, join(root, "observations")]) mkdirSync(path, { mode: 0o700 });
    Object.assign(process.env, env);
    await body(f);
  } catch (error) { bodyError = error; failed = true; }
  finally {
    for (const close of f.close.reverse()) {
      try { await close(); } catch (error) { cleanupErrors.push(error); }
    }
    try { lockHostVault(f.hostDir); } catch (error) { cleanupErrors.push(error); }
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    try {
      expect([...previous].every(([key, value]) => process.env[key] === value)).toBe(true);
      expect(f.errors).toEqual([]);
    } catch (error) { cleanupErrors.push(error); }
    const evidence = join(root, "observations", "public-evidence.json");
    try {
      writeFileSync(evidence, `${JSON.stringify({ schema: "amc-p207-pending/1", label, synthetic: true,
        checkout: CHECKOUT, compiledChildModules: [ROUTER_URL, VAULT_URL], observations: f.observations,
        errors: f.errors, exactEnvironmentRestored: [...previous].every(([key, value]) => process.env[key] === value),
        bodyFailed: failed, bodyError: failed ? fact("body", bodyError) : null,
        cleanupErrors: cleanupErrors.map(error => fact("cleanup", error)), signalsSent: false,
        retainedRoot: root }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      // Retain all four owned roots, including complete cold-child streams and every failure.
      console.log(`AMC_P207_PENDING_PUBLIC_EVIDENCE ${evidence}`);
    } catch (error) { cleanupErrors.push(error); console.log(`AMC_P207_PENDING_RETAINED_ROOT ${root}`); }
  }
  if (cleanupErrors.length > 0) throw new AggregateError(failed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned pending-state cleanup failed");
  if (failed) throw bodyError;
}

async function withClock(t0: number, body: (set: (now: number) => void) => Promise<void>): Promise<void> {
  const original = Date.now;
  const descriptor = Object.getOwnPropertyDescriptor(Date, "now");
  let now = t0, bodyError: unknown, failed = false;
  const spy = vi.spyOn(Date, "now").mockImplementation(() => now);
  try { await body(value => { now = value; }); } catch (error) { bodyError = error; failed = true; }
  try { spy.mockRestore(); expect(Date.now).toBe(original); expect(Object.getOwnPropertyDescriptor(Date, "now")).toEqual(descriptor); }
  catch (error) { throw new AggregateError(failed ? [bodyError, error] : [error], "Date.now restoration failed"); }
  if (failed) throw bodyError;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.removeListener("listening", onListen); reject(error); };
    const onListen = () => { server.removeListener("error", onError); resolve(); };
    server.once("error", onError); server.once("listening", onListen); server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.port <= 0) throw new Error("owned server has no positive port");
  return (address as AddressInfo).port;
}
async function closeServer(server: Server): Promise<void> {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function pickPort(f: Fixture): Promise<number> {
  const server = createServer();
  server.on("error", error => f.errors.push(fact("port-probe", error)));
  try { return await listen(server); } finally { await closeServer(server); }
}

async function httpCall(f: Fixture, url: string, headers: Record<string, string> = {}): Promise<HttpResult> {
  const observation = { kind: "client", path: new URL(url).pathname, status: 0,
    responseEnded: false, responseComplete: false, requestClosed: false, socketClosed: false };
  f.observations.push(observation);
  let socketClose: Promise<void> | undefined;
  let resolveRequestClose!: () => void;
  const requestClose = new Promise<void>(resolve => { resolveRequestClose = resolve; });
  const result = new Promise<HttpResult>((resolve, reject) => {
    const req = httpRequest(url, { method: "GET", agent: false, headers: { ...headers, connection: "close" } }, res => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("error", error => { f.errors.push(fact("client-response", error)); reject(error); });
      res.on("aborted", () => { const error = new Error("owned response aborted"); f.errors.push(fact("client-response", error)); reject(error); });
      res.on("close", () => {
        if (!res.complete) { const error = new Error("owned response closed before completion"); f.errors.push(fact("client-response", error)); reject(error); }
      });
      res.on("end", () => {
        observation.status = res.statusCode ?? 0; observation.responseEnded = true; observation.responseComplete = res.complete;
        resolve({ status: observation.status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.once("socket", socket => {
      socketClose = new Promise<void>(resolveClose => socket.once("close", () => { observation.socketClosed = true; resolveClose(); }));
      socket.on("error", error => f.errors.push(fact("client-socket", error)));
    });
    req.on("error", error => { f.errors.push(fact("client-request", error)); reject(error); });
    req.once("close", () => { observation.requestClosed = true; resolveRequestClose(); });
    req.end();
  });
  try { return await result; }
  finally {
    await requestClose; await socketClose;
    expect(observation.requestClosed).toBe(true); expect(observation.socketClosed).toBe(true);
  }
}

async function localIdp(f: Fixture, redirectUri: string) {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = { ...pair.publicKey.export({ format: "jwk" }), kid: "pending-key", use: "sig", alg: "RS256" };
  const clientSecret = randomUUID();
  const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string }>();
  const counters = { discovery: 0, authorize: 0, token: 0, jwks: 0, pkceVerified: 0 };
  const sockets = new Set<Socket>(), socketCloses: Promise<void>[] = [];
  const requests: { path: string; method: string; ended: boolean; responseClosed: boolean; complete: boolean; status: number }[] = [];
  let issuer = "", closed = false, started = false;
  const server = createServer((req, res) => {
    const observation = { path: new URL(req.url ?? "/", issuer).pathname, method: req.method ?? "",
      ended: false, responseClosed: false, complete: false, status: 0 };
    requests.push(observation);
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("error", error => f.errors.push(fact("idp-request", error)));
    req.on("aborted", () => f.errors.push(fact("idp-request", new Error("owned IdP request aborted"))));
    res.on("error", error => f.errors.push(fact("idp-response", error)));
    res.on("close", () => { observation.responseClosed = true; });
    req.on("end", () => {
      observation.ended = true; observation.complete = req.complete;
      const json = (status: number, value: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
      try {
        const url = new URL(req.url ?? "/", issuer), prefix = new URL(issuer).pathname;
        if (req.method === "GET" && url.pathname === `${prefix}/.well-known/openid-configuration`) {
          counters.discovery++;
          json(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
        } else if (req.method === "GET" && url.pathname === `${prefix}/jwks`) {
          counters.jwks++; json(200, { keys: [publicKey] });
        } else if (req.method === "GET" && url.pathname === `${prefix}/authorize`) {
          counters.authorize++;
          const state = url.searchParams.get("state") ?? "", nonce = url.searchParams.get("nonce") ?? "";
          const challenge = url.searchParams.get("code_challenge") ?? "";
          if (url.searchParams.get("client_id") !== CLIENT || url.searchParams.get("response_type") !== "code"
            || url.searchParams.get("redirect_uri") !== redirectUri || !state || !nonce
            || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || url.searchParams.get("code_challenge_method") !== "S256") {
            throw new Error("owned IdP rejected malformed authorization request");
          }
          const code = randomUUID(); codes.set(code, { nonce, challenge, redirectUri });
          const callback = new URL(redirectUri); callback.searchParams.set("state", state); callback.searchParams.set("code", code);
          res.statusCode = 302; res.setHeader("location", callback.href); res.end();
        } else if (req.method === "POST" && url.pathname === `${prefix}/token`) {
          counters.token++;
          const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
          const code = form.get("code") ?? "", record = codes.get(code);
          if (!record) { json(400, { error: "invalid_grant" }); }
          else {
            const verifier = form.get("code_verifier") ?? "";
            const challenge = createHash("sha256").update(verifier).digest("base64url");
            if (form.get("client_id") !== CLIENT || form.get("client_secret") !== clientSecret
              || form.get("grant_type") !== "authorization_code" || form.get("redirect_uri") !== record.redirectUri
              || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || challenge !== record.challenge) {
              throw new Error("owned IdP rejected token client, redirect or PKCE");
            }
            counters.pkceVerified++; codes.delete(code);
            const now = Math.floor(Date.now() / 1000);
            const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "pending-key", typ: "JWT" })).toString("base64url");
            const payload = Buffer.from(JSON.stringify({ iss: issuer, aud: CLIENT, sub: "pending-subject", nonce: record.nonce,
              email: USERNAME, email_verified: true, name: "Synthetic Pending User", groups: [], iat: now, exp: now + 600 })).toString("base64url");
            const input = `${header}.${payload}`;
            const signature = sign("sha256", Buffer.from(input), pair.privateKey).toString("base64url");
            json(200, { id_token: `${input}.${signature}`, token_type: "Bearer" });
          }
        } else { throw new Error("owned IdP received unexpected route"); }
        observation.status = res.statusCode;
      } catch (error) { f.errors.push(fact("idp-handler", error)); json(500, { error: "owned_fixture_failure" }); observation.status = res.statusCode; }
    });
  });
  server.on("error", error => f.errors.push(fact("idp-server", error)));
  server.on("close", () => { closed = true; });
  server.on("connection", socket => {
    sockets.add(socket); socketCloses.push(new Promise<void>(resolve => socket.once("close", () => { sockets.delete(socket); resolve(); })));
    socket.on("error", error => f.errors.push(fact("idp-socket", error)));
  });
  f.close.push(async () => {
    await closeServer(server); await Promise.all(socketCloses);
    f.observations.push({ kind: "idp-closure", counters, requests, started, closed, listening: server.listening, openSockets: sockets.size });
    if (started) expect(closed).toBe(true);
    expect(server.listening).toBe(false); expect(sockets.size).toBe(0);
    expect(requests.every(r => r.ended && r.complete && r.responseClosed)).toBe(true);
  });
  issuer = `http://127.0.0.1:${await listen(server)}/${randomUUID()}`;
  started = true;
  return { issuer, clientSecret, counters };
}

async function authRouter(f: Fixture) {
  initHostDb(f.hostDir); identityInitCli(f.hostDir);
  const port = await pickPort(f), base = `http://127.0.0.1:${port}`;
  const redirectUri = `${base}/host/api/auth/oidc/${PROVIDER}/callback`;
  const idp = await localIdp(f, redirectUri);
  const secretFile = join(f.root, "synthetic-client-secret");
  writeFileSync(secretFile, idp.clientSecret, { flag: "wx", mode: 0o600 });
  identityProviderAddOidcCli({ hostDir: f.hostDir, providerId: PROVIDER, issuer: idp.issuer, clientId: CLIENT,
    clientSecretFile: secretFile, redirectUri });
  let router: Awaited<ReturnType<typeof startWorkspaceRouter>> | undefined, closed = false;
  const close = async () => {
    if (router && !closed) { await router.close(); closed = true; f.observations.push({ kind: "parent-router-closed", port }); }
  };
  f.close.push(close);
  router = await startWorkspaceRouter({ hostDir: f.hostDir, host: "127.0.0.1", port });
  f.observations.push({ kind: "parent-router-started", port, hostDir: f.hostDir });
  return { port, base, idp, close, redirectUri };
}
async function authorize(f: Fixture, base: string): Promise<string> {
  const login = await httpCall(f, `${base}/host/api/auth/oidc/${PROVIDER}/login`);
  expect(login.status).toBe(302); expect(typeof login.headers.location).toBe("string");
  const authorized = await httpCall(f, login.headers.location!);
  expect(authorized.status).toBe(302); expect(typeof authorized.headers.location).toBe("string");
  const callback = new URL(authorized.headers.location!);
  expect(callback.origin).toBe(base); expect(callback.pathname).toBe(`/host/api/auth/oidc/${PROVIDER}/callback`);
  expect(callback.searchParams.get("state")).toBeTruthy(); expect(callback.searchParams.get("code")).toBeTruthy();
  return callback.href;
}

// This string is plain Node ESM. It imports only this physical checkout's compiled modules.
const COLD_ROUTER = String.raw`
const [routerUrl, vaultUrl, hostDir, portText] = process.argv.slice(1);
const port = Number(portText);
let runtime, lock, started = false, stopRequested = false, closing;
function fail(error) {
  process.exitCode = 1;
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + "\n");
}
async function closeOwned() {
  stopRequested = true;
  if (!started) return;
  if (closing) return closing;
  closing = (async () => {
    try { if (runtime) await runtime.close(); } catch (error) { fail(error); }
    try { if (lock) lock(hostDir); } catch (error) { fail(error); }
    process.removeListener("message", onMessage);
    process.removeListener("disconnect", onDisconnect);
    if (process.connected) process.disconnect();
  })();
  return closing;
}
function onMessage(message) {
  if (message && message.type === "stop") void closeOwned().catch(fail);
  else { fail(new Error("unexpected owned IPC message")); void closeOwned().catch(fail); }
}
function onDisconnect() { fail(new Error("owned parent IPC disconnected before stop")); void closeOwned().catch(fail); }
process.on("message", onMessage);
process.on("disconnect", onDisconnect);
try {
  if (!Number.isInteger(port) || port <= 0 || !hostDir || !routerUrl.startsWith("file:") || !vaultUrl.startsWith("file:")) {
    throw new Error("invalid owned child arguments");
  }
  const routerModule = await import(routerUrl);
  const vaultModule = await import(vaultUrl);
  lock = vaultModule.lockHostVault;
  if (!stopRequested) runtime = await routerModule.startWorkspaceRouter({ hostDir, host: "127.0.0.1", port });
  started = true;
  if (stopRequested || !process.connected) await closeOwned();
  else process.send({ type: "ready", pid: process.pid, host: "127.0.0.1", port, hostDir, routerUrl, vaultUrl }, error => {
    if (error) { fail(error); void closeOwned().catch(fail); }
  });
} catch (error) { fail(error); started = true; await closeOwned(); }
`;

async function coldRouter(f: Fixture, port: number): Promise<void> {
  const stdout = join(f.root, "child.stdout.log"), stderr = join(f.root, "child.stderr.log");
  const descriptors: number[] = [];
  let child: ChildProcess | undefined, closed = false, ready = false, stopping = false, stop: Promise<void> | undefined;
  let outcome: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let closePromise: Promise<void> | undefined;
  const events: unknown[] = [];
  f.close.push(() => {
    if (stop) return stop;
    stop = (async () => {
      stopping = true;
      const errors: unknown[] = [];
      try {
        if (child && !closed && child.connected) {
          await new Promise<void>((resolve, reject) => child!.send({ type: "stop" }, error => error ? reject(error) : resolve()));
        }
      } catch (error) { errors.push(error); }
      try {
        await closePromise;
        if (child) {
          expect(closed).toBe(true);
          const pid = child.pid;
          if (pid === undefined) throw new Error("owned child never had a PID");
          const start = performance.now();
          let absent = false;
          while (performance.now() - start <= 5_000) {
            try { process.kill(pid, 0); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") { absent = true; break; } throw error; }
            await new Promise<void>(resolve => setTimeout(resolve, 10));
          }
          events.push({ type: "pid-probe", pid, absent, elapsedMs: performance.now() - start });
          expect(absent).toBe(true);
          expect(outcome).toEqual({ code: 0, signal: null });
        }
      } catch (error) { errors.push(error); }
      finally {
        for (const fd of descriptors) { try { closeSync(fd); } catch (error) { errors.push(error); } }
      }
      try {
        const out = readFileSync(stdout), err = readFileSync(stderr);
        events.push({ type: "streams", stdoutBytes: out.length, stderrBytes: err.length });
        expect(out.length).toBe(0); expect(err.length).toBe(0);
      } catch (error) { errors.push(error); }
      f.observations.push({ kind: "child", pid: child?.pid ?? null, ready, closed, outcome: outcome ?? null,
        stdout, stderr, events, detached: false, explicitEnvironment: true });
      if (errors.length) throw new AggregateError(errors, "owned cold router closure failed");
    })();
    return stop;
  });
  descriptors.push(openSync(stdout, "wx", 0o600)); descriptors.push(openSync(stderr, "wx", 0o600));
  child = spawn(process.execPath, ["--input-type=module", "--eval", COLD_ROUTER, ROUTER_URL, VAULT_URL, f.hostDir, String(port)], {
    cwd: f.root, detached: false, stdio: ["ignore", descriptors[0]!, descriptors[1]!, "ipc"],
    env: { HOME: f.home, TMPDIR: f.temp, AMC_HOME: join(f.home, ".amc"), AMC_HOST_VAULT_PASSPHRASE: f.passphrase,
      [OPT_IN]: "1", NODE_ENV: "test", LANG: "C", PATH: dirname(process.execPath) }
  });
  const actualChild = child;
  let resolveClose!: () => void;
  closePromise = new Promise<void>(resolve => { resolveClose = resolve; });
  await new Promise<void>((resolve, reject) => {
    actualChild.on("error", error => { f.errors.push(fact("child-process", error)); reject(error); });
    actualChild.on("message", (message: unknown) => {
      const expected = { type: "ready", pid: actualChild.pid, host: "127.0.0.1", port, hostDir: f.hostDir,
        routerUrl: ROUTER_URL, vaultUrl: VAULT_URL };
      try { expect(ready).toBe(false); expect(message).toEqual(expected); ready = true; events.push(expected); resolve(); }
      catch (error) { f.errors.push(fact("child-ready", error)); reject(error); }
    });
    actualChild.once("close", (code, signal) => {
      closed = true; outcome = { code, signal }; events.push({ type: "close", code, signal }); resolveClose();
      if (!stopping) f.errors.push(fact("child-close", new Error("owned cold router closed before parent stop")));
      if (!ready) reject(new Error("owned cold router closed before readiness"));
    });
  });
}

describe.sequential("P2-07 persisted pending OIDC state", () => {
  test("persisted login completes in a cold replacement router and cannot be reused", async () => {
    await owned("cold-router-and-replay", async f => {
      const router = await authRouter(f), callback = await authorize(f, router.base);
      expect(router.idp.counters.token).toBe(0);
      await router.close(); lockHostVault(f.hostDir);
      expect(hostVaultStatus(f.hostDir).unlocked).toBe(false);
      f.observations.push({ milestone: "parent-vault-locked-before-cold-child" });
      await coldRouter(f, router.port);
      const completed = await httpCall(f, callback);
      expect(completed.status).toBe(302);
      const cookies = completed.headers["set-cookie"] ?? [];
      expect(cookies.length).toBe(1); expect(/^amc_session=.+; HttpOnly;/.test(cookies[0] ?? "")).toBe(true);
      const me = await httpCall(f, `${router.base}/host/api/auth/me`, { cookie: cookies[0]!.split(";")[0]! });
      expect(me.status).toBe(200); expect(JSON.parse(me.body)).toMatchObject({ authMode: "IDENTITY", user: { username: USERNAME } });
      expect(router.idp.counters.token).toBe(1); expect(router.idp.counters.pkceVerified).toBe(1);
      f.observations.push({ milestone: "cold-callback-and-identity-session-passed", tokenPosts: router.idp.counters.token });
      const replay = await httpCall(f, callback);
      expect(replay.status).toBe(400); expect(JSON.parse(replay.body)).toEqual({ error: "Error: OIDC state mismatch" });
      expect(replay.headers["set-cookie"] === undefined).toBe(true); expect(router.idp.counters.token).toBe(1);
      f.observations.push({ milestone: "cold-replay-refused-before-exchange", tokenPosts: router.idp.counters.token });
    });
  });

  test("router rejects state at the exact TTL before token exchange", async () => {
    await owned("router-exact-ttl", async f => {
      const router = await authRouter(f), t0 = Date.now();
      let callback = "";
      await withClock(t0, async set => {
        callback = await authorize(f, router.base);
        expect(router.idp.counters.token).toBe(0);
        set(t0 + TTL);
        const expired = await httpCall(f, callback);
        f.observations.push({ milestone: "exact-ttl-router-response", status: expired.status, tokenPosts: router.idp.counters.token });
        expect(expired.status).toBe(400); expect(JSON.parse(expired.body)).toEqual({ error: "Error: OIDC state expired" });
        expect(expired.headers["set-cookie"] === undefined).toBe(true); expect(router.idp.counters.token).toBe(0);
      });
      const retry = await httpCall(f, callback);
      expect(retry.status).toBe(400); expect(JSON.parse(retry.body)).toEqual({ error: "Error: OIDC state mismatch" });
      expect(retry.headers["set-cookie"] === undefined).toBe(true); expect(router.idp.counters.token).toBe(0);
      f.observations.push({ milestone: "expired-state-burned", clockRestoredBeforeRetry: true, tokenPosts: router.idp.counters.token });
    });
  });

  test("public consume removes a valid state exactly once", async () => {
    await owned("public-single-use", async f => {
      const t0 = Date.now(), state = randomUUID(), verifier = "v".repeat(43), nonce = randomUUID();
      await withClock(t0, async () => {
        savePendingOidcLogin({ hostDir: f.hostDir, state, providerId: PROVIDER, verifier, nonce });
        expect(consumePendingOidcLogin({ hostDir: f.hostDir, state, providerId: PROVIDER })).toEqual({
          providerId: PROVIDER, verifier, nonce, createdTs: t0, expiresTs: t0 + TTL });
        f.observations.push({ milestone: "public-first-consume-passed", ttlMs: TTL });
        expect(() => consumePendingOidcLogin({ hostDir: f.hostDir, state, providerId: PROVIDER })).toThrow(/^OIDC state mismatch$/);
        f.observations.push({ milestone: "public-second-consume-refused" });
      });
    });
  });

  test("public consume admits TTL minus one and rejects exact TTL", async () => {
    await owned("public-ttl-boundary", async f => {
      const t0 = Date.now(), early = randomUUID(), exact = randomUUID(), verifier = "v".repeat(43), nonce = randomUUID();
      await withClock(t0, async set => {
        for (const state of [early, exact]) savePendingOidcLogin({ hostDir: f.hostDir, state, providerId: PROVIDER, verifier, nonce });
        set(t0 + TTL - 1);
        expect(consumePendingOidcLogin({ hostDir: f.hostDir, state: early, providerId: PROVIDER })).toEqual({
          providerId: PROVIDER, verifier, nonce, createdTs: t0, expiresTs: t0 + TTL });
        f.observations.push({ milestone: "public-ttl-minus-one-passed", elapsedMs: TTL - 1 });
        set(t0 + TTL);
        expect(() => consumePendingOidcLogin({ hostDir: f.hostDir, state: exact, providerId: PROVIDER })).toThrow(/^OIDC state expired$/);
        f.observations.push({ milestone: "public-exact-ttl-refused", elapsedMs: TTL });
        expect(() => consumePendingOidcLogin({ hostDir: f.hostDir, state: exact, providerId: PROVIDER })).toThrow(/^OIDC state mismatch$/);
        f.observations.push({ milestone: "public-expired-state-burned" });
      });
    });
  });
});
