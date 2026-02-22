import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { updateTransparencyMerkleAfterAppend } from "./merkleIndexStore.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import {
  transparencyEntrySchema,
  transparencySealSchema,
  transparencySealSignatureSchema,
  type TransparencyEntry
} from "./logSchema.js";

function transparencyDir(workspace: string): string {
  return join(workspace, ".amc", "transparency");
}

export function transparencyLogPath(workspace: string): string {
  return join(transparencyDir(workspace), "log.jsonl");
}

export function transparencySealPath(workspace: string): string {
  return join(transparencyDir(workspace), "log.seal.json");
}

export function transparencySealSigPath(workspace: string): string {
  return join(transparencyDir(workspace), "log.seal.sig");
}

function appendLine(path: string, line: string): void {
  const current = pathExists(path) ? readUtf8(path) : "";
  writeFileAtomic(path, current + line + "\n", 0o644);
}

function readEntries(workspace: string): TransparencyEntry[] {
  const path = transparencyLogPath(workspace);
  if (!pathExists(path)) {
    return [];
  }
  return readUtf8(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => transparencyEntrySchema.parse(JSON.parse(line) as unknown));
}

function writeSeal(workspace: string, lastHash: string): void {
  ensureDir(transparencyDir(workspace));
  const auditorPub = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  const signerFingerprint = sha256Hex(Buffer.from(auditorPub, "utf8"));
  const seal = transparencySealSchema.parse({
    v: 1,
    ts: Date.now(),
    lastHash,
    signerFingerprint
  });
  const sealPath = transparencySealPath(workspace);
  writeFileAtomic(sealPath, JSON.stringify(seal, null, 2), 0o644);
  const digest = sha256Hex(readFileSync(sealPath));
  const signed = signDigestWithPolicy({
    workspace,
    kind: "TRANSPARENCY_ROOT",
    digestHex: digest
  });
  const sig = transparencySealSignatureSchema.parse({
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  writeFileAtomic(transparencySealSigPath(workspace), JSON.stringify(sig, null, 2), 0o644);
}

export function initTransparencyLog(workspace: string): {
  logPath: string;
  sealPath: string;
  sealSigPath: string;
} {
  ensureDir(transparencyDir(workspace));
  if (!pathExists(transparencyLogPath(workspace))) {
    writeFileAtomic(transparencyLogPath(workspace), "", 0o644);
  }
  if (!pathExists(transparencySealPath(workspace)) || !pathExists(transparencySealSigPath(workspace))) {
    writeSeal(workspace, "");
  }
  return {
    logPath: transparencyLogPath(workspace),
    sealPath: transparencySealPath(workspace),
    sealSigPath: transparencySealSigPath(workspace)
  };
}

export function appendTransparencyEntry(params: {
  workspace: string;
  type: string;
  agentId: string;
  artifact: {
    kind:
      | "amccert"
      | "amcbundle"
      | "amcbench"
      | "amcaudit"
      | "amcpass"
      | "bom"
      | "policy"
      | "approval"
      | "plugin"
      | "garak-scan-report"
      | "vulnerability-scan-report";
    sha256: string;
    id?: string;
  };
}): TransparencyEntry {
  initTransparencyLog(params.workspace);
  const entries = readEntries(params.workspace);
  const prev = entries.length > 0 ? entries[entries.length - 1]!.hash : "";
  const payload = {
    v: 1 as const,
    ts: Date.now(),
    type: params.type,
    agentId: params.agentId,
    artifact: {
      kind: params.artifact.kind,
      sha256: params.artifact.sha256,
      ...(params.artifact.id ? { id: params.artifact.id } : {})
    },
    prev
  };
  const hash = sha256Hex(canonicalize(payload));
  const entry = transparencyEntrySchema.parse({
    ...payload,
    hash
  });
  appendLine(transparencyLogPath(params.workspace), JSON.stringify(entry));
  writeSeal(params.workspace, entry.hash);
  try {
    updateTransparencyMerkleAfterAppend(params.workspace);
  } catch {
    // Keep transparency append robust even if merkle update fails; verification
    // and issuance paths enforce merkle integrity explicitly.
  }
  return entry;
}

export function readTransparencyEntries(workspace: string): TransparencyEntry[] {
  return readEntries(workspace);
}

export function verifyTransparencyLog(workspace: string): {
  ok: boolean;
  errors: string[];
  entryCount: number;
  lastHash: string;
} {
  const errors: string[] = [];
  initTransparencyLog(workspace);
  let entries: TransparencyEntry[] = [];
  try {
    entries = readEntries(workspace);
  } catch (error) {
    errors.push(`invalid transparency entry payload: ${String(error)}`);
  }
  let prev = "";
  for (const entry of entries) {
    if (entry.prev !== prev) {
      errors.push(`chain mismatch at ${entry.hash}: expected prev ${prev}, found ${entry.prev}`);
    }
    const expected = sha256Hex(
      canonicalize({
        v: 1,
        ts: entry.ts,
        type: entry.type,
        agentId: entry.agentId,
        artifact: entry.artifact,
        prev: entry.prev
      })
    );
    if (entry.hash !== expected) {
      errors.push(`hash mismatch at ${entry.hash}`);
    }
    prev = entry.hash;
  }
  const sealPath = transparencySealPath(workspace);
  const sealSigPath = transparencySealSigPath(workspace);
  if (!pathExists(sealPath) || !pathExists(sealSigPath)) {
    errors.push("seal or seal signature missing");
  } else {
    try {
      const seal = transparencySealSchema.parse(JSON.parse(readUtf8(sealPath)) as unknown);
      if (seal.lastHash !== prev) {
        errors.push(`seal lastHash mismatch: expected ${prev}, found ${seal.lastHash}`);
      }
      const sig = transparencySealSignatureSchema.parse(JSON.parse(readUtf8(sealSigPath)) as unknown);
      const digest = sha256Hex(readFileSync(sealPath));
      if (digest !== sig.digestSha256) {
        errors.push("seal signature digest mismatch");
      } else {
        const valid = verifySignedDigest({
          workspace,
          digestHex: digest,
          signed: {
            signature: sig.signature,
            envelope: sig.envelope
          }
        }) || verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
        if (!valid) {
          errors.push("seal signature verification failed");
        }
      }
    } catch (error) {
      errors.push(String(error));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    entryCount: entries.length,
    lastHash: prev
  };
}

function tarCreate(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create transparency bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to extract transparency bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

export function exportTransparencyBundle(params: {
  workspace: string;
  outFile: string;
}): { outFile: string } {
  initTransparencyLog(params.workspace);
  const temp = mkdtempSync(join(tmpdir(), "amc-tlog-"));
  try {
    const root = join(temp, "bundle");
    ensureDir(root);
    writeFileAtomic(join(root, "log.jsonl"), readFileSync(transparencyLogPath(params.workspace)));
    writeFileAtomic(join(root, "log.seal.json"), readFileSync(transparencySealPath(params.workspace)));
    writeFileAtomic(join(root, "log.seal.sig"), readFileSync(transparencySealSigPath(params.workspace)));
    writeFileAtomic(join(root, "auditor.pub"), Buffer.from(getPublicKeyHistory(params.workspace, "auditor")[0] ?? "", "utf8"));
    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    tarCreate(root, outFile);
    return { outFile };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function verifyTransparencyBundle(bundleFile: string): {
  ok: boolean;
  errors: string[];
} {
  const temp = mkdtempSync(join(tmpdir(), "amc-tlog-verify-"));
  try {
    tarExtract(bundleFile, temp);
    const files = readdirSync(temp, { withFileTypes: true });
    const root = files.find((entry) => entry.isDirectory()) ? join(temp, files.find((entry) => entry.isDirectory())!.name) : temp;
    const logPath = join(root, "log.jsonl");
    const sealPath = join(root, "log.seal.json");
    const sigPath = join(root, "log.seal.sig");
    const auditorPubPath = join(root, "auditor.pub");
    const errors: string[] = [];
    if (!pathExists(logPath) || !pathExists(sealPath) || !pathExists(sigPath) || !pathExists(auditorPubPath)) {
      errors.push("bundle missing required transparency files");
      return { ok: false, errors };
    }
    const entries = readUtf8(logPath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => transparencyEntrySchema.parse(JSON.parse(line) as unknown));
    let prev = "";
    for (const entry of entries) {
      if (entry.prev !== prev) {
        errors.push(`chain mismatch at ${entry.hash}`);
      }
      const expected = sha256Hex(
        canonicalize({
          v: 1,
          ts: entry.ts,
          type: entry.type,
          agentId: entry.agentId,
          artifact: entry.artifact,
          prev: entry.prev
        })
      );
      if (entry.hash !== expected) {
        errors.push(`hash mismatch at ${entry.hash}`);
      }
      prev = entry.hash;
    }
    const seal = transparencySealSchema.parse(JSON.parse(readUtf8(sealPath)) as unknown);
    if (seal.lastHash !== prev) {
      errors.push("seal lastHash mismatch");
    }
    const sig = transparencySealSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(sealPath));
    if (digest !== sig.digestSha256) {
      errors.push("seal digest mismatch");
    } else {
      const auditorPub = readUtf8(auditorPubPath);
      if (!verifyHexDigestAny(digest, sig.signature, [auditorPub])) {
        errors.push("seal signature invalid");
      }
    }
    return {
      ok: errors.length === 0,
      errors
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function tailTransparencyEntries(workspace: string, n: number): TransparencyEntry[] {
  const entries = readEntries(workspace);
  const limit = Math.max(1, Math.floor(n));
  return entries.slice(Math.max(0, entries.length - limit));
}

export function transparencyFingerprint(workspace: string): string {
  return sha256Hex(readFileSync(transparencySealPath(workspace)));
}

export function artifactSha256(filePath: string): string {
  return sha256Hex(readFileSync(filePath));
}

export function listTransparencyFiles(workspace: string): string[] {
  const root = transparencyDir(workspace);
  if (!pathExists(root)) {
    return [];
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}
