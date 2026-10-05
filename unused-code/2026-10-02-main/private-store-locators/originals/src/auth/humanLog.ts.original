import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface HumanLogEntry {
  v: 1;
  ts: number;
  type: string;
  agentId: string | null;
  username: string | null;
  payload: Record<string, unknown>;
  prev: string | null;
  hash: string;
}

interface HumanSeal {
  v: 1;
  ts: number;
  lastHash: string | null;
  entryCount: number;
  signerFingerprint: string;
}

interface HumanSealSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function humanLogDir(workspace: string): string {
  return join(workspace, ".amc", "studio", "audit");
}

export function humanLogPath(workspace: string): string {
  return join(humanLogDir(workspace), "human.log");
}

export function humanSealPath(workspace: string): string {
  return join(humanLogDir(workspace), "human.seal.json");
}

export function humanSealSigPath(workspace: string): string {
  return join(humanLogDir(workspace), "human.seal.sig");
}

function loadEntries(workspace: string): HumanLogEntry[] {
  const path = humanLogPath(workspace);
  if (!pathExists(path)) {
    return [];
  }
  const raw = readUtf8(path).trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as HumanLogEntry);
}

function writeSeal(workspace: string, lastHash: string | null, entryCount: number): void {
  const signerPem = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  const seal: HumanSeal = {
    v: 1,
    ts: Date.now(),
    lastHash,
    entryCount,
    signerFingerprint: sha256Hex(Buffer.from(signerPem, "utf8"))
  };
  const sealBytes = Buffer.from(JSON.stringify(seal), "utf8");
  writeFileAtomic(humanSealPath(workspace), JSON.stringify(seal, null, 2), 0o644);
  const digest = sha256Hex(sealBytes);
  const sig: HumanSealSignature = {
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  writeFileAtomic(humanSealSigPath(workspace), JSON.stringify(sig, null, 2), 0o644);
}

export function initHumanActionLog(workspace: string): {
  logPath: string;
  sealPath: string;
  sealSigPath: string;
} {
  ensureDir(humanLogDir(workspace));
  if (!pathExists(humanLogPath(workspace))) {
    writeFileAtomic(humanLogPath(workspace), "", 0o644);
  }
  if (!pathExists(humanSealPath(workspace)) || !pathExists(humanSealSigPath(workspace))) {
    writeSeal(workspace, null, 0);
  }
  return {
    logPath: humanLogPath(workspace),
    sealPath: humanSealPath(workspace),
    sealSigPath: humanSealSigPath(workspace)
  };
}

export function appendHumanActionEvent(params: {
  workspace: string;
  type: string;
  agentId?: string | null;
  username?: string | null;
  payload?: Record<string, unknown>;
}): HumanLogEntry {
  initHumanActionLog(params.workspace);
  const entries = loadEntries(params.workspace);
  const prev = entries.length > 0 ? entries[entries.length - 1]!.hash : null;
  const base = {
    v: 1 as const,
    ts: Date.now(),
    type: params.type,
    agentId: params.agentId ?? null,
    username: params.username ?? null,
    payload: params.payload ?? {},
    prev
  };
  const hash = sha256Hex(canonicalize(base));
  const entry: HumanLogEntry = {
    ...base,
    hash
  };
  const line = `${JSON.stringify(entry)}\n`;
  const existing = pathExists(humanLogPath(params.workspace)) ? readUtf8(humanLogPath(params.workspace)) : "";
  writeFileAtomic(humanLogPath(params.workspace), `${existing}${line}`, 0o644);
  writeSeal(params.workspace, entry.hash, entries.length + 1);
  return entry;
}

export function verifyHumanActionLog(workspace: string): {
  ok: boolean;
  errors: string[];
  entryCount: number;
} {
  const errors: string[] = [];
  initHumanActionLog(workspace);
  const entries = loadEntries(workspace);
  let prev: string | null = null;
  for (const [index, entry] of entries.entries()) {
    const expected = sha256Hex(
      canonicalize({
        v: entry.v,
        ts: entry.ts,
        type: entry.type,
        agentId: entry.agentId,
        username: entry.username,
        payload: entry.payload,
        prev: entry.prev
      })
    );
    if (entry.hash !== expected) {
      errors.push(`entry ${index} hash mismatch`);
    }
    if (entry.prev !== prev) {
      errors.push(`entry ${index} prev mismatch`);
    }
    prev = entry.hash;
  }
  if (!pathExists(humanSealPath(workspace)) || !pathExists(humanSealSigPath(workspace))) {
    errors.push("seal or signature missing");
  } else {
    try {
      const seal = JSON.parse(readUtf8(humanSealPath(workspace))) as HumanSeal;
      const sig = JSON.parse(readUtf8(humanSealSigPath(workspace))) as HumanSealSignature;
      const digest = sha256Hex(readFileSync(humanSealPath(workspace)));
      if (digest !== sig.digestSha256) {
        errors.push("seal digest mismatch");
      } else {
        const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
        if (!valid) {
          errors.push("seal signature verification failed");
        }
      }
      if ((seal.lastHash ?? null) !== prev) {
        errors.push("seal lastHash mismatch");
      }
      if (seal.entryCount !== entries.length) {
        errors.push("seal entryCount mismatch");
      }
    } catch (error) {
      errors.push(String(error));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    entryCount: entries.length
  };
}
