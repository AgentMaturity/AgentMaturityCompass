import { constants, createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isNonPublicAddress } from "../../enforce/egressAllowlist.js";

export interface JwtClaims {
  [key: string]: unknown;
  iss?: string; aud?: string | string[]; exp?: number; nbf?: number; iat?: number; nonce?: string;
}
const MAX_BYTES = 1_048_576;
const ALGS = ["RS256", "PS256", "ES256"] as const;
type Alg = (typeof ALGS)[number];
type ObjectJson = Record<string, unknown>;
const objectJson = (value: unknown): value is ObjectJson => value !== null && typeof value === "object" && !Array.isArray(value);
class OidcRequestError extends Error {}

/** Runtime admission only: loading an older signed identity config must remain possible. */
export function validateOidcUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new OidcRequestError("OIDC URL invalid"); }
  const authority = raw.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1] ?? "";
  if (url.username || url.password || authority.includes("@") || raw.includes("#")) throw new OidcRequestError("OIDC URL credentials or fragment refused");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = process.env.AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK === "1"
    && /^https?:\/\/(127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:[/?]|$)/i.test(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new OidcRequestError("OIDC HTTPS required");
  if (isIP(host) && isNonPublicAddress(host) && !loopback) throw new OidcRequestError("OIDC private destination refused");
  return url;
}

/** One bounded, pinned request for discovery, JWKS and the credential-bearing token POST. No redirects. */
export async function oidcFetchJson(raw: string, options: { method?: "GET" | "POST"; form?: URLSearchParams } = {}): Promise<ObjectJson> {
  const signal = AbortSignal.timeout(10_000);
  let onAbort: () => void = () => {};
  const expired = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new OidcRequestError("OIDC request timed out"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const work = async (): Promise<ObjectJson> => {
      const url = validateOidcUrl(raw);
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const loopback = process.env.AMC_IDENTITY_ALLOW_INSECURE_LOOPBACK === "1"
        && /^https?:\/\/(127\.0\.0\.1|\[::1\])(?::[0-9]+)?(?:[/?]|$)/i.test(raw);
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
      if (signal.aborted) throw new OidcRequestError("OIDC request timed out");
      if (addresses.length === 0 || addresses.some(({ address }) => !isIP(address) || (!loopback && isNonPublicAddress(address)))) {
        throw new OidcRequestError("OIDC private destination refused");
      }
      const address = addresses[0]!.address, family = isIP(address);
      const pinned: LookupFunction = (_name, settings, callback) => {
        if (settings.all) callback(null, [{ address, family }]); else callback(null, address, family);
      };
      const body = options.form?.toString();
      const send = url.protocol === "https:" ? httpsRequest : httpRequest;
      return new Promise<ObjectJson>((resolve, reject) => {
        const req = send(url, { method: options.method ?? "GET", signal, agent: false, lookup: pinned,
          headers: { accept: "application/json", ...(body === undefined ? {} : {
            "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(body)) }) } }, response => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            response.destroy();
            reject(new OidcRequestError(status >= 300 && status < 400 ? "OIDC redirect refused" : "OIDC endpoint request failed"));
            return;
          }
          const read = async () => {
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of response as AsyncIterable<Buffer>) {
              bytes += chunk.byteLength;
              if (bytes > MAX_BYTES) throw new OidcRequestError("OIDC response too large");
              chunks.push(chunk);
            }
            let parsed: unknown;
            try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
            catch { throw new OidcRequestError("OIDC response invalid"); }
            if (!objectJson(parsed)) throw new OidcRequestError("OIDC response invalid");
            return parsed;
          };
          read().then(resolve, reject);
        });
        req.once("error", reject);
        req.end(body);
      });
    };
    return await Promise.race([work(), expired]);
  } catch (error) {
    throw error instanceof OidcRequestError ? error : new OidcRequestError("OIDC request failed");
  } finally { signal.removeEventListener("abort", onAbort); }
}

interface JwksEntry {
  keys?: ObjectJson[]; expiresTs: number; refreshAfterTs: number; inFlight?: Promise<ObjectJson[]>;
}
const jwksCache = new Map<string, JwksEntry>();

async function fetchJwks(uri: string, refresh = false): Promise<ObjectJson[]> {
  validateOidcUrl(uri);
  const now = Date.now();
  const entry = jwksCache.get(uri) ?? { expiresTs: 0, refreshAfterTs: 0 };
  if (entry.inFlight) return entry.inFlight;
  if (!refresh && entry.keys && entry.expiresTs > now) return entry.keys;
  if (refresh && entry.refreshAfterTs > now) return entry.keys ?? [];
  if (refresh) entry.refreshAfterTs = now + 60_000;
  const request = async (): Promise<ObjectJson[]> => {
    try {
      const parsed = await oidcFetchJson(uri);
      if (!Array.isArray(parsed.keys) || parsed.keys.length === 0 || !parsed.keys.every(objectJson)) throw new Error("invalid JWKS");
      entry.keys = parsed.keys;
      entry.expiresTs = Date.now() + 5 * 60_000;
      return entry.keys;
    } catch {
      if (entry.keys) return entry.keys; // Retain last good keys; a missing kid still cannot select one.
      throw new OidcRequestError("OIDC signing keys unavailable");
    } finally { entry.inFlight = undefined; }
  };
  entry.inFlight = request();
  jwksCache.set(uri, entry);
  return entry.inFlight;
}

function fromBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("invalid base64url");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("invalid base64url");
  return decoded;
}

function compatibleKey(jwk: ObjectJson, alg: Alg): KeyObject | null {
  try {
    if ((jwk.use !== undefined && jwk.use !== "sig") || (jwk.alg !== undefined && jwk.alg !== alg)
      || (jwk.kid !== undefined && (typeof jwk.kid !== "string" || !jwk.kid)) || jwk.d !== undefined) return null;
    if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== "verify")) return null;
    if (alg === "ES256") {
      if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string"
        || fromBase64Url(jwk.x).length !== 32 || fromBase64Url(jwk.y).length !== 32) return null;
    } else if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string") return null;
    else { fromBase64Url(jwk.n); fromBase64Url(jwk.e); }
    const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    if (alg !== "ES256" && (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)) return null;
    if (alg === "ES256" && key.asymmetricKeyType !== "ec") return null;
    return key;
  } catch { return null; }
}

export async function verifyJwtIdToken(params: {
  token: string; issuer: string; audience: string; jwksUri: string; nonce: string; clockSkewSeconds?: number; nowMs?: number;
}): Promise<{ ok: true; claims: JwtClaims } | { ok: false; error: string }> {
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  try {
    validateOidcUrl(params.issuer);
    if (typeof params.token !== "string" || params.token.length > MAX_BYTES) return fail("invalid jwt format");
    const parts = params.token.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) return fail("invalid jwt format");
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const header: unknown = JSON.parse(decoder.decode(fromBase64Url(headerPart)));
    const claims: unknown = JSON.parse(decoder.decode(fromBase64Url(payloadPart)));
    if (!objectJson(header) || !objectJson(claims) || Object.hasOwn(header, "crit")) return fail("invalid jwt format");
    if (typeof header.alg !== "string" || !(ALGS as readonly string[]).includes(header.alg)) return fail("unsupported jwt alg");
    if (header.kid !== undefined && (typeof header.kid !== "string" || !header.kid)) return fail("invalid jwt kid");
    const alg = header.alg as Alg;
    const signature = fromBase64Url(signaturePart);
    let keys = await fetchJwks(params.jwksUri);
    if (typeof header.kid === "string" && !keys.some(key => key.kid === header.kid)) keys = await fetchJwks(params.jwksUri, true);
    const candidates = keys.flatMap(jwk => {
      if (header.kid !== undefined && jwk.kid !== header.kid) return [];
      const key = compatibleKey(jwk, alg);
      return key ? [key] : [];
    });
    if (candidates.length !== 1) return fail("no matching jwk");
    const key = candidates[0]!;
    const options = alg === "PS256" ? { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }
      : alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" as const } : key;
    if (!verify("sha256", Buffer.from(`${headerPart}.${payloadPart}`), options, signature)) return fail("id_token signature invalid");
    const requestedSkew = params.clockSkewSeconds ?? 120;
    const nowMs = params.nowMs ?? Date.now();
    if (!Number.isFinite(requestedSkew) || !Number.isFinite(nowMs)) return fail("invalid jwt time");
    const skew = Math.min(300, Math.max(0, requestedSkew)), now = nowMs / 1000;
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return fail("id_token missing exp");
    if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) return fail("id_token missing iat");
    if (now >= claims.exp + skew) return fail("id_token expired");
    if (claims.iat > now + skew || claims.iat < now - 600 - skew) return fail("id_token iat invalid");
    if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now + skew)) return fail("id_token not yet valid");
    if (claims.iss !== params.issuer) return fail("issuer mismatch");
    const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
    if (!Array.isArray(audiences) || audiences.length === 0 || audiences.some(aud => typeof aud !== "string" || !aud)
      || !params.audience || !audiences.includes(params.audience)) return fail("audience mismatch");
    if ((claims.azp !== undefined || audiences.length > 1) && claims.azp !== params.audience) return fail("authorized party mismatch");
    if (typeof claims.sub !== "string" || !claims.sub) return fail("id_token missing subject");
    if (typeof params.nonce !== "string" || !params.nonce || claims.nonce !== params.nonce) return fail("nonce mismatch");
    return { ok: true, claims: claims as JwtClaims };
  } catch { return fail("id_token verification failed"); }
}

export async function discoverOidcWellKnown(issuer: string): Promise<{
  authorizationEndpoint: string; tokenEndpoint: string; jwksUri: string;
}> {
  validateOidcUrl(issuer);
  const raw = await oidcFetchJson(`${issuer.endsWith("/") ? issuer.slice(0, -1) : issuer}/.well-known/openid-configuration`);
  if (raw.issuer !== issuer) throw new OidcRequestError("OIDC discovery issuer mismatch");
  if (typeof raw.authorization_endpoint !== "string" || typeof raw.token_endpoint !== "string" || typeof raw.jwks_uri !== "string") {
    throw new OidcRequestError("OIDC discovery invalid");
  }
  for (const endpoint of [raw.authorization_endpoint, raw.token_endpoint, raw.jwks_uri]) validateOidcUrl(endpoint);
  return { authorizationEndpoint: raw.authorization_endpoint, tokenEndpoint: raw.token_endpoint, jwksUri: raw.jwks_uri };
}
