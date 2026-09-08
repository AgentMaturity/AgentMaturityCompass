import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyKeyHistoryEntries, type KeyHistoryEntry } from "./keyHistoryChain.js";

export type KeyHistoryRole = "monitor" | "auditor" | "lease" | "session";

export interface KeyHistoryEnvelope {
  v: 1;
  purpose: "amc.key-history";
  role: KeyHistoryRole;
  anchorFingerprint: string;
  revision: number;
  entries: KeyHistoryEntry[];
  signature: string;
}

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({
  createdTs: z.number().int().nonnegative().safe(),
  fingerprint: fingerprintSchema,
  publicKeyPem: z.string().min(1).max(4096),
  entryHash: fingerprintSchema.optional(),
  prevHash: z.union([fingerprintSchema, z.literal("GENESIS")]).optional(),
  source: z.enum(["local", "notary", "imported"]).optional()
}).strict();
const envelopeSchema = z.object({
  v: z.literal(1),
  purpose: z.literal("amc.key-history"),
  role: z.enum(["monitor", "auditor", "lease", "session"]),
  anchorFingerprint: fingerprintSchema,
  revision: z.number().int().positive().safe(),
  entries: z.array(entrySchema).min(1).max(10000),
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
}).strict();

// Sign the tagged payload itself, never a digest through signHexDigest or the
// policy/notary signer. Ordinary artifact-digest signatures cannot authorize
// changes to which keys are trusted to sign those artifacts.
const DOMAIN = "AMC_KEY_HISTORY_ADMISSION_V1\0";
function payloadBytes(envelope: Omit<KeyHistoryEnvelope, "signature">): Buffer {
  return Buffer.from(DOMAIN + canonicalize(envelope), "utf8");
}

export function publicKeyFromPrivate(privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Key history requires an Ed25519 role key");
  return createPublicKey(key).export({ format: "pem", type: "spki" }).toString();
}

export function validHistoryEntry(entry: unknown): entry is KeyHistoryEntry {
  const parsed = entrySchema.safeParse(entry);
  if (!parsed.success) return false;
  try {
    return createPublicKey(parsed.data.publicKeyPem).asymmetricKeyType === "ed25519"
      && sha256Hex(Buffer.from(parsed.data.publicKeyPem, "utf8")) === parsed.data.fingerprint;
  } catch {
    return false;
  }
}

export function sealKeyHistory(
  role: KeyHistoryRole,
  entries: KeyHistoryEntry[],
  privateKeyPem: string,
  revision: number = 1
): KeyHistoryEnvelope {
  const anchor = publicKeyFromPrivate(privateKeyPem);
  const base: Omit<KeyHistoryEnvelope, "signature"> = {
    v: 1,
    purpose: "amc.key-history",
    role,
    anchorFingerprint: sha256Hex(Buffer.from(anchor, "utf8")),
    revision,
    entries
  };
  const envelope = { ...base, signature: sign(null, payloadBytes(base), privateKeyPem).toString("base64") };
  const checked = verifyKeyHistoryEnvelope(envelope, role, anchor);
  if (!checked.valid) throw new Error(`Cannot seal key history: ${checked.reason}`);
  return envelope;
}

export function verifyKeyHistoryEnvelope(
  value: unknown,
  role: KeyHistoryRole,
  currentPublicKeyPem: string
): { valid: boolean; reason: string | null; envelope: KeyHistoryEnvelope | null } {
  const fail = (reason: string) => ({ valid: false, reason, envelope: null });
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) return fail(Array.isArray(value) ? "legacy history has no admission signature" : "invalid history envelope");
  const envelope = parsed.data;
  if (envelope.role !== role) return fail("history role mismatch");
  if (envelope.anchorFingerprint !== sha256Hex(Buffer.from(currentPublicKeyPem, "utf8"))) return fail("history anchor mismatch");
  if (envelope.entries.some((entry) => !validHistoryEntry(entry))) return fail("invalid history key or fingerprint");
  if (new Set(envelope.entries.map((entry) => entry.fingerprint)).size !== envelope.entries.length) return fail("duplicate history key");
  if (!envelope.entries.some((entry) => entry.fingerprint === envelope.anchorFingerprint)) return fail("current role key missing from history");
  if (!verifyKeyHistoryEntries(envelope.entries).ok) return fail("history hash chain is invalid");
  const { signature, ...base } = envelope;
  try {
    if (createPublicKey(currentPublicKeyPem).asymmetricKeyType !== "ed25519") return fail("invalid current role key");
    if (!verify(null, payloadBytes(base), currentPublicKeyPem, Buffer.from(signature, "base64"))) return fail("history admission signature is invalid");
  } catch {
    return fail("history admission signature is invalid");
  }
  return { valid: true, reason: null, envelope };
}
