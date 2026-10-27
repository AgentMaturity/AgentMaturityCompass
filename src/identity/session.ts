import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { signHostPayload, verifyHostPayload } from "./hostVault.js";

const payloadSchema = z.object({
  v: z.literal(1),
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  issuedTs: z.number().int(),
  expTs: z.number().int(),
  authType: z.enum(["LOCAL", "OIDC", "SAML", "SCIM"]),
  providerId: z.string().nullable(),
  csrfToken: z.string().min(8),
  nonce: z.string().min(8)
});

export type IdentitySessionPayload = z.infer<typeof payloadSchema>;

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  if (typeof value !== "string") throw new TypeError("base64url input must be a string");
  return Buffer.from(value, "base64url");
}

export function issueIdentitySessionToken(params: {
  hostDir: string;
  userId: string;
  authType: "LOCAL" | "OIDC" | "SAML" | "SCIM";
  providerId?: string | null;
  ttlMinutes: number;
}): { token: string; payload: IdentitySessionPayload } {
  const now = Date.now();
  const payload = payloadSchema.parse({
    v: 1,
    sessionId: `ses_${randomUUID().replace(/-/g, "")}`,
    userId: params.userId,
    issuedTs: now,
    expTs: now + Math.max(5, params.ttlMinutes) * 60_000,
    authType: params.authType,
    providerId: params.providerId ?? null,
    csrfToken: randomUUID().replace(/-/g, ""),
    nonce: randomUUID().replace(/-/g, "")
  });
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const sig = signHostPayload(params.hostDir, "session", payloadBytes);
  return {
    token: `${toBase64Url(payloadBytes)}.${sig}`,
    payload
  };
}

export function verifyIdentitySessionToken(params: {
  hostDir: string;
  token: string;
}): { ok: boolean; payload: IdentitySessionPayload | null; error?: string } {
  try {
    const [payloadPart, sigPart, ...rest] = params.token.split(".");
    if (!payloadPart || !sigPart || rest.length > 0) {
      return { ok: false, payload: null, error: "invalid format" };
    }
    const payloadBytes = fromBase64Url(payloadPart);
    const parsed = payloadSchema.parse(JSON.parse(payloadBytes.toString("utf8")) as unknown);
    const ok = verifyHostPayload(params.hostDir, "session", payloadBytes, sigPart);
    if (!ok) {
      return { ok: false, payload: null, error: "signature invalid" };
    }
    if (Date.now() > parsed.expTs) {
      return { ok: false, payload: parsed, error: "expired" };
    }
    return { ok: true, payload: parsed };
  } catch (error) {
    return { ok: false, payload: null, error: String(error) };
  }
}
