import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { sha256Hex } from "../utils/hash.js";

function normalizeHex(input: string): string {
  return input.trim().toLowerCase();
}

export function buildNotaryAuthSignature(params: {
  secret: string;
  ts: number;
  method: string;
  path: string;
  bodyBytes: Buffer;
}): string {
  const bodySha = sha256Hex(params.bodyBytes);
  const canonical = `${params.ts}.${params.method.toUpperCase()}.${params.path}.${bodySha}`;
  return createHmac("sha256", params.secret).update(canonical).digest("hex");
}

function secureHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(normalizeHex(a), "hex");
  const right = Buffer.from(normalizeHex(b), "hex");
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export interface AuthenticatedNotaryRequest {
  ok: true;
  /** Identity of the authenticated bytes, not the header's textual spelling. */
  replayKey: string;
  /** Inclusive end of the same clock-skew window used during authentication. */
  replayExpiresTs: number;
}

export function createNotaryReplayGuard(maxEntries = 10_000):
  (request: AuthenticatedNotaryRequest) => { ok: true } | { ok: false; reason: string } {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Notary replay capacity must be a positive safe integer");
  }
  const seen = new Map<string, number>();
  return (request) => {
    const now = Date.now();
    for (const [key, expiresTs] of seen) {
      if (expiresTs < now) seen.delete(key);
    }
    if (request.replayExpiresTs < now) return { ok: false, reason: "authentication expired" };
    if (seen.has(request.replayKey)) return { ok: false, reason: "replay detected" };
    // Never evict live authentication to make room: that would admit its replay.
    if (seen.size >= maxEntries) return { ok: false, reason: "replay protection capacity exhausted" };
    seen.set(request.replayKey, request.replayExpiresTs);
    return { ok: true };
  };
}

export function verifyNotaryRequestAuth(params: {
  req: IncomingMessage;
  bodyBytes: Buffer;
  secret: string;
  headerName: string;
  tsHeaderName: string;
  maxClockSkewSeconds: number;
  path: string;
}): AuthenticatedNotaryRequest | { ok: false; reason: string } {
  const sigHeader = params.req.headers[params.headerName.toLowerCase()];
  const tsHeader = params.req.headers[params.tsHeaderName.toLowerCase()];
  if (typeof sigHeader !== "string" || sigHeader.trim().length === 0) {
    return { ok: false, reason: "missing signature header" };
  }
  if (typeof tsHeader !== "string" || tsHeader.trim().length === 0) {
    return { ok: false, reason: "missing timestamp header" };
  }
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid timestamp header" };
  }
  const now = Date.now();
  const skewMs = Math.abs(now - Math.trunc(ts));
  if (skewMs > params.maxClockSkewSeconds * 1000) {
    return { ok: false, reason: "timestamp skew exceeded" };
  }
  const expected = buildNotaryAuthSignature({
    secret: params.secret,
    ts: Math.trunc(ts),
    method: params.req.method ?? "GET",
    path: params.path,
    bodyBytes: params.bodyBytes
  });
  if (!secureHexEqual(expected, sigHeader)) {
    return { ok: false, reason: "signature mismatch" };
  }
  // Use the verified canonical HMAC, not the supplied header. Equivalent hex
  // casing/whitespace (or timestamp spellings) must consume the same admission.
  return {
    ok: true,
    replayKey: `${(params.req.method ?? "GET").toUpperCase()}:${params.path}:${Math.trunc(ts)}:${expected}`,
    replayExpiresTs: Math.trunc(ts) + params.maxClockSkewSeconds * 1000
  };
}
