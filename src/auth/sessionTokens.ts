import { randomUUID, sign } from "node:crypto";
import { z } from "zod";
import { getSigningKey } from "../crypto/keys.js";
import { verifySessionCredentialSignature } from "./sessionCredentialSignature.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
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
  return bytes.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  if (typeof value !== "string") throw new TypeError("base64url input must be a string");
  return Buffer.from(value, "base64url");
}

type IssueSessionTokenInput = {
  workspace: string;
  userId: string;
  username: string;
  roles: SessionPayload["roles"];
  ttlMs?: number;
};

function prepareSessionToken(params: IssueSessionTokenInput): { payload: SessionPayload; payloadBytes: Buffer } {
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
  return { payload, payloadBytes: Buffer.from(canonicalize(payload), "utf8") };
}

/** Synchronous vault compatibility API. Provider-held session keys refuse; runtime callers use the async API. */
export function issueSessionToken(params: IssueSessionTokenInput): { token: string; payload: SessionPayload } {
  const { payload, payloadBytes } = prepareSessionToken(params);
  const signature = sign(null, payloadBytes, getSigningKey(params.workspace, "session"));
  return { token: `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`, payload };
}

/** The runtime session issuer: the committed session-purpose key signs the exact payload bytes wherever it lives. */
export async function issueSessionTokenAsync(params: IssueSessionTokenInput): Promise<{ token: string; payload: SessionPayload }> {
  const { payload, payloadBytes } = prepareSessionToken(params);
  const signed = await signWithPurposeKey(params.workspace, "session", payloadBytes);
  return { token: `${toBase64Url(payloadBytes)}.${toBase64Url(signed.signature)}`, payload };
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
    const valid = verifySessionCredentialSignature(params.workspace, payloadBytes, signature);
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
