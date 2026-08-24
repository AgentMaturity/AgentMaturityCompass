import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { buildMerkleProofFromEntryHashes, buildMerkleRootFromEntryHashes, merkleLeafHash, verifyMerkleProof } from "./merkle.js";
import { appendLeafToFrontier, buildFrontierFromEntryHashes, frontierRoot, type MerkleFrontier } from "./merkleFrontier.js";
import {
  clearMerklePendingMarker,
  frontierResumeBlocker,
  leavesFileBytes,
  readMerkleFrontierState,
  readMerklePendingMarker,
  TransparencyMerkleLagError,
  writeMerkleFrontierState,
  writeMerklePendingMarker
} from "./merkleIndexState.js";
import {
  merkleCurrentRootPath,
  merkleCurrentRootSigPath,
  merkleLeavesPath,
  merkleRootsPath,
  transparencyMerkleDir
} from "./merklePaths.js";
import { transparencyEntrySchema } from "./logSchema.js";
import { merkleProofPayloadSchema, merkleProofSignatureSchema, type MerkleProofPayload } from "./proofSchema.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

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


const merkleLeafRowSchema = z.object({
  v: z.literal(1),
  index: z.number().int().min(0),
  entryHash: z.string().length(64),
  leafHash: z.string().length(64)
});

const merkleRootRowSchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  leafCount: z.number().int().min(0),
  root: z.string().length(64),
  lastEntryHash: z.string().default("")
});

const rootSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

function transparencyDir(workspace: string): string {
  return join(workspace, ".amc", "transparency");
}

function transparencyLogPath(workspace: string): string {
  return join(transparencyDir(workspace), "log.jsonl");
}


function readTransparencyEntryHashes(workspace: string): string[] {
  if (!pathExists(transparencyLogPath(workspace))) {
    return [];
  }
  const lines = readUtf8(transparencyLogPath(workspace))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line) => transparencyEntrySchema.parse(JSON.parse(line) as unknown).hash);
}

function writeCurrentRoot(workspace: string, row: z.infer<typeof merkleRootRowSchema>): void {
  const rootPath = merkleCurrentRootPath(workspace);
  writeFileAtomic(rootPath, JSON.stringify(row, null, 2), 0o644);
  const digest = sha256Hex(readFileSync(rootPath));
  const signed = signDigestWithPolicy({
    workspace,
    kind: "MERKLE_ROOT",
    digestHex: digest
  });
  const signature = {
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor" as const,
    envelope: signed.envelope
  };
  writeFileAtomic(merkleCurrentRootSigPath(workspace), JSON.stringify(signature, null, 2), 0o644);
}

function tarCreate(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create merkle proof bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function merkleLeafLine(entryHash: string, index: number): string {
  return JSON.stringify(
    merkleLeafRowSchema.parse({
      v: 1,
      index,
      entryHash,
      leafHash: merkleLeafHash(entryHash)
    })
  );
}

/**
 * Appends one row to a JSONL index.
 *
 * `appendFileSync` rather than read-whole-then-write-whole: both leaves.jsonl
 * and roots.jsonl gain exactly one row per transparency append, and rewriting
 * them in full was ~150 KB of pointless I/O per append at only 400 entries.
 * The transparency log itself has always been written this way.
 */
function appendIndexRow(path: string, line: string): void {
  ensureDir(dirname(path));
  appendFileSync(path, `${line}\n`, "utf8");
}

function publishRoot(params: {
  workspace: string;
  leafCount: number;
  root: string;
  lastEntryHash: string;
}): z.infer<typeof merkleRootRowSchema> {
  const row = merkleRootRowSchema.parse({
    v: 1,
    ts: Date.now(),
    leafCount: params.leafCount,
    root: params.root,
    lastEntryHash: params.lastEntryHash
  });
  appendIndexRow(merkleRootsPath(params.workspace), JSON.stringify(row));
  writeCurrentRoot(params.workspace, row);
  return row;
}

/**
 * Recomputes the whole tree from log.jsonl.
 *
 * Still the repair path and still the oracle: `updateTransparencyMerkleAfterAppend`
 * is tested against this function's output at every leaf count, and falls back
 * to it whenever the incremental resume state cannot be trusted. It is no longer
 * on the per-append hot path.
 */
export function rebuildTransparencyMerkle(workspace: string): {
  leafCount: number;
  root: string;
  currentRootPath: string;
  currentRootSigPath: string;
} {
  ensureDir(transparencyMerkleDir(workspace));
  const entryHashes = readTransparencyEntryHashes(workspace);
  const root = buildMerkleRootFromEntryHashes(entryHashes);
  const leavesText = entryHashes.map((entryHash, index) => merkleLeafLine(entryHash, index)).join("\n");
  writeFileAtomic(merkleLeavesPath(workspace), leavesText.length > 0 ? `${leavesText}\n` : "", 0o644);

  const lastEntryHash = entryHashes[entryHashes.length - 1] ?? "";
  writeMerkleFrontierState({
    workspace,
    frontier: buildFrontierFromEntryHashes(entryHashes),
    leafCount: entryHashes.length,
    lastEntryHash,
    root
  });
  publishRoot({ workspace, leafCount: entryHashes.length, root, lastEntryHash });
  // The root now provably covers the whole log, so any recorded lag is repaired.
  clearMerklePendingMarker(workspace);
  return {
    leafCount: entryHashes.length,
    root,
    currentRootPath: merkleCurrentRootPath(workspace),
    currentRootSigPath: merkleCurrentRootSigPath(workspace)
  };
}

export interface TransparencyMerkleVerification {
  ok: boolean;
  errors: string[];
  root: string | null;
  leafCount: number;
  /** True when a failed update left the signed root behind the log and nothing has repaired it. */
  lagPending: boolean;
}

export function verifyTransparencyMerkle(workspace: string): TransparencyMerkleVerification {
  const errors: string[] = [];
  // Read first so the lag is reported even on the early-return paths below: a
  // missing root file with a pending marker is a *known* lag, not a mystery.
  const pending = readMerklePendingMarker(workspace);
  if (pending) {
    errors.push(
      `merkle update pending since ${new Date(pending.ts).toISOString()} for entry ${pending.entryHash}: ${pending.reason}`
    );
  }
  if (!pathExists(merkleCurrentRootPath(workspace)) || !pathExists(merkleCurrentRootSigPath(workspace))) {
    errors.push("merkle root or signature missing");
    return {
      ok: false,
      errors,
      root: null,
      leafCount: 0,
      lagPending: pending !== null
    };
  }
  let currentRoot: z.infer<typeof merkleRootRowSchema> | null = null;
  try {
    currentRoot = merkleRootRowSchema.parse(JSON.parse(readUtf8(merkleCurrentRootPath(workspace))) as unknown);
  } catch (error) {
    errors.push(`invalid current.root.json: ${String(error)}`);
  }
  if (!currentRoot) {
    return { ok: false, errors, root: null, leafCount: 0, lagPending: pending !== null };
  }
  const digest = sha256Hex(readFileSync(merkleCurrentRootPath(workspace)));
  try {
    const sig = rootSignatureSchema.parse(JSON.parse(readUtf8(merkleCurrentRootSigPath(workspace))) as unknown);
    if (sig.digestSha256 !== digest) {
      errors.push("merkle root signature digest mismatch");
    } else {
      const verified = verifySignedDigest({
        workspace,
        digestHex: digest,
        signed: {
          signature: sig.signature,
          envelope: sig.envelope
        }
      }) || verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
      if (!verified) {
        errors.push("merkle root signature invalid");
      }
    }
  } catch (error) {
    errors.push(`invalid current.root.sig: ${String(error)}`);
  }
  // Recomputed from the log, never taken from the stored row — this is the
  // check that catches a root which lags, was rolled back, or was written by
  // someone else's tree. A log line that no longer parses used to throw out of
  // here, past callers that expect a result object (verifyAll, the studio
  // endpoint, the certificate gate); an unreadable log is a verification
  // failure to report, not an exception to leak.
  let entryHashes: string[] = [];
  try {
    entryHashes = readTransparencyEntryHashes(workspace);
    const expected = buildMerkleRootFromEntryHashes(entryHashes);
    if (expected !== currentRoot.root) {
      errors.push(`merkle root mismatch: expected ${expected}, found ${currentRoot.root}`);
    }
    // The signed row also CLAIMS a leaf count and a last entry hash. Checking
    // only the root leaves those claims unverified, and this tree duplicates a
    // lone final node rather than promoting it (the Bitcoin construction), so a
    // log of n and one of n+1 whose last entry repeats can share a root. Binding
    // both claims to the log closes that ambiguity, and makes a rolled-back or
    // re-pointed root row detectable on its own terms.
    if (currentRoot.leafCount !== entryHashes.length) {
      errors.push(
        `merkle leaf count mismatch: signed root claims ${currentRoot.leafCount}, log holds ${entryHashes.length}`
      );
    }
    const lastEntryHash = entryHashes[entryHashes.length - 1] ?? "";
    if (currentRoot.lastEntryHash !== lastEntryHash) {
      errors.push("merkle root last entry hash does not match the log's last entry");
    }
  } catch (error) {
    errors.push(`cannot recompute merkle root from transparency log: ${String(error)}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    root: currentRoot.root,
    leafCount: entryHashes.length,
    lagPending: pending !== null
  };
}

export function listTransparencyMerkleRoots(workspace: string, n = 20): Array<z.infer<typeof merkleRootRowSchema>> {
  if (!pathExists(merkleRootsPath(workspace))) {
    return [];
  }
  const rows = readUtf8(merkleRootsPath(workspace))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => merkleRootRowSchema.parse(JSON.parse(line) as unknown));
  const limit = Math.max(1, Math.floor(n));
  return rows.slice(Math.max(0, rows.length - limit));
}

export function currentTransparencyMerkleRoot(workspace: string): z.infer<typeof merkleRootRowSchema> | null {
  if (!pathExists(merkleCurrentRootPath(workspace))) {
    return null;
  }
  return merkleRootRowSchema.parse(JSON.parse(readUtf8(merkleCurrentRootPath(workspace))) as unknown);
}

function rootSignatureFingerprint(workspace: string): string {
  const pub = getPublicKeyHistory(workspace, "auditor")[0] ?? "";
  return sha256Hex(Buffer.from(pub, "utf8"));
}

export function generateTransparencyInclusionProof(workspace: string, entryHash: string): MerkleProofPayload {
  const entryHashes = readTransparencyEntryHashes(workspace);
  const index = entryHashes.indexOf(entryHash);
  if (index < 0) {
    throw new Error(`entry hash not found in transparency log: ${entryHash}`);
  }
  const proof = buildMerkleProofFromEntryHashes(entryHashes, index);
  return merkleProofPayloadSchema.parse({
    v: 1,
    ts: Date.now(),
    entryHash,
    leafIndex: index,
    merkleRoot: proof.root,
    proofPath: proof.proofPath,
    rootSignatureFingerprint: rootSignatureFingerprint(workspace)
  });
}

export function exportTransparencyProofBundle(params: {
  workspace: string;
  entryHash: string;
  outFile: string;
}): { outFile: string; proof: MerkleProofPayload } {
  const proof = generateTransparencyInclusionProof(params.workspace, params.entryHash);
  const tmp = mkdtempSync(join(tmpdir(), "amc-proof-"));
  try {
    writeFileAtomic(join(tmp, "proof.json"), JSON.stringify(proof, null, 2), 0o644);
    const digest = sha256Hex(readFileSync(join(tmp, "proof.json")));
    const signed = signDigestWithPolicy({
      workspace: params.workspace,
      kind: "MERKLE_ROOT",
      digestHex: digest
    });
    const sig = merkleProofSignatureSchema.parse({
      digestSha256: digest,
      signature: signed.signature,
      signedTs: signed.signedTs,
      signer: "auditor",
      envelope: signed.envelope
    });
    writeFileAtomic(join(tmp, "proof.sig"), JSON.stringify(sig, null, 2), 0o644);
    writeFileAtomic(
      join(tmp, "auditor.pub"),
      Buffer.from(getPublicKeyHistory(params.workspace, "auditor")[0] ?? "", "utf8"),
      0o644
    );
    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    tarCreate(tmp, outFile);
    return {
      outFile,
      proof
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function verifyTransparencyProofBundle(bundleFile: string): {
  ok: boolean;
  errors: string[];
  proof: MerkleProofPayload | null;
} {
  const errors: string[] = [];
  const tmp = mkdtempSync(join(tmpdir(), "amc-proof-verify-"));
  try {
    tarExtract(bundleFile, tmp);
    const files = readdirSync(tmp, { withFileTypes: true });
    const root = files.find((entry) => entry.isDirectory()) ? join(tmp, files.find((entry) => entry.isDirectory())!.name) : tmp;
    const proofFile = join(root, "proof.json");
    const sigFile = join(root, "proof.sig");
    const pubFile = join(root, "auditor.pub");
    if (!pathExists(proofFile) || !pathExists(sigFile) || !pathExists(pubFile)) {
      return {
        ok: false,
        errors: ["proof bundle missing required files"],
        proof: null
      };
    }
    let proof: MerkleProofPayload | null = null;
    try {
      proof = merkleProofPayloadSchema.parse(JSON.parse(readUtf8(proofFile)) as unknown);
    } catch (error) {
      errors.push(`invalid proof.json: ${String(error)}`);
    }
    try {
      const sig = merkleProofSignatureSchema.parse(JSON.parse(readUtf8(sigFile)) as unknown);
      const digest = sha256Hex(readFileSync(proofFile));
      if (digest !== sig.digestSha256) {
        errors.push("proof signature digest mismatch");
      } else {
        const pub = readUtf8(pubFile);
        const ok = sig.envelope
          ? sig.signature === sig.envelope.sigB64 &&
            verifySignatureEnvelope(digest, sig.envelope, {
              trustedPublicKeys: [pub],
              requireTrustedKey: true
            })
          : verifyHexDigestAny(digest, sig.signature, [pub]);
        if (!ok) {
          errors.push("proof signature invalid");
        }
      }
    } catch (error) {
      errors.push(`invalid proof.sig: ${String(error)}`);
    }
    if (proof && !verifyMerkleProof({ entryHash: proof.entryHash, proofPath: proof.proofPath, root: proof.merkleRoot })) {
      errors.push("proof path does not resolve to merkle root");
    }
    return {
      ok: errors.length === 0,
      errors,
      proof
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function ensureTransparencyMerkleInitialized(workspace: string): void {
  if (!pathExists(merkleCurrentRootPath(workspace)) || !pathExists(merkleCurrentRootSigPath(workspace))) {
    rebuildTransparencyMerkle(workspace);
  }
}

/**
 * What the update actually did. `mode: "rebuild"` with a non-null `reason` is
 * the audit trail for a resume that could not be trusted — the root is still
 * correct, but something about the cached frontier did not add up, and a silent
 * fallback is how an O(n) regression (or a tampered cache) hides forever.
 */
export interface TransparencyMerkleUpdate {
  readonly mode: "incremental" | "rebuild";
  readonly reason: string | null;
  readonly leafCount: number;
  readonly root: string;
}

function applyIncrementalAppend(params: {
  workspace: string;
  entryHash: string;
  prevEntryHash: string;
}): TransparencyMerkleUpdate | null {
  const state = readMerkleFrontierState(params.workspace);
  if (!state) {
    return null;
  }
  const blocker = frontierResumeBlocker({
    state,
    expectedPrevEntryHash: params.prevEntryHash,
    leavesBytes: leavesFileBytes(params.workspace)
  });
  if (blocker !== null) {
    return { mode: "rebuild", reason: blocker, leafCount: 0, root: "" };
  }
  const frontier: MerkleFrontier = appendLeafToFrontier(state.frontier, params.entryHash);
  const leafCount = state.leafCount + 1;
  const root = frontierRoot(frontier);
  appendIndexRow(merkleLeavesPath(params.workspace), merkleLeafLine(params.entryHash, state.leafCount));
  // Publish before advancing the resume state, so the frontier only ever
  // describes a root that is actually signed on disk. If signing fails here the
  // frontier stays behind, its recorded leaves.jsonl size no longer matches, and
  // the next append rebuilds rather than resuming from a state whose root was
  // never published.
  publishRoot({ workspace: params.workspace, leafCount, root, lastEntryHash: params.entryHash });
  writeMerkleFrontierState({
    workspace: params.workspace,
    frontier,
    leafCount,
    lastEntryHash: params.entryHash,
    root
  });
  return { mode: "incremental", reason: null, leafCount, root };
}

/**
 * Advances the signed Merkle root to cover a transparency entry that has just
 * been written to log.jsonl.
 *
 * Two properties this owes its caller.
 *
 * INCREMENTAL: the common case touches O(log n) hashes and appends one row to
 * each index file. It used to re-parse the entire log twice and rewrite both
 * index files in full on every append, which made append cost grow linearly
 * with log length (measured on this machine over 400 appends: 2.59 -> 4.47
 * ms/append then, a flat ~1.95 ms/append now).
 *
 * FAIL-LOUD: if the root cannot be advanced, this throws
 * `TransparencyMerkleLagError` after recording a pending marker on disk. The
 * previous behaviour — catch, console.error, report success — let the signed
 * root freeze while the log kept growing, and inclusion proofs are generated
 * from the log rather than from the signed root, so the exporter would keep
 * issuing proofs against a root nobody ever signed. Throwing does not widen the
 * append's failure surface as much as it looks: the seal write earlier in
 * `appendTransparencyEntry` already signs, so a broken trust config or an
 * unreachable notary throws before this point.
 */
export function updateTransparencyMerkleAfterAppend(
  workspace: string,
  appended: { entryHash: string; prevEntryHash: string }
): TransparencyMerkleUpdate {
  try {
    const incremental = applyIncrementalAppend({
      workspace,
      entryHash: appended.entryHash,
      prevEntryHash: appended.prevEntryHash
    });
    const result = incremental ?? { mode: "rebuild" as const, reason: "no usable merkle frontier state", leafCount: 0, root: "" };
    if (result.mode === "incremental") {
      clearMerklePendingMarker(workspace);
      return result;
    }
    const rebuilt = rebuildTransparencyMerkle(workspace);
    clearMerklePendingMarker(workspace);
    return { mode: "rebuild", reason: result.reason, leafCount: rebuilt.leafCount, root: rebuilt.root };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const pendingRecorded = writeMerklePendingMarker({
      workspace,
      entryHash: appended.entryHash,
      reason
    });
    throw new TransparencyMerkleLagError({
      entryHash: appended.entryHash,
      pendingRecorded,
      reason,
      cause: error
    });
  }
}
