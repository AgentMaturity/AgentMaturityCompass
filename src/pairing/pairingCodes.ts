import { randomInt, randomUUID, sign, verify } from "node:crypto";
import { join } from "node:path";
import { getSigningKey, getPublicKeyHistory } from "../crypto/keys.js";
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
  return {
    code,
    expiresTs: record.expiresTs,
    id: record.id
  };
}

export function claimPairingCode(params: {
  workspace: string;
  code: string;
  pairingTtlMs?: number;
}): { ok: boolean; token?: string; error?: string; pairingId?: string; expiresTs?: number } {
  const now = Date.now();
  const store = cleanStore(readStore(params.workspace), now);
  const hash = sha256Hex(params.code.trim());
  const record = store.codes.find((row) => row.codeHash === hash);
  if (!record) {
    writeStore(params.workspace, store);
    return { ok: false, error: "pairing code invalid" };
  }
  if (record.usedTs) {
    writeStore(params.workspace, store);
    return { ok: false, error: "pairing code already used" };
  }
  if (now > record.expiresTs) {
    writeStore(params.workspace, store);
    return { ok: false, error: "pairing code expired" };
  }
  record.usedTs = now;
  writeStore(params.workspace, store);

  const payload: PairingSessionPayload = {
    v: 1,
    pairingId: record.id,
    issuedTs: now,
    expiresTs: now + Math.max(60_000, params.pairingTtlMs ?? 10 * 60_000),
    nonce: randomUUID().replace(/-/g, "")
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = sign(null, payloadBytes, getSigningKey(params.workspace, "session"));
  return {
    ok: true,
    token: `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`,
    pairingId: payload.pairingId,
    expiresTs: payload.expiresTs
  };
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
    const valid = getPublicKeyHistory(params.workspace, "session").some((pub) => verify(null, payloadBytes, pub, signature));
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
