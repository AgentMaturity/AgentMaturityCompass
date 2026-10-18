import { constants, createHash, createHmac, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { discoverOidcWellKnown, oidcFetchJson, validateOidcUrl, verifyJwtIdToken } from "../../src/identity/oidc/jwtVerify.js";

// Synthetic local mechanism fixtures: no recorded IdP token, tenant or browser assertion.
const NOW = 1_800_000_000;
const CLIENT = "synthetic-oidc-client";
const NONCE = "synthetic-exact-nonce";
const CAP = 1_048_576;
const OPT_IN = "AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK";
type Json = Record<string, unknown>;
type Alg = "RS256" | "PS256" | "ES256" | "EdDSA" | "HS256" | "none";
type Pair = { publicKey: KeyObject; privateKey: KeyObject };
type ParametersOfVerify = Parameters<typeof verifyJwtIdToken>[0];
let keyMaterial: { rsa: Pair; other: Pair; weak: Pair; ec: Pair; otherCurve: Pair; ed: Pair } | undefined;
function keys() {
  // Real keys stay in memory. Only public JWKs leave this helper.
  return keyMaterial ??= {
    rsa: generateKeyPairSync("rsa", { modulusLength: 2048 }),
    other: generateKeyPairSync("rsa", { modulusLength: 2048 }),
    weak: generateKeyPairSync("rsa", { modulusLength: 1024 }),
    ec: generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    otherCurve: generateKeyPairSync("ec", { namedCurve: "secp384r1" }),
    ed: generateKeyPairSync("ed25519")
  };
}
function publicJwk(pair: Pair = keys().rsa, kid = "key-a", extra: Json = {}): Json {
  return { ...pair.publicKey.export({ format: "jwk" }), kid, use: "sig", ...extra };
}
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const b64 = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");
function claims(issuer: string, patch: Json = {}): Json {
  return { iss: issuer, aud: CLIENT, sub: "synthetic-subject", nonce: NONCE, iat: NOW, exp: NOW + 600, ...patch };
}
function token(issuer: string, options: {
  claims?: Json; alg?: Alg; pair?: Pair; header?: Json; rawClaims?: string | Buffer; rawHeader?: string | Buffer;
} = {}): string {
  const alg = options.alg ?? "RS256";
  const pair = options.pair ?? (alg === "ES256" ? keys().ec : alg === "EdDSA" ? keys().ed : keys().rsa);
  const headerPart = b64(options.rawHeader ?? JSON.stringify({ alg, kid: "key-a", ...options.header }));
  const payloadPart = b64(options.rawClaims ?? JSON.stringify(claims(issuer, options.claims)));
  const input = Buffer.from(`${headerPart}.${payloadPart}`);
  const signature = alg === "none" ? Buffer.from([0]) // A deliberately unsupported unsigned envelope, not a valid signature.
    : alg === "HS256" ? createHmac("sha256", "synthetic-local-hmac-key").update(input).digest()
      : alg === "EdDSA" ? sign(null, input, pair.privateKey)
        : sign("sha256", input, alg === "PS256" ? {
          key: pair.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST
        } : alg === "ES256" ? { key: pair.privateKey, dsaEncoding: "ieee-p1363" as const } : pair.privateKey);
  return `${headerPart}.${payloadPart}.${signature.toString("base64url")}`;
}
function withoutClaim(issuer: string, name: string): Json {
  const value = claims(issuer);
  delete value[name];
  return value;
}
function nonfiniteClaim(issuer: string, name: string): string {
  // JSON.parse(1e309) is Infinity; JSON.stringify(Infinity) would instead test null.
  const value = claims(issuer);
  delete value[name];
  return `${JSON.stringify(value).slice(0, -1)},${JSON.stringify(name)}:1e309}`;
}
function corruptSignature(value: string): string {
  const parts = value.split(".");
  const bytes = Buffer.from(parts[2]!, "base64url");
  bytes[0] = bytes[0]! ^ 1;
  return `${parts[0]}.${parts[1]}.${bytes.toString("base64url")}`;
}
interface ResponseSpec { status?: number; body: string | Buffer; headers?: Record<string, string>; delayMs?: number }
interface RequestObservation {
  id: number; connectionId: number;
  method: string; path: string; headers: IncomingHttpHeaders; bodyBytes: number; bodySha256: string;
  body: string; requestEnded: boolean; responseClosed: boolean;
  responseStatus: number | null; responseBodyBytes: number | null; responseDelayMs: number | null;
}
type RefusalKind = "status" | "body-cap" | "timeout";
interface OwnedError {
  scope: "request" | "response" | "socket" | "server" | "handler";
  name: string; code: string | null; message: string;
  connectionId: number | null; requestId: number | null; paths: string[];
}
interface Fixture {
  root: string; issuer: string; jwksUri: string; requests: RequestObservation[]; observations: unknown[];
  replies: Map<string, ResponseSpec>; connections: () => number;
  jwks: (entries: Json[]) => void;
  confirmClientRefusal: (path: string, kind: RefusalKind, status?: number) => void;
  verify: (value?: string, patch?: Partial<ParametersOfVerify>) => ReturnType<typeof verifyJwtIdToken>;
}
async function withFixture(label: string, body: (f: Fixture) => Promise<void> | void, retain = false): Promise<void> {
  const previousOptIn = process.env[OPT_IN];
  const root = mkdtempSync(join(tmpdir(), "amc-p207-"));
  chmodSync(root, 0o700);
  mkdirSync(join(root, "observations"), { mode: 0o700 });
  const replies = new Map<string, ResponseSpec>();
  const requests: RequestObservation[] = [], observations: unknown[] = [], handlerErrors: OwnedError[] = [], transportErrors: OwnedError[] = [];
  const sockets = new Set<Socket>();
  const socketClosePromises: Promise<void>[] = [];
  const connectionIds = new WeakMap<Socket, number>();
  const socketRequests = new WeakMap<Socket, RequestObservation[]>();
  const confirmedRefusals = new Map<number, RefusalKind>();
  const transportErrorClassifications: (OwnedError & { expected: boolean; confirmedRefusal: RefusalKind | null })[] = [];
  let connectionCount = 0, closed = false, listening = false, originalError: unknown, cleanupError: unknown;
  let bodyFailed = false, cleanupFailed = false;
  const errorFacts = (scope: OwnedError["scope"], error: unknown, socket?: Socket, request?: RequestObservation): OwnedError => {
    const associated = request ? [request] : socket ? socketRequests.get(socket) ?? [] : [];
    const value = error as { code?: unknown } | null;
    return { scope, name: error instanceof Error ? error.name : typeof error,
      code: typeof value?.code === "string" ? value.code : null,
      message: error instanceof Error ? error.message : String(error),
      connectionId: socket ? connectionIds.get(socket) ?? null : null,
      requestId: associated.length === 1 ? associated[0]!.id : null, paths: associated.map(r => r.path) };
  };
  const addCleanupError = (error: unknown) => {
    cleanupError = cleanupFailed ? new AggregateError([cleanupError, error], "multiple owned cleanup failures") : error;
    cleanupFailed = true;
  };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    const observation: RequestObservation = {
      id: requests.length + 1, connectionId: connectionIds.get(request.socket) ?? 0,
      method: request.method ?? "", path: request.url ?? "", headers: request.headers,
      bodyBytes: 0, bodySha256: sha(""), body: "", requestEnded: false, responseClosed: false,
      responseStatus: null, responseBodyBytes: null, responseDelayMs: null
    };
    requests.push(observation);
    const associated = socketRequests.get(request.socket) ?? [];
    associated.push(observation);
    socketRequests.set(request.socket, associated);
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    // Callbacks collect exact facts; only a body-confirmed refusal can permit a narrow peer abort later.
    request.on("error", error => transportErrors.push(errorFacts("request", error, request.socket, observation)));
    response.on("error", error => transportErrors.push(errorFacts("response", error, request.socket, observation)));
    response.on("close", () => { observation.responseClosed = true; });
    request.on("end", () => {
      observation.requestEnded = true;
      const bytes = Buffer.concat(chunks);
      observation.body = bytes.toString("utf8");
      observation.bodyBytes = bytes.length;
      observation.bodySha256 = sha(bytes);
      try {
        const reply: ResponseSpec = replies.get(observation.path) ?? { status: 404, body: "{}" };
        response.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers });
        observation.responseStatus = response.statusCode;
        observation.responseBodyBytes = Buffer.byteLength(reply.body);
        observation.responseDelayMs = reply.delayMs ?? null;
        if (reply.delayMs !== undefined) {
          // Finite owned endpoint fallback, not a client timeout, fake clock or test-deadline change.
          const timer = setTimeout(() => response.end(reply.body), reply.delayMs);
          response.once("close", () => clearTimeout(timer));
        } else response.end(reply.body);
      } catch (error) {
        handlerErrors.push(errorFacts("handler", error, request.socket, observation));
        response.end();
      }
    });
  });
  server.on("connection", socket => {
    connectionCount++;
    connectionIds.set(socket, connectionCount);
    sockets.add(socket);
    socketClosePromises.push(new Promise<void>(resolve => {
      socket.once("close", () => { sockets.delete(socket); resolve(); });
    }));
    socket.on("error", error => transportErrors.push(errorFacts("socket", error, socket)));
  });
  server.on("error", error => handlerErrors.push(errorFacts("server", error)));
  server.on("close", () => { closed = true; });
  let fixture: Fixture | undefined;
  try {
    process.env[OPT_IN] = "1";
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
    listening = true;
    const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${randomUUID()}`;
    const jwksUri = `${issuer}/jwks`;
    fixture = {
      root, issuer, jwksUri, requests, observations, replies, connections: () => connectionCount,
      jwks: entries => replies.set(new URL(jwksUri).pathname, { body: JSON.stringify({ keys: entries }) }),
      confirmClientRefusal: (path, kind, status) => {
        // Called only after the test's anchored client refusal assertion. Setup failures have no qualifying request.
        const matches = requests.filter(r => r.path === path && r.requestEnded && (
          kind === "status" ? status !== undefined && status >= 300 && r.responseStatus === status
            : kind === "body-cap" ? r.responseStatus === 200 && r.responseBodyBytes !== null && r.responseBodyBytes > CAP
              : r.responseStatus === 200 && r.responseDelayMs !== null && r.responseDelayMs >= 10_000));
        expect(matches).toHaveLength(1);
        confirmedRefusals.set(matches[0]!.id, kind);
      },
      verify: (value = token(issuer), patch = {}) => verifyJwtIdToken({
        token: value, issuer, audience: CLIENT, jwksUri, nonce: NONCE, nowMs: NOW * 1000, ...patch
      })
    };
    fixture.jwks([publicJwk()]);
    await body(fixture);
  } catch (error) { bodyFailed = true; originalError = error; }
  finally {
    try {
      if (listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await Promise.all(socketClosePromises);
      if (listening && (!closed || server.listening || sockets.size !== 0)) throw new Error("owned HTTP server closure uncertain");
    } catch (error) { addCleanupError(error); }
    try {
      // Recheck after natural close/socket drain, including events emitted during cleanup.
      for (const error of transportErrors) {
        const request = requests.find(r => r.id === error.requestId);
        const confirmedRefusal = error.requestId === null ? null : confirmedRefusals.get(error.requestId) ?? null;
        const bound = request !== undefined && error.paths.length === 1 && error.paths[0] === request.path
          && error.connectionId === request.connectionId && request.connectionId > 0;
        const peerReset = error.code === "ECONNRESET" && ["aborted", "read ECONNRESET", "write ECONNRESET"].includes(error.message);
        const peerWritePipe = (error.scope === "response" || error.scope === "socket") && error.code === "EPIPE" && error.message === "write EPIPE";
        transportErrorClassifications.push({ ...error, confirmedRefusal,
          expected: bound && confirmedRefusal !== null && (peerReset || peerWritePipe) });
      }
      expect(handlerErrors).toEqual([]);
      expect(transportErrorClassifications.filter(error => !error.expected)).toEqual([]);
    } catch (error) { addCleanupError(error); }
    if (previousOptIn === undefined) delete process.env[OPT_IN]; else process.env[OPT_IN] = previousOptIn;
    const failed = bodyFailed || cleanupFailed;
    try {
      // No JWTs, signing keys, authorization headers or response secrets are persisted.
      const evidence = {
        schema: "amc-p207-local-oidc/2", label, synthetic: true, issuer: fixture?.issuer,
        requests: requests.map(({ headers, body: _body, ...request }) => ({ ...request,
          headers: { accept: headers.accept, contentType: headers["content-type"], contentLength: headers["content-length"] } })),
        observations, handlerErrors, transportErrors, transportErrorClassifications,
        lifecycle: { inProcessServer: true, closed, listening: server.listening, openSockets: sockets.size, connectionCount,
          childProcessCreated: false, signalsSent: false, exactOptInRestored: process.env[OPT_IN] === previousOptIn },
        failed, originalError: originalError instanceof Error ? { name: originalError.name, message: originalError.message, stack: originalError.stack } : null,
        cleanupError: cleanupError instanceof Error ? { name: cleanupError.name, message: cleanupError.message, stack: cleanupError.stack } : null
      };
      const evidenceFile = join(root, "observations", "public-evidence.json");
      writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      if (failed || retain) console.log(`AMC_P207_PUBLIC_EVIDENCE ${evidenceFile}`);
      else rmSync(root, { recursive: true });
    } catch (error) {
      console.log(`AMC_P207_RETAINED_ROOT ${root}`);
      cleanupError = cleanupFailed ? new AggregateError([cleanupError, error], "HTTP closure and observation cleanup failed") : error;
      cleanupFailed = true;
    }
  }
  if (bodyFailed && cleanupFailed) throw new AggregateError([originalError, cleanupError], "OIDC test body and owned cleanup failed");
  if (bodyFailed) throw originalError;
  if (cleanupFailed) throw cleanupError;
}
const refusal = (error: string) => ({ ok: false, error });

describe("independent OIDC JWT verifier: genuine synthetic signatures", () => {
  it.each(["RS256", "PS256", "ES256"] as const)("accepts genuine %s with exactly one compatible public key", async alg => {
    await withFixture(`algorithm-${alg}`, async f => {
      f.jwks([publicJwk(alg === "ES256" ? keys().ec : keys().rsa, "key-a", { alg, key_ops: ["verify"] })]);
      const result = await f.verify(token(f.issuer, { alg }));
      expect(result).toEqual({ ok: true, claims: claims(f.issuer) });
      expect(f.requests.map(r => r.path)).toEqual([new URL(f.jwksUri).pathname]);
      f.observations.push({ algorithm: alg, result, requests: f.requests.length });
    }, true);
  });

  it("refuses a genuine wrong-key RS256 signature before accepting any claims", async () => {
    await withFixture("wrong-key-signature", async f => {
      // Same kid and otherwise valid claims; the actual signature is from another private key.
      expect(await f.verify(token(f.issuer, { pair: keys().other }))).toEqual(refusal("id_token signature invalid"));
      expect(f.requests).toHaveLength(1);
    });
  });
  it("refuses a flipped signature without a second same-kid refresh", async () => {
    await withFixture("flipped-signature", async f => {
      expect((await f.verify()).ok).toBe(true);
      expect(await f.verify(corruptSignature(token(f.issuer)))).toEqual(refusal("id_token signature invalid"));
      expect(f.requests).toHaveLength(1);
    });
  });
  it("refuses a genuinely signed token missing exp independently of all other claim failures", async () => {
    await withFixture("missing-exp", async f => {
      expect(await f.verify(token(f.issuer, { rawClaims: JSON.stringify(withoutClaim(f.issuer, "exp")) })))
        .toEqual(refusal("id_token missing exp"));
      expect(f.requests).toHaveLength(1);
    });
  });

  const claimCases: { name: string; patch?: Json; omit?: string; nonfinite?: string; verify?: Partial<ParametersOfVerify>; error: string }[] = [
    { name: "null exp", patch: { exp: null }, error: "id_token missing exp" },
    { name: "string exp", patch: { exp: String(NOW + 600) }, error: "id_token missing exp" },
    { name: "raw numeric overflow exp", nonfinite: "exp", error: "id_token missing exp" },
    { name: "missing iat", omit: "iat", error: "id_token missing iat" },
    { name: "null iat", patch: { iat: null }, error: "id_token missing iat" },
    { name: "raw numeric overflow iat", nonfinite: "iat", error: "id_token missing iat" },
    { name: "expiry at zero-skew boundary", patch: { exp: NOW }, verify: { clockSkewSeconds: 0 }, error: "id_token expired" },
    { name: "expiry at default-skew boundary", patch: { exp: NOW - 120 }, error: "id_token expired" },
    { name: "expiry at clamped upper-skew boundary", patch: { exp: NOW - 300 }, verify: { clockSkewSeconds: 900 }, error: "id_token expired" },
    { name: "negative skew clamps to zero", patch: { exp: NOW }, verify: { clockSkewSeconds: -1 }, error: "id_token expired" },
    { name: "future iat beyond zero skew", patch: { iat: NOW + 1 }, verify: { clockSkewSeconds: 0 }, error: "id_token iat invalid" },
    { name: "future iat beyond default skew", patch: { iat: NOW + 121 }, error: "id_token iat invalid" },
    { name: "iat older than ten minutes with zero skew", patch: { iat: NOW - 601 }, verify: { clockSkewSeconds: 0 }, error: "id_token iat invalid" },
    { name: "iat beyond ten-minute plus default-skew window", patch: { iat: NOW - 721 }, error: "id_token iat invalid" },
    { name: "future nbf", patch: { nbf: NOW + 121 }, error: "id_token not yet valid" },
    { name: "null nbf", patch: { nbf: null }, error: "id_token not yet valid" },
    { name: "string nbf", patch: { nbf: String(NOW) }, error: "id_token not yet valid" },
    { name: "raw numeric overflow nbf", nonfinite: "nbf", error: "id_token not yet valid" },
    { name: "issuer differs by slash", patch: { iss: "different" }, error: "issuer mismatch" },
    { name: "missing audience", omit: "aud", error: "audience mismatch" },
    { name: "empty audience list", patch: { aud: [] }, error: "audience mismatch" },
    { name: "mixed audience list", patch: { aud: [CLIENT, 1] }, error: "audience mismatch" },
    { name: "wrong audience", patch: { aud: "another-client" }, error: "audience mismatch" },
    { name: "empty expected audience", verify: { audience: "" }, error: "audience mismatch" },
    { name: "several audiences without azp", patch: { aud: [CLIENT, "other"] }, error: "authorized party mismatch" },
    { name: "several audiences with wrong azp", patch: { aud: [CLIENT, "other"], azp: "other" }, error: "authorized party mismatch" },
    { name: "single audience with wrong supplied azp", patch: { azp: "other" }, error: "authorized party mismatch" },
    { name: "duplicate audiences without azp", patch: { aud: [CLIENT, CLIENT] }, error: "authorized party mismatch" },
    { name: "missing subject", omit: "sub", error: "id_token missing subject" },
    { name: "empty subject", patch: { sub: "" }, error: "id_token missing subject" },
    { name: "numeric subject", patch: { sub: 1 }, error: "id_token missing subject" },
    { name: "missing nonce", omit: "nonce", error: "nonce mismatch" },
    { name: "wrong nonce", patch: { nonce: "another-nonce" }, error: "nonce mismatch" },
    { name: "empty expected nonce", verify: { nonce: "" }, error: "nonce mismatch" },
    { name: "nonfinite requested skew", verify: { clockSkewSeconds: Number.NaN }, error: "invalid jwt time" },
    { name: "infinite requested skew", verify: { clockSkewSeconds: Infinity }, error: "invalid jwt time" },
    { name: "nonfinite supplied claims clock", verify: { nowMs: Number.NaN }, error: "invalid jwt time" },
    { name: "infinite supplied claims clock", verify: { nowMs: Infinity }, error: "invalid jwt time" }
  ];
  it.each(claimCases)("rejects signed $name with its specific diagnostic", async c => {
    await withFixture(`claim-${c.name}`, async f => {
      const patch = c.name === "issuer differs by slash" ? { iss: `${f.issuer}/` } : c.patch;
      const rawClaims = c.omit ? JSON.stringify(withoutClaim(f.issuer, c.omit)) : c.nonfinite ? nonfiniteClaim(f.issuer, c.nonfinite) : undefined;
      expect(await f.verify(token(f.issuer, { claims: patch, rawClaims }), c.verify)).toEqual(refusal(c.error));
      expect(f.requests).toHaveLength(1);
    });
  });
  const allowedTimes: { name: string; patch: Json; skew?: number }[] = [
    { name: "optional nbf absent", patch: {} },
    { name: "expiry one second ahead at zero skew", patch: { exp: NOW + 1 }, skew: 0 },
    { name: "expiry just inside default skew", patch: { exp: NOW - 119 } },
    { name: "expiry just inside clamped skew", patch: { exp: NOW - 299 }, skew: 900 },
    { name: "iat at future default boundary", patch: { iat: NOW + 120 } },
    { name: "iat at oldest default boundary", patch: { iat: NOW - 720 } },
    { name: "iat exactly ten minutes old with zero skew", patch: { iat: NOW - 600 }, skew: 0 },
    { name: "nbf at default boundary", patch: { nbf: NOW + 120 } },
    { name: "fractional finite time", patch: { exp: NOW + 0.5, iat: NOW + 0.25 }, skew: 0.25 },
    { name: "several audiences with exact azp", patch: { aud: ["other", CLIENT], azp: CLIENT } },
    { name: "single audience array", patch: { aud: [CLIENT] } }
  ];
  it.each(allowedTimes)("accepts signed $name", async c => {
    await withFixture(`allowed-${c.name}`, async f => {
      expect(await f.verify(token(f.issuer, { claims: c.patch }), { clockSkewSeconds: c.skew }))
        .toEqual({ ok: true, claims: claims(f.issuer, c.patch) });
      expect(f.requests).toHaveLength(1);
    });
  });

  const keyCases: { name: string; entries: () => Json[]; noKid?: boolean; pair?: () => Pair }[] = [
    { name: "OKP with RS256", entries: () => [publicJwk(keys().ed)] },
    { name: "encryption use", entries: () => [publicJwk(undefined, "key-a", { use: "enc" })] },
    { name: "algorithm mismatch", entries: () => [publicJwk(undefined, "key-a", { alg: "PS256" })] },
    { name: "empty key operations", entries: () => [publicJwk(undefined, "key-a", { key_ops: [] })] },
    { name: "extra signing operation", entries: () => [publicJwk(undefined, "key-a", { key_ops: ["verify", "sign"] })] },
    { name: "nonarray key operations", entries: () => [publicJwk(undefined, "key-a", { key_ops: "verify" })] },
    { name: "private component field present", entries: () => [publicJwk(undefined, "key-a", { d: null })] },
    { name: "noncanonical modulus", entries: () => [publicJwk(undefined, "key-a", { n: "AA=" })] },
    { name: "weak RSA modulus", entries: () => [publicJwk(keys().weak)], pair: () => keys().weak },
    { name: "duplicate compatible kid", entries: () => [publicJwk(), publicJwk()] },
    { name: "two compatible keys without token kid", entries: () => [publicJwk(), publicJwk(keys().other, "key-b")], noKid: true },
    { name: "invalid JWK kid without token kid", entries: () => [publicJwk(undefined, "", {})], noKid: true }
  ];
  it.each(keyCases)("refuses $name without selecting an arbitrary key", async c => {
    await withFixture(`key-${c.name}`, async f => {
      f.jwks(c.entries());
      expect(await f.verify(token(f.issuer, { pair: c.pair?.(), header: c.noKid ? { kid: undefined } : {} }))).toEqual(refusal("no matching jwk"));
      expect(f.requests).toHaveLength(1);
    });
  });
  it("accepts no token kid only with one compatible signing key", async () => {
    await withFixture("single-key-no-kid", async f => {
      f.jwks([publicJwk(undefined, "key-a", { use: undefined, alg: undefined })]);
      expect((await f.verify(token(f.issuer, { header: { kid: undefined } }))).ok).toBe(true);
      expect(f.requests).toHaveLength(1);
    });
  });
  it.each([
    { name: "wrong EC curve", key: () => publicJwk(keys().otherCurve) },
    { name: "short EC coordinate", key: () => publicJwk(keys().ec, "key-a", { x: b64(Buffer.alloc(31)) }) }
  ])("refuses ES256 $name", async c => {
    await withFixture(c.name, async f => {
      f.jwks([c.key()]);
      expect(await f.verify(token(f.issuer, { alg: "ES256" }))).toEqual(refusal("no matching jwk"));
      expect(f.requests).toHaveLength(1);
    });
  });
  it.each(["none", "HS256", "EdDSA"] as const)("refuses unsupported %s before fetching any JWK", async alg => {
    await withFixture(`unsupported-${alg}`, async f => {
      expect(await f.verify(token(f.issuer, { alg }))).toEqual(refusal("unsupported jwt alg"));
      expect(f.requests).toHaveLength(0);
      expect(f.connections()).toBe(0);
    });
  });
  it.each([
    { name: "critical header", header: { crit: [] }, error: "invalid jwt format" },
    { name: "empty token kid", header: { kid: "" }, error: "invalid jwt kid" },
    { name: "numeric token kid", header: { kid: 1 }, error: "invalid jwt kid" }
  ])("refuses $name before fetching", async c => {
    await withFixture(c.name, async f => {
      expect(await f.verify(token(f.issuer, { header: c.header }))).toEqual(refusal(c.error));
      expect(f.requests).toHaveLength(0);
    });
  });
  it.each([
    { name: "two parts", value: (_f: Fixture) => "AA.AA", error: "invalid jwt format" },
    { name: "empty part", value: (_f: Fixture) => "AA..AA", error: "invalid jwt format" },
    { name: "extra part", value: (_f: Fixture) => "AA.AA.AA.AA", error: "invalid jwt format" },
    { name: "token over one MiB", value: (_f: Fixture) => "x".repeat(CAP + 1), error: "invalid jwt format" },
    { name: "padded header", value: (f: Fixture) => `e30=.${b64(JSON.stringify(claims(f.issuer)))}.AA`, error: "id_token verification failed" },
    { name: "noncanonical header", value: (f: Fixture) => `Zh.${b64(JSON.stringify(claims(f.issuer)))}.AA`, error: "id_token verification failed" },
    { name: "invalid UTF8 header", value: (f: Fixture) => token(f.issuer, { rawHeader: Buffer.from([255]) }), error: "id_token verification failed" },
    { name: "invalid UTF8 claims", value: (f: Fixture) => token(f.issuer, { rawClaims: Buffer.from([255]) }), error: "id_token verification failed" },
    { name: "array claims", value: (f: Fixture) => token(f.issuer, { rawClaims: "[]" }), error: "invalid jwt format" },
    { name: "null header", value: (f: Fixture) => token(f.issuer, { rawHeader: "null" }), error: "invalid jwt format" },
    { name: "malformed signature base64", value: (f: Fixture) => `${token(f.issuer).split(".").slice(0, 2).join(".")}.=`, error: "id_token verification failed" }
  ])("refuses malformed $name without a key request", async c => {
    await withFixture(c.name, async f => {
      expect(await f.verify(c.value(f))).toEqual(refusal(c.error));
      expect(f.requests).toHaveLength(0);
    });
  });
});

describe("real JWKS cache and rotation", () => {
  it("refreshes one unknown kid then suppresses another refresh on the real 60-second cache clock", async () => {
    await withFixture("rotation-real-clock", async f => {
      const started = Date.now();
      expect((await f.verify()).ok).toBe(true);
      expect(f.requests).toHaveLength(1);
      f.jwks([publicJwk(), publicJwk(keys().other, "key-b")]);
      expect((await f.verify(token(f.issuer, { pair: keys().other, header: { kid: "key-b" } }))).ok).toBe(true);
      expect(f.requests).toHaveLength(2);
      f.jwks([publicJwk(), publicJwk(keys().other, "key-c")]);
      // Advancing ONLY claims.nowMs must not advance the real cache clock.
      expect(await f.verify(token(f.issuer, { pair: keys().other, header: { kid: "key-c" }, claims: { iat: NOW + 86400, exp: NOW + 87000 } }),
        { nowMs: (NOW + 86400) * 1000 })).toEqual(refusal("no matching jwk"));
      expect(f.requests).toHaveLength(2);
      expect(Date.now() - started).toBeLessThan(60_000);
      expect((await f.verify()).ok).toBe(true);
      expect(f.requests).toHaveLength(2);
      f.observations.push({ initialFetches: 1, totalAfterRotationAndSuppressedUnknown: f.requests.length,
        actualCacheElapsedMs: Date.now() - started, claimClockAdvancedSeconds: 86400 });
    }, true);
  });
  it("retains known good keys after a real failed refresh while refusing unknown keys", async () => {
    await withFixture("failed-refresh", async f => {
      expect((await f.verify()).ok).toBe(true);
      f.replies.set(new URL(f.jwksUri).pathname, { status: 503, body: "owned-provider-detail-must-not-escape" });
      expect(await f.verify(token(f.issuer, { pair: keys().other, header: { kid: "key-b" } }))).toEqual(refusal("no matching jwk"));
      expect(f.requests).toHaveLength(2);
      f.confirmClientRefusal(new URL(f.jwksUri).pathname, "status", 503);
      expect((await f.verify()).ok).toBe(true);
      expect(await f.verify(token(f.issuer, { header: { kid: "key-c" } }))).toEqual(refusal("no matching jwk"));
      expect(f.requests).toHaveLength(2);
      f.observations.push({ retainedKnownKey: true, unknownKeysRefused: true, requests: f.requests.length });
    }, true);
  });
  it.each([{}, { keys: [] }, { keys: [null] }, { keys: [1] }, { keys: [[]] }])("refuses a fresh malformed JWKS %j", async jwks => {
    await withFixture("malformed-jwks", async f => {
      f.replies.set(new URL(f.jwksUri).pathname, { body: JSON.stringify(jwks) });
      expect(await f.verify()).toEqual(refusal("id_token verification failed"));
      expect(f.requests).toHaveLength(1);
    });
  });
  it("revalidates an HTTP JWKS URI even when its known key is cached", async () => {
    await withFixture("cached-jwks-opt-in", async f => {
      const issuer = "https://synthetic-issuer.example"; // Compared only; it is never requested.
      const value = token(issuer);
      expect((await f.verify(value, { issuer })).ok).toBe(true);
      delete process.env[OPT_IN];
      expect(await f.verify(value, { issuer })).toEqual(refusal("id_token verification failed"));
      expect(f.requests).toHaveLength(1);
      process.env[OPT_IN] = "1";
      expect((await f.verify(value, { issuer })).ok).toBe(true);
      expect(f.requests).toHaveLength(1);
    });
  });
  it("refuses a loopback issuer without opt-in before any HTTP request", async () => {
    await withFixture("issuer-opt-in", async f => {
      delete process.env[OPT_IN];
      expect(await f.verify()).toEqual(refusal("id_token verification failed"));
      expect(f.requests).toHaveLength(0);
      expect(f.connections()).toBe(0);
    });
  });
});

describe("bounded real OIDC JSON transport and discovery", () => {
  it("sends the actual form method, headers and UTF8 byte length without global fetch", async () => {
    await withFixture("real-form-post", async f => {
      const path = `${new URL(f.issuer).pathname}/token`;
      f.replies.set(path, { body: '{"fixture":"response"}' });
      const form = new URLSearchParams({ fixture: "synthetic-é & value" });
      expect(await oidcFetchJson(`${f.issuer}/token`, { method: "POST", form })).toEqual({ fixture: "response" });
      expect(f.requests).toHaveLength(1);
      expect(f.requests[0]).toMatchObject({ method: "POST", path, body: form.toString(), bodyBytes: Buffer.byteLength(form.toString()) });
      expect(f.requests[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
      expect(f.requests[0]!.headers["content-length"]).toBe(String(Buffer.byteLength(form.toString())));
      expect(f.requests[0]!.headers.accept).toBe("application/json");
    });
  });
  it("refuses a real redirect without contacting its owned destination", async () => {
    await withFixture("redirect", async f => {
      f.replies.set("/redirect", { status: 302, body: "{}", headers: { location: `${f.issuer}/never-follow` } });
      f.replies.set(`${new URL(f.issuer).pathname}/never-follow`, { body: '{"followed":true}' });
      await expect(oidcFetchJson(new URL("/redirect", f.issuer).href)).rejects.toThrow("OIDC redirect refused");
      expect(f.requests.map(r => r.path)).toEqual(["/redirect"]);
      f.confirmClientRefusal("/redirect", "status", 302);
    });
  });
  it("sanitizes a real non-success endpoint response", async () => {
    await withFixture("http-error", async f => {
      f.replies.set("/error", { status: 500, body: "owned-error-detail-not-a-public-diagnostic" });
      await expect(oidcFetchJson(new URL("/error", f.issuer).href)).rejects.toThrow(/^OIDC endpoint request failed$/);
      expect(f.requests.map(r => r.path)).toEqual(["/error"]);
      f.confirmClientRefusal("/error", "status", 500);
    });
  });
  it.each([
    { name: "invalid JSON", body: "{" }, { name: "array", body: "[]" },
    { name: "null", body: "null" }, { name: "string", body: '"object required"' },
    { name: "fatal UTF8", body: Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]) }
  ])("refuses a real $name response", async c => {
    await withFixture(c.name, async f => {
      f.replies.set("/invalid", { body: c.body });
      await expect(oidcFetchJson(new URL("/invalid", f.issuer).href)).rejects.toThrow(/^OIDC response invalid$/);
      expect(f.requests).toHaveLength(1);
    });
  });
  it.each([0, 1])("enforces the literal one-MiB response boundary plus %i byte", async excess => {
    await withFixture(`body-cap-${excess}`, async f => {
      const emptyBytes = Buffer.byteLength(JSON.stringify({ padding: "" }));
      const padding = "x".repeat(CAP + excess - emptyBytes);
      const bytes = JSON.stringify({ padding });
      expect(Buffer.byteLength(bytes)).toBe(CAP + excess);
      f.replies.set("/cap", { body: bytes });
      const response = oidcFetchJson(new URL("/cap", f.issuer).href);
      if (excess === 0) expect(await response).toEqual({ padding });
      else await expect(response).rejects.toThrow(/^OIDC response too large$/);
      expect(f.requests).toHaveLength(1);
      if (excess === 1) f.confirmClientRefusal("/cap", "body-cap");
      f.observations.push({ actualResponseBytes: Buffer.byteLength(bytes), expectedCap: CAP, excess });
    });
  });
  it("enforces the real ten-second request timeout and naturally closes its owned endpoint", async () => {
    await withFixture("real-ten-second-timeout", async f => {
      f.replies.set("/slow", { body: "{}", delayMs: 12_000 });
      const start = performance.now();
      await expect(oidcFetchJson(new URL("/slow", f.issuer).href)).rejects.toThrow(/^OIDC request timed out$/);
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeGreaterThanOrEqual(9_000);
      expect(f.requests).toHaveLength(1);
      f.confirmClientRefusal("/slow", "timeout");
      f.observations.push({ actualElapsedMs: elapsedMs, endpointFiniteFallbackMs: 12_000 });
    }, true);
  });
  it.each([
    { url: "not a URL", error: "OIDC URL invalid" },
    { url: "http://127.0.0.1.attacker.invalid/", error: "OIDC HTTPS required" },
    { url: "http://localhost/", error: "OIDC HTTPS required" },
    { url: "http://127.1/", error: "OIDC HTTPS required" },
    { url: "ftp://127.0.0.1/", error: "OIDC HTTPS required" },
    { url: "https://user:pass@example.invalid/", error: "OIDC URL credentials or fragment refused" },
    { url: "https://@example.invalid/", error: "OIDC URL credentials or fragment refused" },
    { url: "https://example.invalid/#", error: "OIDC URL credentials or fragment refused" },
    { url: "https://10.0.0.1/", error: "OIDC private destination refused" },
    { url: "https://169.254.169.254/", error: "OIDC private destination refused" },
    { url: "https://192.0.2.1/", error: "OIDC private destination refused" },
    { url: "https://[::ffff:127.0.0.1]/", error: "OIDC private destination refused" }
  ])("refuses URL $url without a request", async c => {
    await withFixture(`url-${c.url}`, f => {
      expect(() => validateOidcUrl(c.url)).toThrow(c.error);
      expect(f.requests).toHaveLength(0);
      expect(f.connections()).toBe(0);
    });
  });
  it("admits only exact opt-in literals and restores the prior value", async () => {
    await withFixture("strict-loopback-opt-in", f => {
      expect(validateOidcUrl(f.jwksUri).href).toBe(f.jwksUri);
      expect(validateOidcUrl("http://[::1]/fixture").hostname).toBe("[::1]");
      for (const value of [undefined, "0", "true", "01"]) {
        if (value === undefined) delete process.env[OPT_IN]; else process.env[OPT_IN] = value;
        expect(() => validateOidcUrl(f.jwksUri)).toThrow("OIDC HTTPS required");
      }
      expect(f.requests).toHaveLength(0);
    });
  });
  it("resolves localhost inward and refuses before connecting to the owned server", async () => {
    await withFixture("dns-localhost-private", async f => {
      const target = new URL(f.issuer);
      target.protocol = "https:";
      target.hostname = "localhost";
      await expect(oidcFetchJson(target.href)).rejects.toThrow(/^OIDC private destination refused$/);
      expect(f.requests).toHaveLength(0);
      expect(f.connections()).toBe(0);
    });
  });

  function discovery(f: Fixture, patch: Json = {}): Json {
    return { issuer: f.issuer, authorization_endpoint: `${f.issuer}/authorize`, token_endpoint: `${f.issuer}/token`, jwks_uri: f.jwksUri, ...patch };
  }
  it("fetches exact issuer-bound discovery on each call and preserves the endpoint values", async () => {
    await withFixture("discovery-refetch", async f => {
      const path = `${new URL(f.issuer).pathname}/.well-known/openid-configuration`;
      f.replies.set(path, { body: JSON.stringify(discovery(f)) });
      const expected = { authorizationEndpoint: `${f.issuer}/authorize`, tokenEndpoint: `${f.issuer}/token`, jwksUri: f.jwksUri };
      expect(await discoverOidcWellKnown(f.issuer)).toEqual(expected);
      expect(await discoverOidcWellKnown(f.issuer)).toEqual(expected);
      expect(f.requests.map(r => r.path)).toEqual([path, path]);
    });
  });
  it("refuses discovery issuer mismatch from an actual local response", async () => {
    await withFixture("discovery-issuer", async f => {
      const path = `${new URL(f.issuer).pathname}/.well-known/openid-configuration`;
      f.replies.set(path, { body: JSON.stringify(discovery(f, { issuer: `${f.issuer}/` })) });
      await expect(discoverOidcWellKnown(f.issuer)).rejects.toThrow(/^OIDC discovery issuer mismatch$/);
      expect(f.requests.map(r => r.path)).toEqual([path]);
    });
  });
  it.each([
    { name: "missing endpoint", patch: { token_endpoint: null }, error: "OIDC discovery invalid" },
    { name: "private endpoint", patch: { jwks_uri: "https://10.0.0.1/keys" }, error: "OIDC private destination refused" },
    { name: "HTTP named endpoint", patch: { token_endpoint: "http://localhost/token" }, error: "OIDC HTTPS required" },
    { name: "endpoint credentials", patch: { authorization_endpoint: "https://user:pass@example.invalid/authorize" }, error: "OIDC URL credentials or fragment refused" },
    { name: "endpoint fragment", patch: { jwks_uri: "https://example.invalid/jwks#fragment" }, error: "OIDC URL credentials or fragment refused" }
  ])("refuses discovery $name without requesting the returned endpoint", async c => {
    await withFixture(c.name, async f => {
      const path = `${new URL(f.issuer).pathname}/.well-known/openid-configuration`;
      f.replies.set(path, { body: JSON.stringify(discovery(f, c.patch)) });
      await expect(discoverOidcWellKnown(f.issuer)).rejects.toThrow(c.error);
      expect(f.requests.map(r => r.path)).toEqual([path]);
    });
  });
});
