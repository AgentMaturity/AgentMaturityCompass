import { createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { publicKeyFromPrivate } from "./keyHistoryEnvelope.js";

const schema = z.object({
  v: z.literal(1),
  purpose: z.literal("amc.monitor-key-rotation"),
  previousPublicKeyPem: z.string().min(1).max(4096),
  previousFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  nextPublicKeyPem: z.string().min(1).max(4096),
  nextFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  previousHistorySha256: z.string().regex(/^[a-f0-9]{64}$/),
  nextHistorySha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdTs: z.number().int().nonnegative().safe(),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
}).strict();
export type KeyRotationReceipt = z.infer<typeof schema>;
const DOMAIN = "AMC_MONITOR_KEY_ROTATION_V1\0";
const bytes = (value: Omit<KeyRotationReceipt, "signature">) => Buffer.from(DOMAIN + canonicalize(value), "utf8");

export function createKeyRotationReceipt(input: {
  previousPrivateKeyPem: string;
  nextPublicKeyPem: string;
  previousHistorySha256: string;
  nextHistorySha256: string;
}): KeyRotationReceipt {
  const previousPublicKeyPem = publicKeyFromPrivate(input.previousPrivateKeyPem);
  const base: Omit<KeyRotationReceipt, "signature"> = {
    v: 1,
    purpose: "amc.monitor-key-rotation",
    previousPublicKeyPem,
    previousFingerprint: sha256Hex(Buffer.from(previousPublicKeyPem, "utf8")),
    nextPublicKeyPem: input.nextPublicKeyPem,
    nextFingerprint: sha256Hex(Buffer.from(input.nextPublicKeyPem, "utf8")),
    previousHistorySha256: input.previousHistorySha256,
    nextHistorySha256: input.nextHistorySha256,
    createdTs: Date.now()
  };
  return { ...base, signature: sign(null, bytes(base), input.previousPrivateKeyPem).toString("base64") };
}

/** A continuity receipt never updates a verifier's external pin by itself. */
export function verifyKeyRotationReceipt(value: unknown, expectedPreviousFingerprint: string): boolean {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return false;
  const { signature, ...base } = parsed.data;
  if (base.previousFingerprint !== expectedPreviousFingerprint
    || sha256Hex(Buffer.from(base.previousPublicKeyPem, "utf8")) !== base.previousFingerprint
    || sha256Hex(Buffer.from(base.nextPublicKeyPem, "utf8")) !== base.nextFingerprint) return false;
  try {
    if (createPublicKey(base.previousPublicKeyPem).asymmetricKeyType !== "ed25519" || createPublicKey(base.nextPublicKeyPem).asymmetricKeyType !== "ed25519") return false;
    return verify(null, bytes(base), base.previousPublicKeyPem, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
