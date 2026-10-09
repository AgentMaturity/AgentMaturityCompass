import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { entryInclusionProof, entryLeafHash, entryTreeRoot, MERKLE_ALGORITHMS, verifyEntryInclusion, type MerkleAlgorithm } from "./merkle.js";
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
  merkleMigrationPath,
  merkleMigrationSigPath,
  merkleRootsPath,
  transparencyMerkleDir
} from "./merklePaths.js";
import { transparencyEntrySchema, transparencySealSchema } from "./logSchema.js";
import { merkleProofPayloadSchema, merkleProofSignatureSchema, type MerkleProofPayload } from "./proofSchema.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, type IssuerAdmission, type PublicAnchoring, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { latestAnchorFiles, verifyBundledAnchor } from "./anchors/anchor.js";
import { consistencyProof, rootHash } from "./rfc9162.js";
import { fileSha256 } from "../trust/signatureCheck.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
export const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
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
  lastEntryHash: z.string().default(""),
  /** P1-26: absent means amc-legacy-v1. */
  algorithm: z.enum(MERKLE_ALGORITHMS).optional()
});

/** P1-26: signed once, when `rebuild --algorithm rfc9162-sha256` migrates a legacy log. */
const merkleMigrationSchema = z.strictObject({
  v: z.literal(1),
  ts: z.number().int(),
  legacyRoot: z.string().length(64),
  rfc9162Root: z.string().length(64),
  leafCount: z.number().int().min(0),
  lastEntryHash: z.string()
});
export type MerkleMigrationRecord = z.infer<typeof merkleMigrationSchema>;

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

/** Writes `row` as JSON and its MERKLE_ROOT signature (over the file's sha256) next to it. */
function writeSignedRow(workspace: string, rootPath: string, sigPath: string, row: object): void {
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
  writeFileAtomic(sigPath, JSON.stringify(signature, null, 2), 0o644);
}

/**
 * Reads a signed row and checks its signature over the bytes it parsed (one read, so no swap in between). `row` is
 * null when a file is missing or the row does not parse; `errors` lists every failed check. The keys are the
 * workspace's own auditor keys, so this is a local audit trail only; portable verdicts use P0-09 pinned trust.
 */
function readSignedRow<T>(workspace: string, path: string, sigPath: string, schema: z.ZodType<T>, label: string): { row: T | null; errors: string[] } {
  if (!pathExists(path) || !pathExists(sigPath)) {
    return { row: null, errors: [`${label} or signature missing`] };
  }
  let bytes: Buffer;
  let row: T;
  try {
    bytes = readFileSync(path);
    row = schema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  } catch (error) {
    return { row: null, errors: [`invalid ${basename(path)}: ${String(error)}`] };
  }
  const errors: string[] = [];
  const digest = sha256Hex(bytes);
  try {
    const sig = rootSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    if (sig.digestSha256 !== digest) {
      errors.push(`${label} signature digest mismatch`);
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
        errors.push(`${label} signature invalid`);
      }
    }
  } catch (error) {
    errors.push(`invalid ${basename(sigPath)}: ${String(error)}`);
  }
  return { row, errors };
}

function readSignedCurrentRoot(workspace: string): { row: z.infer<typeof merkleRootRowSchema> | null; errors: string[] } {
  return readSignedRow(workspace, merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleRootRowSchema, "merkle root");
}

/** The hash of the log's last entry ("" when empty), or null when the last line does not parse. */
function logTailHash(workspace: string): string | null {
  if (!pathExists(transparencyLogPath(workspace))) {
    return "";
  }
  const lines = readUtf8(transparencyLogPath(workspace)).trimEnd();
  try {
    return lines.length === 0 ? "" : transparencyEntrySchema.parse(JSON.parse(lines.slice(lines.lastIndexOf("\n") + 1)) as unknown).hash;
  } catch {
    return null;
  }
}

/**
 * The tree the log seal names (P1-26): its `merkleAlgorithm` (absent means legacy) when the seal's signature verifies
 * and it covers the log's last entry, else null. The seal is re-signed on every append and migration appends a log
 * entry, so neither deleting a file nor restoring an older seal brings back a legacy claim for the current log.
 */
function sealedTreeAlgorithm(workspace: string): MerkleAlgorithm | null {
  const { row, errors } = readSignedRow(workspace, join(transparencyDir(workspace), "log.seal.json"),
    join(transparencyDir(workspace), "log.seal.sig"), transparencySealSchema, "transparency seal");
  return row !== null && errors.length === 0 && row.lastHash === logTailHash(workspace) ? row.merkleAlgorithm ?? "amc-legacy-v1" : null;
}

/**
 * The tree this workspace grows (P1-26), sticky and fail-closed. Legacy only while the signed current root, the log
 * seal (covering the last entry) and the absence of a migration record all say so; anything missing, unverifiable or
 * naming rfc9162-sha256 means RFC 9162. The choice never comes from an unsigned file, so editing a cache, deleting a
 * file or restoring an older signed root cannot downgrade a migrated log.
 */
export function currentTreeAlgorithm(workspace: string): MerkleAlgorithm {
  const { row, errors } = readSignedCurrentRoot(workspace);
  const legacy = row !== null && errors.length === 0 && (row.algorithm ?? "amc-legacy-v1") === "amc-legacy-v1";
  return legacy && !pathExists(merkleMigrationPath(workspace)) && sealedTreeAlgorithm(workspace) === "amc-legacy-v1"
    ? "amc-legacy-v1" : "rfc9162-sha256";
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

function merkleLeafLine(entryHash: string, index: number, algorithm: MerkleAlgorithm): string {
  return JSON.stringify(
    merkleLeafRowSchema.parse({
      v: 1,
      index,
      entryHash,
      leafHash: entryLeafHash(algorithm, entryHash)
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
  algorithm: MerkleAlgorithm;
}): z.infer<typeof merkleRootRowSchema> {
  const row = merkleRootRowSchema.parse({
    v: 1,
    ts: Date.now(),
    leafCount: params.leafCount,
    root: params.root,
    lastEntryHash: params.lastEntryHash,
    algorithm: params.algorithm
  });
  appendIndexRow(merkleRootsPath(params.workspace), JSON.stringify(row));
  writeSignedRow(params.workspace, merkleCurrentRootPath(params.workspace), merkleCurrentRootSigPath(params.workspace), row);
  return row;
}

/**
 * Recomputes the whole tree from log.jsonl.
 *
 * Still the repair path and still the oracle: `updateTransparencyMerkleAfterAppend`
 * is tested against this function's output at every leaf count, and falls back
 * to it whenever the incremental resume state cannot be trusted. It is no longer
 * on the per-append hot path.
 *
 * P1-26: it rebuilds the tree currentTreeAlgorithm names; writeMerkleMigrationRecord
 * plus a sealed log entry is the only way from the legacy tree to RFC 9162, and
 * nothing goes back.
 */
export function rebuildTransparencyMerkle(workspace: string): {
  leafCount: number;
  root: string;
  algorithm: MerkleAlgorithm;
  currentRootPath: string;
  currentRootSigPath: string;
} {
  const algorithm = currentTreeAlgorithm(workspace);
  ensureDir(transparencyMerkleDir(workspace));
  const entryHashes = readTransparencyEntryHashes(workspace);
  const root = entryTreeRoot(algorithm, entryHashes);
  const lastEntryHash = entryHashes[entryHashes.length - 1] ?? "";
  const leavesText = entryHashes.map((entryHash, index) => merkleLeafLine(entryHash, index, algorithm)).join("\n");
  writeFileAtomic(merkleLeavesPath(workspace), leavesText.length > 0 ? `${leavesText}\n` : "", 0o644);

  writeMerkleFrontierState({
    workspace,
    frontier: buildFrontierFromEntryHashes(entryHashes, algorithm),
    leafCount: entryHashes.length,
    lastEntryHash,
    root
  });
  publishRoot({ workspace, leafCount: entryHashes.length, root, lastEntryHash, algorithm });
  // The root now provably covers the whole log, so any recorded lag is repaired.
  clearMerklePendingMarker(workspace);
  return {
    leafCount: entryHashes.length,
    root,
    algorithm,
    currentRootPath: merkleCurrentRootPath(workspace),
    currentRootSigPath: merkleCurrentRootSigPath(workspace)
  };
}

/**
 * Step one of moving a legacy log to RFC 9162 (P1-26): signs a record binding the verified legacy root to the RFC 9162
 * root over the same entries. The caller then appends a log entry naming the record's sha256, which re-seals the log
 * as rfc9162-sha256 and rebuilds the index (transparencyMerkleRebuildCli does both).
 */
export function writeMerkleMigrationRecord(workspace: string): { path: string; sha256: string; record: MerkleMigrationRecord } {
  if (currentTreeAlgorithm(workspace) !== "amc-legacy-v1") {
    throw new Error("this log already grows the rfc9162-sha256 tree");
  }
  const legacy = verifyTransparencyMerkle(workspace);
  if (!legacy.ok || legacy.root === null) {
    throw new Error(`migrate only a legacy root that verifies; run \`amc transparency merkle rebuild\` first (${legacy.errors.join("; ")})`);
  }
  const entryHashes = readTransparencyEntryHashes(workspace);
  const record = merkleMigrationSchema.parse({
    v: 1, ts: Date.now(), legacyRoot: legacy.root, rfc9162Root: entryTreeRoot("rfc9162-sha256", entryHashes),
    leafCount: entryHashes.length, lastEntryHash: entryHashes[entryHashes.length - 1] ?? ""
  });
  const path = merkleMigrationPath(workspace);
  writeSignedRow(workspace, path, merkleMigrationSigPath(workspace), record);
  return { path, sha256: sha256Hex(readFileSync(path)), record };
}

export interface TransparencyMerkleVerification {
  ok: boolean;
  errors: string[];
  root: string | null;
  leafCount: number;
  /** True when a failed update left the signed root behind the log and nothing has repaired it. */
  lagPending: boolean;
  /** P1-26: the tree the signed root uses; null when no signed root parsed. */
  algorithm: MerkleAlgorithm | null;
  /** P1-26: the signed legacy-to-RFC 9162 migration record, when the log was migrated. */
  migration: MerkleMigrationRecord | null;
}

/** The migration record, checked against the log's first `leafCount` entries under both trees. */
function verifyMerkleMigration(workspace: string, entryHashes: readonly string[], errors: string[]): MerkleMigrationRecord | null {
  if (!pathExists(merkleMigrationPath(workspace))) {
    return null;
  }
  const signed = readSignedRow(workspace, merkleMigrationPath(workspace), merkleMigrationSigPath(workspace), merkleMigrationSchema, "merkle migration record");
  errors.push(...signed.errors);
  const record = signed.row;
  if (record === null) {
    return null;
  }
  const prefix = entryHashes.slice(0, record.leafCount);
  if (record.leafCount > entryHashes.length || (prefix[prefix.length - 1] ?? "") !== record.lastEntryHash) {
    errors.push(`merkle migration record does not cover the log's first ${record.leafCount} entries`);
  } else if (entryTreeRoot("amc-legacy-v1", prefix) !== record.legacyRoot || entryTreeRoot("rfc9162-sha256", prefix) !== record.rfc9162Root) {
    errors.push("merkle migration record roots do not match the log");
  }
  return record;
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
  // One read: the signature is checked over the bytes the row was parsed from.
  const signed = readSignedCurrentRoot(workspace);
  errors.push(...signed.errors);
  const currentRoot = signed.row;
  if (!currentRoot) {
    return { ok: false, errors, root: null, leafCount: 0, lagPending: pending !== null, algorithm: null, migration: null };
  }
  const algorithm = currentRoot.algorithm ?? "amc-legacy-v1";
  // Recomputed from the log, never taken from the stored row — this is the
  // check that catches a root which lags, was rolled back, or was written by
  // someone else's tree. A log line that no longer parses used to throw out of
  // here, past callers that expect a result object (verifyAll, the studio
  // endpoint, the certificate gate); an unreadable log is a verification
  // failure to report, not an exception to leak.
  let entryHashes: string[] = [];
  try {
    entryHashes = readTransparencyEntryHashes(workspace);
    const expected = entryTreeRoot(algorithm, entryHashes);
    if (expected !== currentRoot.root) {
      errors.push(`merkle root mismatch: expected ${expected}, found ${currentRoot.root}`);
    }
    // The signed row also CLAIMS a leaf count and a last entry hash. Checking
    // only the root leaves those claims unverified, and the legacy tree duplicates a
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
  const migration = verifyMerkleMigration(workspace, entryHashes, errors);
  // Sticky: after a migration (a signed record, or a seal naming RFC 9162), a legacy root is a downgrade.
  if (algorithm === "amc-legacy-v1" && (migration !== null || sealedTreeAlgorithm(workspace) === "rfc9162-sha256")) {
    errors.push("merkle root uses amc-legacy-v1 but the log moved to rfc9162-sha256; a legacy root is refused after migration");
  }
  return {
    ok: errors.length === 0,
    errors,
    root: currentRoot.root,
    leafCount: entryHashes.length,
    lagPending: pending !== null,
    algorithm,
    migration
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

/** An inclusion proof in the workspace's tree; RFC 9162 proofs also carry `algorithm` and `treeSize` (P1-26). */
export function generateTransparencyInclusionProof(workspace: string, entryHash: string): MerkleProofPayload {
  const entryHashes = readTransparencyEntryHashes(workspace);
  const index = entryHashes.indexOf(entryHash);
  if (index < 0) {
    throw new Error(`entry hash not found in transparency log: ${entryHash}`);
  }
  const algorithm = currentTreeAlgorithm(workspace);
  const proof = entryInclusionProof(algorithm, entryHashes, index);
  return merkleProofPayloadSchema.parse({
    v: 1,
    ts: Date.now(),
    entryHash,
    leafIndex: index,
    merkleRoot: proof.root,
    proofPath: proof.proofPath,
    rootSignatureFingerprint: rootSignatureFingerprint(workspace),
    ...(algorithm === "rfc9162-sha256" ? { algorithm, treeSize: entryHashes.length } : {})
  });
}

export function exportTransparencyProofBundle(params: {
  workspace: string;
  entryHash: string;
  outFile: string;
}): { outFile: string; proof: MerkleProofPayload } {
  const proof = generateTransparencyInclusionProof(params.workspace, params.entryHash);
  // P1-26: the bundle carries the signed root its verifier takes the tree and tree size from, so it must be that root.
  const rootBytes = readFileSync(merkleCurrentRootPath(params.workspace));
  const signedRow = merkleRootRowSchema.parse(JSON.parse(rootBytes.toString("utf8")) as unknown);
  if (signedRow.root !== proof.merkleRoot || (signedRow.algorithm ?? "amc-legacy-v1") !== (proof.algorithm ?? "amc-legacy-v1")) {
    throw new Error("the proof's root is not the signed current root; run `amc transparency merkle rebuild` first");
  }
  const tmp = mkdtempSync(join(tmpdir(), "amc-proof-"));
  try {
    writeFileAtomic(join(tmp, "proof.json"), JSON.stringify(proof, null, 2), 0o644);
    writeFileAtomic(join(tmp, "root.json"), rootBytes, 0o644);
    writeFileAtomic(join(tmp, "root.sig"), readFileSync(merkleCurrentRootSigPath(params.workspace)), 0o644);
    // P1-26: the newest public anchor, with the consistency proof from its tree to the signed root. A log that no
    // longer extends what it anchored was rewritten: say so instead of exporting without the anchor.
    const anchor = proof.algorithm === "rfc9162-sha256" ? latestAnchorFiles(params.workspace) : null;
    if (anchor) {
      const leaves = readTransparencyEntryHashes(params.workspace).slice(0, signedRow.leafCount).map((hash) => entryLeafHash("rfc9162-sha256", hash));
      if (anchor.treeSize > leaves.length || rootHash(leaves.slice(0, anchor.treeSize)) !== anchor.rootHash) {
        throw new Error(`the log no longer extends its publicly anchored tree of ${anchor.treeSize} leaves`);
      }
      writeFileAtomic(join(tmp, "anchor.note"), anchor.note, 0o644);
      writeFileAtomic(join(tmp, "anchor.receipt.json"), anchor.receipt, 0o644);
      writeFileAtomic(join(tmp, "anchor.consistency.json"), JSON.stringify({ hashes: consistencyProof(leaves, anchor.treeSize) }, null, 2), 0o644);
    }
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

/**
 * The tree and size a proof bundle is checked under (P1-26), from its signed root.json, never from proof.json. A
 * bundle without root.json predates P1-26 and is checked as amc-legacy-v1 only; a proof naming another tree than its
 * signed root fails.
 */
function bundledRootTree(dir: string, proof: MerkleProofPayload, check: (file: string, digest: string, sig: z.infer<typeof rootSignatureSchema>) => boolean,
  errors: string[]): { algorithm: MerkleAlgorithm; treeSize: number | undefined; root: string } {
  const rootFile = join(dir, "root.json");
  const sigFile = join(dir, "root.sig");
  let tree: { algorithm: MerkleAlgorithm; treeSize: number | undefined; root: string } = { algorithm: "amc-legacy-v1", treeSize: undefined, root: proof.merkleRoot };
  if (pathExists(rootFile) || pathExists(sigFile)) {
    try {
      const bytes = readFileSync(rootFile);
      const row = merkleRootRowSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      const sig = rootSignatureSchema.parse(JSON.parse(readUtf8(sigFile)) as unknown);
      const digest = sha256Hex(bytes);
      if (digest !== sig.digestSha256 || !check("root.sig", digest, sig)) errors.push("signed root signature invalid");
      if (row.root !== proof.merkleRoot) errors.push(`proof root ${proof.merkleRoot} is not the signed root ${row.root}`);
      tree = { algorithm: row.algorithm ?? "amc-legacy-v1", treeSize: row.leafCount, root: row.root };
    } catch {
      // P0-51: a fixed message; the error text names temp paths and tells a missing file from a malformed one.
      errors.push("invalid signed root in the bundle");
      return { algorithm: "rfc9162-sha256", treeSize: undefined, root: proof.merkleRoot };
    }
  }
  if ((proof.algorithm ?? "amc-legacy-v1") !== tree.algorithm) {
    errors.push(`proof names ${proof.algorithm ?? "amc-legacy-v1"}, but its signed root is ${tree.algorithm}`);
  }
  if (tree.algorithm === "rfc9162-sha256" && proof.treeSize !== tree.treeSize) {
    errors.push(`proof tree size ${String(proof.treeSize)} is not the signed root's ${String(tree.treeSize)}`);
  }
  return tree;
}

/**
 * auditor.pub, the envelope key and --pubkey only locate the signer of proof.json (which names the Merkle root the path
 * must resolve to) and of root.json; admitKey decides whether it is pinned for artifact-seal (P0-51).
 */
export function verifyTransparencyProofBundle(bundleFile: string, trust: TrustContext, pubkeyPem?: string | null): {
  ok: boolean;
  errors: string[];
  proof: MerkleProofPayload | null;
  report: VerifierReportV1;
} {
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let proof: MerkleProofPayload | null = null;
  let publicAnchoring: PublicAnchoring | undefined;
  let bundleSha256 = "0".repeat(64);
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "transparency-proof", path: bundleFile, sha256: bundleSha256 },
      context: trust, integrityErrors: errors, signatures,
      anchoring: { status: "not-applicable", detail: null, ...(publicAnchoring ? { public: publicAnchoring } : {}) } });
    return { ok: report.trusted, errors, proof, report };
  };
  const tmp = mkdtempSync(join(tmpdir(), "amc-proof-verify-"));
  try {
    tarExtract(bundleFile, tmp);
    // P0-51: only a bundle that extracted is hashed, so a failed one never hashes (or reads on from) an arbitrary file.
    bundleSha256 = fileSha256(bundleFile);
    const files = readdirSync(tmp, { withFileTypes: true });
    const root = files.find((entry) => entry.isDirectory()) ? join(tmp, files.find((entry) => entry.isDirectory())!.name) : tmp;
    const proofFile = join(root, "proof.json");
    const sigFile = join(root, "proof.sig");
    const pubFile = join(root, "auditor.pub");
    if (!pathExists(proofFile) || !pathExists(sigFile) || !pathExists(pubFile)) {
      errors.push("proof bundle missing required files");
      return finish();
    }
    const proofBytes = readFileSync(proofFile);
    try {
      proof = merkleProofPayloadSchema.parse(JSON.parse(proofBytes.toString("utf8")) as unknown);
    } catch (error) {
      errors.push(`invalid proof.json: ${String(error)}`);
    }
    const candidates = [pubkeyPem, readUtf8(pubFile)];
    const signedBy = (name: string, digest: string, sig: z.infer<typeof rootSignatureSchema>): boolean => {
      const check = checkDigestSignature({ signature: name, purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature,
        candidates: [...candidates, envelopePublicKey(sig.envelope)], context: trust, claimedSignedAt: sig.signedTs });
      signatures.push(check.admission);
      return check.verified && (sig.envelope === undefined || sig.signature === sig.envelope.sigB64);
    };
    try {
      const sig = merkleProofSignatureSchema.parse(JSON.parse(readUtf8(sigFile)) as unknown);
      const digest = sha256Hex(proofBytes);
      if (digest !== sig.digestSha256) {
        errors.push("proof signature digest mismatch");
      } else if (!signedBy("proof.sig", digest, sig)) {
        errors.push("proof signature invalid");
      }
    } catch (error) {
      errors.push(`invalid proof.sig: ${String(error)}`);
    }
    if (proof) {
      const tree = bundledRootTree(root, proof, signedBy, errors);
      if (!verifyEntryInclusion({ algorithm: tree.algorithm, entryHash: proof.entryHash, leafIndex: proof.leafIndex,
        treeSize: tree.treeSize, proofPath: proof.proofPath, root: proof.merkleRoot })) {
        errors.push("proof path does not resolve to merkle root");
      }
      // P1-26: an invalid public anchor is an integrity failure, never a quiet "not anchored".
      const anchor = verifyBundledAnchor({ dir: root, tree, leafIndex: proof.leafIndex, trust, candidates });
      if (anchor.admission) signatures.push(anchor.admission);
      if (anchor.publicAnchoring.status === "invalid") errors.push(`public anchor invalid: ${anchor.publicAnchoring.detail ?? ""}`);
      publicAnchoring = anchor.publicAnchoring;
    }
    return finish();
  } catch {
    // P0-51: never the error text, which names server paths and tells missing, unreadable and malformed files apart.
    errors.push("UNREADABLE: cannot read proof bundle");
    return finish();
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
  algorithm: MerkleAlgorithm;
}): TransparencyMerkleUpdate | null {
  const state = readMerkleFrontierState(params.workspace);
  if (!state) {
    return null;
  }
  const { algorithm } = params;
  const blocker = frontierResumeBlocker({
    state,
    expectedPrevEntryHash: params.prevEntryHash,
    leavesBytes: leavesFileBytes(params.workspace),
    algorithm
  });
  if (blocker !== null) {
    return { mode: "rebuild", reason: blocker, leafCount: 0, root: "" };
  }
  const frontier: MerkleFrontier = appendLeafToFrontier(state.frontier, params.entryHash, algorithm);
  const leafCount = state.leafCount + 1;
  const root = frontierRoot(frontier, algorithm);
  appendIndexRow(merkleLeavesPath(params.workspace), merkleLeafLine(params.entryHash, state.leafCount, algorithm));
  // Publish before advancing the resume state, so the frontier only ever
  // describes a root that is actually signed on disk. If signing fails here the
  // frontier stays behind, its recorded leaves.jsonl size no longer matches, and
  // the next append rebuilds rather than resuming from a state whose root was
  // never published.
  publishRoot({ workspace: params.workspace, leafCount, root, lastEntryHash: params.entryHash, algorithm });
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
  /** `algorithm`: what currentTreeAlgorithm said just before the append (appendTransparencyEntry passes it). */
  appended: { entryHash: string; prevEntryHash: string; algorithm?: MerkleAlgorithm }
): TransparencyMerkleUpdate {
  try {
    const incremental = applyIncrementalAppend({
      workspace,
      entryHash: appended.entryHash,
      prevEntryHash: appended.prevEntryHash,
      algorithm: appended.algorithm ?? currentTreeAlgorithm(workspace)
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
