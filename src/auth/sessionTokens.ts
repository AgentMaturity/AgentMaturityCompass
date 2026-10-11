import { randomUUID, sign, verify } from "node:crypto";
import { z } from "zod";
import { getSigningKey, getPublicKeyHistory } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import { userRoleSchema } from "./userSchema.js";

const sessionPayloadSchema = z.object({
  v: z.literal(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  roles: z.array(userRoleSchema).min(1),
  issuedTs: z.number().int(),
  expiresTs: z.number().int(),
  nonce: z.string().min(8)
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export function issueSessionToken(params: {
  workspace: string;
  userId: string;
  username: string;
  roles: SessionPayload["roles"];
  ttlMs?: number;
}): { token: string; payload: SessionPayload } {
  const now = Date.now();
  const payload = sessionPayloadSchema.parse({
    v: 1,
    userId: params.userId,
    username: params.username,
    roles: params.roles,
    issuedTs: now,
    expiresTs: now + Math.max(5 * 60_000, params.ttlMs ?? 8 * 60 * 60_000),
    nonce: randomUUID().replace(/-/g, "")
  });
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signature = sign(null, payloadBytes, getSigningKey(params.workspace, "session"));
  return {
    token: `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`,
    payload
  };
}

export function verifySessionToken(params: {
  workspace: string;
  token: string;
}): {
  ok: boolean;
  payload: SessionPayload | null;
  error?: string;
} {
  try {
    const [payloadPart, sigPart, ...extra] = params.token.split(".");
    if (!payloadPart || !sigPart || extra.length > 0) {
      return { ok: false, payload: null, error: "invalid session token format" };
    }
    const payloadBytes = fromBase64Url(payloadPart);
    const signature = fromBase64Url(sigPart);
    const payload = sessionPayloadSchema.parse(JSON.parse(payloadBytes.toString("utf8")) as unknown);
    const valid = getPublicKeyHistory(params.workspace, "session").some((pub) => verify(null, payloadBytes, pub, signature));
    if (!valid) {
      return { ok: false, payload: null, error: "session signature verification failed" };
    }
    if (Date.now() > payload.expiresTs) {
      return { ok: false, payload, error: "session expired" };
    }
    return {
      ok: true,
      payload
    };
  } catch (error) {
    return { ok: false, payload: null, error: String(error) };
  }
}

export function parseCookieHeader(rawCookieHeader: string | undefined, name: string): string | null {
  if (!rawCookieHeader) {
    return null;
  }
  const cookies = rawCookieHeader.split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
