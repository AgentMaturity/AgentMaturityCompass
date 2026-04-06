import { createPublicKey, verify } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface JwtClaims {
  [key: string]: unknown;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

function toPemFromJwk(jwk: Record<string, unknown>): string {
  return createPublicKey({
    key: jwk as any,
    format: "jwk"
  })
    .export({ format: "pem", type: "spki" })
    .toString();
}

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = client(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: { accept: "application/json" }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          try {
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              rejectPromise(new Error(`HTTP ${status}`));
              return;
            }
            const raw = Buffer.concat(chunks).toString("utf8");
            resolvePromise(JSON.parse(raw) as unknown);
          } catch (error) {
            rejectPromise(error);
          }
        });
      }
    );
    req.on("error", rejectPromise);
    req.end();
  });
}

const jwksCache = new Map<string, { expiresTs: number; keys: Array<Record<string, unknown>> }>();

async function fetchJwks(jwksUri: string): Promise<Array<Record<string, unknown>>> {
  const now = Date.now();
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresTs > now) {
    return cached.keys;
  }
  const parsed = (await httpGetJson(jwksUri)) as { keys?: unknown };
  const keys = Array.isArray(parsed.keys) ? (parsed.keys as Array<Record<string, unknown>>) : [];
  jwksCache.set(jwksUri, {
    expiresTs: now + 5 * 60_000,
    keys
  });
  return keys;
}

export async function verifyJwtIdToken(params: {
  token: string;
  issuer: string;
  audience: string;
  jwksUri: string;
  nonce: string;
  clockSkewSeconds?: number;
}): Promise<{ ok: true; claims: JwtClaims } | { ok: false; error: string }> {
  try {
    const [headerPart, payloadPart, signaturePart, ...rest] = params.token.split(".");
    if (!headerPart || !payloadPart || !signaturePart || rest.length > 0) {
      return { ok: false, error: "invalid jwt format" };
    }
    const header = JSON.parse(fromBase64Url(headerPart).toString("utf8")) as JwtHeader;
    if (header.alg === "none") {
      return { ok: false, error: "alg none not allowed" };
    }
    if (!["RS256", "EdDSA"].includes(header.alg)) {
      return { ok: false, error: `unsupported jwt alg: ${header.alg}` };
    }
    const claims = JSON.parse(fromBase64Url(payloadPart).toString("utf8")) as JwtClaims;
    const signature = fromBase64Url(signaturePart);
    const signedInput = Buffer.from(`${headerPart}.${payloadPart}`, "utf8");

    const jwks = await fetchJwks(params.jwksUri);
    const candidate = jwks.find((key) => {
      const kid = typeof key.kid === "string" ? key.kid : null;
      if (header.kid && kid) {
        return header.kid === kid;
      }
      return true;
    });
    if (!candidate) {
      return { ok: false, error: "no matching jwk" };
    }
    const pubPem = toPemFromJwk(candidate);
    const verified = verify(header.alg === "RS256" ? "RSA-SHA256" : null, signedInput, pubPem, signature);
    if (!verified) {
      return { ok: false, error: "id_token signature invalid" };
    }

    const skew = Math.max(0, params.clockSkewSeconds ?? 120);
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof claims.exp === "number" && nowSec > claims.exp + skew) {
      return { ok: false, error: "id_token expired" };
    }
    if (typeof claims.nbf === "number" && nowSec + skew < claims.nbf) {
      return { ok: false, error: "id_token not yet valid" };
    }
    if (claims.iss !== params.issuer) {
      return { ok: false, error: "issuer mismatch" };
    }
    const aud = claims.aud;
    const audOk = Array.isArray(aud) ? aud.includes(params.audience) : aud === params.audience;
    if (!audOk) {
      return { ok: false, error: "audience mismatch" };
    }
    if (claims.nonce !== params.nonce) {
      return { ok: false, error: "nonce mismatch" };
    }
    return { ok: true, claims };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function discoverOidcWellKnown(issuer: string): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}> {
  const issuerUrl = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
  const raw = (await httpGetJson(`${issuerUrl}/.well-known/openid-configuration`)) as Record<string, unknown>;
  const authorizationEndpoint = typeof raw.authorization_endpoint === "string" ? raw.authorization_endpoint : "";
  const tokenEndpoint = typeof raw.token_endpoint === "string" ? raw.token_endpoint : "";
  const jwksUri = typeof raw.jwks_uri === "string" ? raw.jwks_uri : "";
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new Error("invalid OIDC discovery document");
  }
  return { authorizationEndpoint, tokenEndpoint, jwksUri };
}
