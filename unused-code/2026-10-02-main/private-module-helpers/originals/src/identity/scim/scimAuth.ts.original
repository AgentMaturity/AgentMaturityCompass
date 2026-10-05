import type { IncomingMessage } from "node:http";
import type { IdentityConfig } from "../identityConfig.js";
import { validateScimBearerToken } from "../identityConfig.js";

export function extractBearerToken(req: IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}

export function verifyScimRequestAuth(params: {
  req: IncomingMessage;
  hostDir: string;
  identityConfig: IdentityConfig;
  isHttps: boolean;
}): { ok: boolean; tokenId: string | null; error?: string } {
  if (!params.identityConfig.identity.scim.enabled) {
    return { ok: false, tokenId: null, error: "SCIM disabled" };
  }
  if (params.identityConfig.identity.scim.auth.requireHttps && !params.isHttps) {
    return { ok: false, tokenId: null, error: "HTTPS required for SCIM" };
  }
  const token = extractBearerToken(params.req);
  if (!token) {
    return { ok: false, tokenId: null, error: "missing SCIM bearer token" };
  }
  const verified = validateScimBearerToken(params.hostDir, token);
  if (!verified.ok || !verified.tokenId) {
    return { ok: false, tokenId: null, error: "invalid SCIM bearer token" };
  }
  return {
    ok: true,
    tokenId: verified.tokenId
  };
}
