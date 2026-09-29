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
import type { NotarySigner } from "./notarySigner.js";
import { verify } from "node:crypto";

const notaryLogEntrySchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  requestId: z.string().min(1),
  kind: z.string().min(1),
  payloadSha256: z.string().length(64),
  signerFingerprint: z.string().length(64),
  attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
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

export function initNotaryLog(notaryDir: string, signer: NotarySigner): void {
  const path = notaryLogPath(notaryDir);
  ensureDir(dirname(path));
  if (!pathExists(path)) {
    writeFileAtomic(path, "", 0o600);
  }
  if (!pathExists(notarySealPath(notaryDir)) || !pathExists(notarySealSigPath(notaryDir))) {
    writeSeal(notaryDir, signer, "");
  }
}

export function appendNotaryLogEntry(params: {
  notaryDir: string;
  signer: NotarySigner;
  requestId: string;
  kind: string;
  payloadSha256: string;
}): z.infer<typeof notaryLogEntrySchema> {
  initNotaryLog(params.notaryDir, params.signer);
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
        const ok = verify(null, Buffer.from(digest, "hex"), sig.pubkeyPem, Buffer.from(sig.signature, "base64"));
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
