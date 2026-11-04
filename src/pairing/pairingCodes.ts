import { randomInt, randomUUID, sign } from "node:crypto";
import { join } from "node:path";
import { getSigningKey } from "../crypto/keys.js";
import { verifySessionCredentialSignature } from "../auth/sessionCredentialSignature.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { parseCookieHeader } from "../auth/sessionTokens.js";

interface PairingCodeRecord {
  id: string;
  codeHash: string;
  createdTs: number;
  expiresTs: number;
  usedTs?: number;
}

interface PairingStore {
  v: 1;
  updatedTs: number;
  codes: PairingCodeRecord[];
}

interface PairingSessionPayload {
  v: 1;
  pairingId: string;
  issuedTs: number;
  expiresTs: number;
  nonce: string;
}

function pairingStorePath(workspace: string): string {
  return join(workspace, ".amc", "studio", "pairing.codes.json");
}

function readStore(workspace: string): PairingStore {
  const path = pairingStorePath(workspace);
  if (!pathExists(path)) {
    return {
      v: 1,
      updatedTs: Date.now(),
      codes: []
    };
  }
  return JSON.parse(readUtf8(path)) as PairingStore;
}

function writeStore(workspace: string, store: PairingStore): void {
  ensureDir(join(workspace, ".amc", "studio"));
  writeFileAtomic(pairingStorePath(workspace), JSON.stringify(store, null, 2), 0o600);
}

function withPairingStoreLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc", "studio"), name: "pairing-codes", operation });
}

function cleanStore(store: PairingStore, now = Date.now()): PairingStore {
  return {
    ...store,
    updatedTs: now,
    codes: store.codes.filter((code) => now <= code.expiresTs + 24 * 60 * 60_000)
  };
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export function createPairingCode(params: {
  workspace: string;
  ttlMs: number;
}): { code: string; expiresTs: number; id: string } {
  return withPairingStoreLock(params.workspace, () => {
    const now = Date.now();
    const ttlMs = Math.max(60_000, params.ttlMs);
    const code = String(randomInt(10 ** 7, 10 ** 10 - 1));
    const record: PairingCodeRecord = {
      id: `pair_${randomUUID().replace(/-/g, "")}`,
      codeHash: sha256Hex(code),
      createdTs: now,
      expiresTs: now + ttlMs
    };
    const store = cleanStore(readStore(params.workspace), now);
    store.codes.push(record);
    writeStore(params.workspace, store);
    return { code, expiresTs: record.expiresTs, id: record.id };
  });
}

type PairingClaimInput = { workspace: string; code: string; pairingTtlMs?: number };
type PairingClaimResult = { ok: boolean; token?: string; error?: string; pairingId?: string; expiresTs?: number };
type PreparedPairingClaim = { ok: false; error: string } | {
  ok: true; store: PairingStore; record: PairingCodeRecord; payload: PairingSessionPayload; payloadBytes: Buffer;
};

/** Called under the store lock; no signature or provider request runs in this helper. */
function preparePairingClaim(params: PairingClaimInput): PreparedPairingClaim {
  const now = Date.now();
  const store = cleanStore(readStore(params.workspace), now);
  const hash = sha256Hex(params.code.trim());
  const record = store.codes.find((row) => row.codeHash === hash);
  const error = !record ? "pairing code invalid" : record.usedTs ? "pairing code already used"
    : now > record.expiresTs ? "pairing code expired" : null;
  if (error !== null || record === undefined) {
    writeStore(params.workspace, store);
    return { ok: false, error: error ?? "pairing code invalid" };
  }
  const payload: PairingSessionPayload = {
    v: 1, pairingId: record.id, issuedTs: now,
    expiresTs: now + Math.max(60_000, params.pairingTtlMs ?? 10 * 60_000),
    nonce: randomUUID().replace(/-/g, "")
  };
  return { ok: true, store, record, payload, payloadBytes: Buffer.from(JSON.stringify(payload), "utf8") };
}

function pairingClaimResult(payload: PairingSessionPayload, bytes: Buffer, signature: Buffer): PairingClaimResult {
  return { ok: true, token: `${toBase64Url(bytes)}.${toBase64Url(signature)}`, pairingId: payload.pairingId, expiresTs: payload.expiresTs };
}

/** Synchronous vault compatibility API. It shares the short store lock with runtime claims. */
export function claimPairingCode(params: PairingClaimInput): PairingClaimResult {
  return withPairingStoreLock(params.workspace, () => {
    const prepared = preparePairingClaim(params);
    if (!prepared.ok) return prepared;
    prepared.record.usedTs = prepared.payload.issuedTs;
    writeStore(params.workspace, prepared.store);
    const signature = sign(null, prepared.payloadBytes, getSigningKey(params.workspace, "session"));
    return pairingClaimResult(prepared.payload, prepared.payloadBytes, signature);
  });
}

/** Sign outside the file lock; consume only after signing succeeds and the same code is still current and unused. */
export async function claimPairingCodeAsync(params: PairingClaimInput): Promise<PairingClaimResult> {
  const prepared = withPairingStoreLock(params.workspace, () => preparePairingClaim(params));
  if (!prepared.ok) return prepared;
  const signed = await signWithPurposeKey(params.workspace, "session", prepared.payloadBytes);
  return withPairingStoreLock(params.workspace, () => {
    const now = Date.now(), store = cleanStore(readStore(params.workspace), now);
    const record = store.codes.find((row) => row.id === prepared.record.id && row.codeHash === prepared.record.codeHash
      && row.createdTs === prepared.record.createdTs && row.expiresTs === prepared.record.expiresTs);
    const error = !record ? "pairing code invalid" : record.usedTs ? "pairing code already used"
      : now > record.expiresTs || now > prepared.payload.expiresTs ? "pairing code expired" : null;
    if (error !== null || record === undefined) {
      writeStore(params.workspace, store);
      return { ok: false, error: error ?? "pairing code invalid" };
    }
    record.usedTs = now;
    writeStore(params.workspace, store);
    return pairingClaimResult(prepared.payload, prepared.payloadBytes, signed.signature);
  });
}

export function verifyPairingToken(params: {
  workspace: string;
  token: string;
}): { ok: boolean; payload?: PairingSessionPayload; error?: string } {
  try {
    const [payloadPart, sigPart, ...extra] = params.token.split(".");
    if (!payloadPart || !sigPart || extra.length > 0) {
      return { ok: false, error: "invalid pairing token format" };
    }
    const payloadBytes = fromBase64Url(payloadPart);
    const signature = fromBase64Url(sigPart);
    const payload = JSON.parse(payloadBytes.toString("utf8")) as PairingSessionPayload;
    if (payload.v !== 1 || typeof payload.pairingId !== "string") {
      return { ok: false, error: "invalid pairing token payload" };
    }
    const valid = verifySessionCredentialSignature(params.workspace, payloadBytes, signature);
    if (!valid) {
      return { ok: false, error: "pairing token signature invalid" };
    }
    if (Date.now() > payload.expiresTs) {
      return { ok: false, error: "pairing token expired" };
    }
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: String(error)
    };
  }
}

export function pairingTokenFromCookie(rawCookieHeader: string | undefined): string | null {
  return parseCookieHeader(rawCookieHeader, "amc_pairing");
}
