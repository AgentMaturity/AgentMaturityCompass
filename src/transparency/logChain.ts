import { mkdtempSync, readdirSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { currentTreeAlgorithm, readSignedCurrentRoot } from "./merkleIndexStore.js";
import { prepareMerkle, preparedRootSignature, publishPreparedMerkle } from "./preparedMerkle.js";
import { clearMerklePendingMarker, TransparencyMerkleLagError, writeMerklePendingMarker } from "./merkleIndexState.js";
import { captureTransparencyState, publishTransparencyState, stateBytes, workspaceLogPath } from "./workspacePublication.js";
export { appendTransparencyEntryAsync } from "./asyncWorkspaceAppend.js";
import type { MerkleAlgorithm } from "./merkle.js";
import { signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { verifyWorkspaceLogSignature } from "./workspaceSignature.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { captureWorkspaceLogAuthority } from "./asyncWorkspaceAppend.js";
import { captureTransparencyAppendPublication, withTransparencyPublicationLock } from "./workspacePublication.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};

import {

  transparencyEntrySchema,
  transparencySealSchema,
  transparencySealSignatureSchema,
  type TransparencyArtifactKind,
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
  appendFileSync(path, line + "\n", "utf8");
}

/**
 * The hash of the last entry in the log, or "" when the log is empty.
 *
 * The append path needs exactly this one value to chain the new entry, and
 * getting it by materialising and zod-parsing every entry made each append O(n)
 * — O(n^2) over the life of a log, on top of the two full-log parses the Merkle
 * rebuild used to add. Only the final line is parsed; the log file is the
 * authority (not log.seal.json, which is written separately and can lag it
 * across a crash), so the chosen `prev` is byte-identical to the whole-file read
 * it replaces. Mirrors `lastBlobIndexHash` in the blob store.
 */
function lastTransparencyEntryHash(bytes: Buffer | null): string {
  const text = bytes?.toString("utf8") ?? "";
  let end = text.length;
  while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
  if (end === 0) return "";
  const start = text.lastIndexOf("\n", end - 1) + 1;
  const lastLine = text.slice(start, end);
  return transparencyEntrySchema.parse(JSON.parse(lastLine) as unknown).hash;
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

/** Shared pure wire recipe; the synchronous caller retains its historical role-first fingerprint. */
function sealBytes(lastHash: string, signerFingerprint: string, merkleAlgorithm: MerkleAlgorithm): Buffer {
  const seal = transparencySealSchema.parse({
    v: 1,
    ts: Date.now(),
    lastHash,
    signerFingerprint,
    merkleAlgorithm
  });
  return Buffer.from(JSON.stringify(seal, null, 2));
}
function sealSignatureBytes(digest: string, signed: SignedDigest): Buffer {
  const sig = transparencySealSignatureSchema.parse({
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  return Buffer.from(JSON.stringify(sig, null, 2));
}
/** `merkleAlgorithm` makes the Merkle tree choice part of the signed, chain-bound seal (P1-26). */
function prepareSeal(workspace: string, lastHash: string, merkleAlgorithm: MerkleAlgorithm): { bytes: Buffer; signature: Buffer } {
  const auditorPub = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  const signerFingerprint = sha256Hex(Buffer.from(auditorPub, "utf8"));
  const bytes = sealBytes(lastHash, signerFingerprint, merkleAlgorithm), digest = sha256Hex(bytes);
  const signed = signDigestWithPolicy({
    workspace,
    kind: "TRANSPARENCY_ROOT",
    digestHex: digest
  });
  return { bytes, signature: sealSignatureBytes(digest, signed) };
}

export function initTransparencyLog(workspace: string): {
  logPath: string;
  sealPath: string;
  sealSigPath: string;
} {
  const before = captureTransparencyState(workspace), log = stateBytes(before, workspaceLogPath(workspace));
  const seal = !pathExists(transparencySealPath(workspace)) || !pathExists(transparencySealSigPath(workspace))
    ? prepareSeal(workspace, "", currentTreeAlgorithm(workspace)) : null;
  publishTransparencyState(workspace, before, () => {
    if (log === null) writeFileAtomic(transparencyLogPath(workspace), "", 0o644);
    if (seal !== null) {
      writeFileAtomic(transparencySealPath(workspace), seal.bytes, 0o644);
      writeFileAtomic(transparencySealSigPath(workspace), seal.signature, 0o644);
    }
  });
  return {
    logPath: transparencyLogPath(workspace),
    sealPath: transparencySealPath(workspace),
    sealSigPath: transparencySealSigPath(workspace)
  };
}

interface TransparencyInitializationProgress {
  readonly phase: string;
  readonly signingCallAttempted: boolean;
  readonly signingCallReturned: boolean;
  readonly lockSetupAttempted: boolean;
  readonly lockEntered: boolean;
  readonly lockReturned: boolean;
  readonly attemptedPath: string | null;
  readonly returnedMembers: readonly string[];
  readonly acknowledgedMembers: readonly string[];
  readonly completed: boolean;
}
/** Native calls may leave setup/temp effects even without a returned or acknowledged member. */
class TransparencyInitializationError extends Error {
  readonly code = "TRANSPARENCY_INITIALIZATION_INCOMPLETE";
  constructor(readonly progress: TransparencyInitializationProgress, readonly firstRefusalObserved: boolean,
    readonly firstRefusal: unknown, cause: unknown) {
    super("transparency initialization did not complete; earlier native effects may remain", { cause });
    this.name = "TransparencyInitializationError";
  }
}
/** Fixed internal async sibling; no Sign or await runs inside the short native publication lock. */
export async function initTransparencyLogAttemptAsync(workspace: string, beforePublish?: () => void) {
  let phase = "authority-capture", signingCallAttempted = false, signingCallReturned = false;
  let lockSetupAttempted = false, lockEntered = false, lockReturned = false, completed = false;
  let attemptedPath: string | null = null, firstRefusalObserved = false, firstRefusal: unknown;
  const returnedMembers: string[] = [], acknowledgedMembers: string[] = [];
  const progress = (): TransparencyInitializationProgress => Object.freeze({ phase, signingCallAttempted, signingCallReturned,
    lockSetupAttempted, lockEntered, lockReturned, attemptedPath, completed,
    returnedMembers: Object.freeze([...returnedMembers]), acknowledgedMembers: Object.freeze([...acknowledgedMembers]) });
  const negative = (check: () => void) => {
    if (firstRefusalObserved) throw firstRefusal;
    try { check(); } catch (cause) { firstRefusalObserved = true; firstRefusal = cause; throw cause; }
  };
  const caller = () => negative(() => {
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    beforePublish?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  });
  try {
    caller();
    const original = captureWorkspaceLogAuthority(workspace, caller), publication = captureTransparencyAppendPublication(workspace);
    const logPath = transparencyLogPath(workspace), bodyPath = transparencySealPath(workspace), sigPath = transparencySealSigPath(workspace);
    const log = stateBytes(publication.state, logPath), needsSeal = !publication.present(bodyPath) || !publication.present(sigPath);
    let signed: SignedDigest | undefined, seal: { bytes: Buffer; signature: Buffer } | null = null;
    const stable = () => negative(() => { caller(); original.assertIntrinsicCurrent(signed); publication.assertCurrent(); });
    stable();
    if (needsSeal) {
      phase = "seal-preparation";
      const algorithm = currentTreeAlgorithm(workspace);
      const preparing = () => { stable(); negative(() => {
        if (currentTreeAlgorithm(workspace) !== algorithm) throw new Error("original initialization tree algorithm changed");
      }); };
      preparing();
      const bytes = sealBytes("", original.sealSigner.descriptor.fingerprint, algorithm), digest = sha256Hex(bytes);
      phase = "seal-sign"; signingCallAttempted = true;
      signed = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: digest,
        expectedSigner: original.sealSigner.descriptor, beforeSign: preparing });
      signingCallReturned = true; preparing();
      seal = { bytes, signature: sealSignatureBytes(digest, signed) };
    }
    const member = (path: string, bytes: Buffer) => {
      attemptedPath = null; phase = `before:${path}`; stable();
      phase = `write:${path}`; attemptedPath = path;
      writeFileAtomic(path, bytes, 0o644); returnedMembers.push(path);
      phase = `acknowledge:${path}`;
      publication.acknowledge(path, bytes, 0o644, "replace"); acknowledgedMembers.push(path);
      attemptedPath = null;
    };
    phase = "lock-setup"; lockSetupAttempted = true;
    withTransparencyPublicationLock(workspace, () => {
      lockEntered = true; phase = "first-native-gate"; stable();
      if (log === null) member(logPath, Buffer.alloc(0));
      if (seal !== null) { member(bodyPath, seal.bytes); member(sigPath, seal.signature); }
      phase = "final-native-gate"; stable();
    });
    lockReturned = true; phase = "after-lock"; stable();
    completed = true; phase = "complete";
    return Object.freeze({ paths: Object.freeze({ logPath, sealPath: bodyPath, sealSigPath: sigPath }), progress: progress(),
      assertCurrent() {
        try { stable(); }
        catch (cause) { throw new TransparencyInitializationError(progress(), firstRefusalObserved, firstRefusal, cause); }
      } });
  } catch (cause) { throw new TransparencyInitializationError(progress(), firstRefusalObserved, firstRefusal, cause); }
}

export function appendTransparencyEntry(params: {
  workspace: string;
  type: string;
  agentId: string;
  artifact: {
    // Derived from the schema's own enum rather than re-typed here: two copies
    // of this union is how a kind becomes appendable-but-unparseable.
    kind: TransparencyArtifactKind;
    sha256: string;
    id?: string;
  };
}): TransparencyEntry {
  initTransparencyLog(params.workspace);
  const before = captureTransparencyState(params.workspace);
  // Read before the line lands, while the seal still covers the log's last entry (P1-26).
  const merkleAlgorithm = currentTreeAlgorithm(params.workspace);
  const log = stateBytes(before, workspaceLogPath(params.workspace));
  const prev = lastTransparencyEntryHash(log);
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
  // Crypto preparation precedes the lock and the line. A crypto refusal is uncommitted; I/O after the line is not.
  const seal = prepareSeal(params.workspace, entry.hash, merkleAlgorithm);
  const plan = prepareMerkle({ workspace: params.workspace, algorithm: merkleAlgorithm, log,
    append: { entryHash: entry.hash, prevEntryHash: entry.prev }, resumeRoot: readSignedCurrentRoot(params.workspace) });
  const signedRoot = signDigestWithPolicy({ workspace: params.workspace, kind: "MERKLE_ROOT", digestHex: plan.digest });
  const rootSignature = preparedRootSignature(plan, signedRoot);
  publishTransparencyState(params.workspace, before, () => {
    appendLine(transparencyLogPath(params.workspace), JSON.stringify(entry));
    try {
      writeFileAtomic(transparencySealPath(params.workspace), seal.bytes, 0o644);
      writeFileAtomic(transparencySealSigPath(params.workspace), seal.signature, 0o644);
      publishPreparedMerkle(params.workspace, plan, rootSignature); clearMerklePendingMarker(params.workspace);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const pendingRecorded = writeMerklePendingMarker({ workspace: params.workspace, entryHash: entry.hash, reason });
      throw new TransparencyMerkleLagError({ entryHash: entry.hash, pendingRecorded, reason, cause: error });
    }
  });
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
      const sealBytes = readFileSync(sealPath);
      const seal = transparencySealSchema.parse(JSON.parse(sealBytes.toString("utf8")) as unknown);
      if (seal.lastHash !== prev) {
        errors.push(`seal lastHash mismatch: expected ${prev}, found ${seal.lastHash}`);
      }
      const sig = transparencySealSignatureSchema.parse(JSON.parse(readUtf8(sealSigPath)) as unknown);
      const digest = sha256Hex(sealBytes);
      if (digest !== sig.digestSha256) {
        errors.push("seal signature digest mismatch");
      } else {
        const valid = verifyWorkspaceLogSignature(workspace, "TRANSPARENCY_ROOT", digest, {
          signature: sig.signature, envelope: sig.envelope
        });
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
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8", timeout: 30000 });
  if (out.status !== 0) {
    throw new Error(`failed to create transparency bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
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

/** auditor.pub, the envelope key and --pubkey only locate the seal signer; admitKey decides whether it is pinned for artifact-seal (P0-51). */
export function verifyTransparencyBundle(bundleFile: string, trust: TrustContext, pubkeyPem?: string | null): {
  ok: boolean;
  errors: string[];
  report: VerifierReportV1;
} {
  const temp = mkdtempSync(join(tmpdir(), "amc-tlog-verify-"));
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "transparency-bundle", path: bundleFile, sha256: fileSha256(bundleFile) },
      context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, report };
  };
  try {
    tarExtract(bundleFile, temp);
    const files = readdirSync(temp, { withFileTypes: true });
    const root = files.find((entry) => entry.isDirectory()) ? join(temp, files.find((entry) => entry.isDirectory())!.name) : temp;
    const logPath = join(root, "log.jsonl");
    const sealPath = join(root, "log.seal.json");
    const sigPath = join(root, "log.seal.sig");
    const auditorPubPath = join(root, "auditor.pub");
    if (!pathExists(logPath) || !pathExists(sealPath) || !pathExists(sigPath) || !pathExists(auditorPubPath)) {
      errors.push("bundle missing required transparency files");
      return finish();
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
      const check = checkDigestSignature({ signature: "log.seal.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature, envelope: sig.envelope,
        candidates: [pubkeyPem, readUtf8(auditorPubPath), envelopePublicKey(sig.envelope)], context: trust, claimedSignedAt: sig.signedTs });
      signatures.push(check.admission);
      if (!check.verified || (sig.envelope !== undefined && sig.signature !== sig.envelope.sigB64)) {
        errors.push("seal signature invalid");
      }
    }
    return finish();
  } catch (error) {
    errors.push(String(error));
    return finish();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function tailTransparencyEntries(workspace: string, n: number): TransparencyEntry[] {
  const entries = readEntries(workspace);
  const limit = Math.max(1, Math.floor(n));
  return entries.slice(Math.max(0, entries.length - limit));
}
