import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  notaryLogPath,
  notarySealPath,
  notarySealSigPath
} from "./notaryConfigStore.js";
import type { AsyncNotarySigner, NotarySigner } from "./notarySigner.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { notaryAttestationBasisSchema } from "./notaryApiTypes.js";

const notaryLogEntrySchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  requestId: z.string().min(1),
  kind: z.string().min(1),
  payloadSha256: z.string().length(64),
  signerFingerprint: z.string().length(64),
  attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
  attestationBasis: notaryAttestationBasisSchema.optional(),
  prevHash: z.string(),
  entryHash: z.string().length(64)
});

const notarySealSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  lastHash: z.string(),
  signerFingerprint: z.string().length(64)
});

const notarySealSigSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signerFingerprint: z.string().length(64),
  pubkeyPem: z.string().min(1)
});

function appendLine(path: string, line: string): void {
  const current = pathExists(path) ? readUtf8(path) : "";
  writeFileAtomic(path, `${current}${line}\n`, 0o600);
}

function readEntries(notaryDir: string): Array<z.infer<typeof notaryLogEntrySchema>> {
  const path = notaryLogPath(notaryDir);
  if (!pathExists(path)) {
    return [];
  }
  return readUtf8(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => notaryLogEntrySchema.parse(JSON.parse(line) as unknown));
}

function writeSeal(notaryDir: string, signer: NotarySigner, lastHash: string): void {
  const seal = notarySealSchema.parse({
    v: 1,
    ts: Date.now(),
    lastHash,
    signerFingerprint: signer.pubkeyFingerprint()
  });
  const sealPath = notarySealPath(notaryDir);
  const sealSigPath = notarySealSigPath(notaryDir);
  ensureDir(dirname(sealPath));
  writeFileAtomic(sealPath, JSON.stringify(seal, null, 2), 0o600);
  const digest = sha256Hex(readFileSync(sealPath));
  const signed = signer.sign("NOTARY_LOG_SEAL", Buffer.from(digest, "hex"));
  const sig = notarySealSigSchema.parse({
    digestSha256: digest,
    signature: signed.signatureB64,
    signedTs: signed.signedTs,
    signerFingerprint: signed.pubkeyFingerprint,
    pubkeyPem: signed.pubkeyPem
  });
  writeFileAtomic(sealSigPath, JSON.stringify(sig, null, 2), 0o600);
}

function initNotaryLogUnlocked(notaryDir: string, signer: NotarySigner): void {
  const path = notaryLogPath(notaryDir);
  ensureDir(dirname(path));
  if (!pathExists(path)) {
    writeFileAtomic(path, "", 0o600);
  }
  if (!pathExists(notarySealPath(notaryDir)) || !pathExists(notarySealSigPath(notaryDir))) {
    writeSeal(notaryDir, signer, "");
  }
}

export function initNotaryLog(notaryDir: string, signer: NotarySigner): void {
  withControlFileLock({ root: dirname(notaryLogPath(notaryDir)), name: "notary-log", operation: () => initNotaryLogUnlocked(notaryDir, signer) });
}

export function appendNotaryLogEntry(params: {
  notaryDir: string;
  signer: NotarySigner;
  requestId: string;
  kind: string;
  payloadSha256: string;
}): z.infer<typeof notaryLogEntrySchema> {
  return withControlFileLock({ root: dirname(notaryLogPath(params.notaryDir)), name: "notary-log", operation: () => {
  initNotaryLogUnlocked(params.notaryDir, params.signer);
  const entries = readEntries(params.notaryDir);
  const prevHash = entries.length > 0 ? entries[entries.length - 1]!.entryHash : "";
  const payload = {
    v: 1 as const,
    ts: Date.now(),
    requestId: params.requestId,
    kind: params.kind,
    payloadSha256: params.payloadSha256,
    signerFingerprint: params.signer.pubkeyFingerprint(),
    attestationLevel: params.signer.attestationLevel(),
    attestationBasis: params.signer.attestationBasis(),
    prevHash
  };
  const entryHash = sha256Hex(canonicalize(payload));
  const entry = notaryLogEntrySchema.parse({
    ...payload,
    entryHash
  });
  appendLine(notaryLogPath(params.notaryDir), JSON.stringify(entry));
  writeSeal(params.notaryDir, params.signer, entryHash);
  return entry;
  } });
}

type AsyncLogParams = Omit<Parameters<typeof appendNotaryLogEntry>[0], "signer"> & { signer: AsyncNotarySigner };
const statePaths = (dir: string) => [notaryLogPath(dir), notarySealPath(dir), notarySealSigPath(dir)];
function readState(dir: string): Array<Buffer | null> {
  try { return statePaths(dir).map(path => pathExists(path) ? readFileSync(path) : null); }
  catch { throw new Error("notary log state unreadable"); }
}
const sameState = (a: Array<Buffer | null>, b: Array<Buffer | null>) => a.every((bytes, i) => bytes === null ? b[i] === null : b[i] !== null && bytes.equals(b[i]!));
function assertCurrentLog(dir: string, state: Array<Buffer | null>, signer: AsyncNotarySigner): void {
  if (state.some(bytes => bytes === null)) throw new Error("notary log state incomplete");
  const verified = verifyNotaryLog(dir), sidecar = notarySealSigSchema.parse(JSON.parse(state[2]!.toString("utf8")));
  const seal = notarySealSchema.parse(JSON.parse(state[1]!.toString("utf8")));
  if (!verified.ok || !sameState(state, readState(dir)) || sidecar.pubkeyPem !== signer.pubkeyPem()
    || sidecar.signerFingerprint !== signer.pubkeyFingerprint() || seal.signerFingerprint !== signer.pubkeyFingerprint()
    || sha256Hex(Buffer.from(sidecar.pubkeyPem, "utf8")) !== sidecar.signerFingerprint) throw new Error("notary log state invalid");
}
async function preparedSeal(signer: AsyncNotarySigner, lastHash: string) {
  const bytes = Buffer.from(JSON.stringify(notarySealSchema.parse({ v: 1, ts: Date.now(), lastHash, signerFingerprint: signer.pubkeyFingerprint() }), null, 2));
  const digest = sha256Hex(bytes), signed = await signer.sign("NOTARY_LOG_SEAL", Buffer.from(digest, "hex"));
  if (signed.pubkeyPem !== signer.pubkeyPem() || signed.pubkeyFingerprint !== signer.pubkeyFingerprint()
    || !verifyWithKey(Buffer.from(digest, "hex"), signer.pubkeyPem(), Buffer.from(signed.signatureB64, "base64"))) throw new Error("notary seal signing response invalid");
  const signature = Buffer.from(JSON.stringify(notarySealSigSchema.parse({ digestSha256: digest, signature: signed.signatureB64,
    signedTs: signed.signedTs, signerFingerprint: signed.pubkeyFingerprint, pubkeyPem: signed.pubkeyPem }), null, 2));
  return { bytes, signature };
}

/** Async initialization signs outside the synchronous lock, then publishes only its exact captured predecessor. */
export async function initNotaryLogAsync(dir: string, signer: AsyncNotarySigner): Promise<void> {
  ensureDir(dirname(notaryLogPath(dir)));
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = readState(dir);
    if (before.every(bytes => bytes !== null)) { assertCurrentLog(dir, before, signer); return; }
    // Empty log left by the existing initialization crash boundary is resumable; partial authenticated state is not.
    if (before[1] !== null || before[2] !== null || (before[0] !== null && before[0]!.length !== 0)) throw new Error("notary log state incomplete");
    const seal = await preparedSeal(signer, "");
    const committed = withControlFileLock({ root: dirname(notaryLogPath(dir)), name: "notary-log", operation: () => {
      if (!sameState(before, readState(dir))) return false;
      writeFileAtomic(notaryLogPath(dir), "", 0o600);
      writeFileAtomic(notarySealPath(dir), seal.bytes, 0o600); writeFileAtomic(notarySealSigPath(dir), seal.signature, 0o600); return true;
    } });
    if (committed) return;
  }
  throw new Error("notary log changed while signing; retry");
}

/** No promise or provider call enters the file lock. A concurrent append forces fresh chain/seal preparation. */
export async function appendNotaryLogEntryAsync(input: AsyncLogParams): Promise<z.infer<typeof notaryLogEntrySchema>> {
  const params = { ...input };
  await initNotaryLogAsync(params.notaryDir, params.signer);
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = readState(params.notaryDir); assertCurrentLog(params.notaryDir, before, params.signer);
    const entries = readEntries(params.notaryDir);
    if (!sameState(before, readState(params.notaryDir))) continue;
    const payload = { v: 1 as const, ts: Date.now(), requestId: params.requestId, kind: params.kind, payloadSha256: params.payloadSha256,
      signerFingerprint: params.signer.pubkeyFingerprint(), attestationLevel: params.signer.attestationLevel(),
      attestationBasis: params.signer.attestationBasis(), prevHash: entries.at(-1)?.entryHash ?? "" };
    const entry = notaryLogEntrySchema.parse({ ...payload, entryHash: sha256Hex(canonicalize(payload)) });
    const seal = await preparedSeal(params.signer, entry.entryHash);
    const committed = withControlFileLock({ root: dirname(notaryLogPath(params.notaryDir)), name: "notary-log", operation: () => {
      if (!sameState(before, readState(params.notaryDir))) return false;
      const current = before[0]!.toString("utf8"), separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      writeFileAtomic(notaryLogPath(params.notaryDir), current + separator + JSON.stringify(entry) + "\n", 0o600);
      writeFileAtomic(notarySealPath(params.notaryDir), seal.bytes, 0o600); writeFileAtomic(notarySealSigPath(params.notaryDir), seal.signature, 0o600); return true;
    } });
    if (committed) return entry;
  }
  throw new Error("notary log changed while signing; retry");
}

export function tailNotaryLog(notaryDir: string, limit = 50): Array<z.infer<typeof notaryLogEntrySchema>> {
  const entries = readEntries(notaryDir);
  const n = Math.max(1, Math.min(500, Math.trunc(limit)));
  return entries.slice(Math.max(0, entries.length - n));
}

export function verifyNotaryLog(notaryDir: string): {
  ok: boolean;
  errors: string[];
  count: number;
  lastHash: string;
} {
  const errors: string[] = [];
  const entries = readEntries(notaryDir);
  let prev = "";
  for (const entry of entries) {
    if (entry.prevHash !== prev) {
      errors.push(`chain mismatch at ${entry.requestId}`);
    }
    const expected = sha256Hex(
      canonicalize({
        v: 1,
        ts: entry.ts,
        requestId: entry.requestId,
        kind: entry.kind,
        payloadSha256: entry.payloadSha256,
        signerFingerprint: entry.signerFingerprint,
        attestationLevel: entry.attestationLevel,
        ...(entry.attestationBasis === undefined ? {} : { attestationBasis: entry.attestationBasis }),
        prevHash: entry.prevHash
      })
    );
    if (entry.entryHash !== expected) {
      errors.push(`entry hash mismatch for ${entry.requestId}`);
    }
    prev = entry.entryHash;
  }
  const sealPath = notarySealPath(notaryDir);
  const sigPath = notarySealSigPath(notaryDir);
  if (!pathExists(sealPath) || !pathExists(sigPath)) {
    errors.push("seal files missing");
  } else {
    try {
      const seal = notarySealSchema.parse(JSON.parse(readUtf8(sealPath)) as unknown);
      const sig = notarySealSigSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
      if (seal.lastHash !== prev) {
        errors.push("seal lastHash mismatch");
      }
      const digest = sha256Hex(readFileSync(sealPath));
      if (digest !== sig.digestSha256) {
        errors.push("seal digest mismatch");
      } else {
        const ok = verifyWithKey(Buffer.from(digest, "hex"), sig.pubkeyPem, Buffer.from(sig.signature, "base64"));
        if (!ok) {
          errors.push("seal signature invalid");
        }
      }
    } catch (error) {
      errors.push(String(error));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    count: entries.length,
    lastHash: prev
  };
}
