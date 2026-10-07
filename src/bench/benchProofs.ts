import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { readTransparencyEntries } from "../transparency/logChain.js";
import { generateTransparencyInclusionProof, verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { verifyEntryInclusion, type MerkleAlgorithm } from "../transparency/merkle.js";
import type { IssuerAdmission, TrustContext, VerifierReportV1 } from "../trust/index.js";
import { checkDigestSignature, envelopePublicKey } from "../trust/signatureCheck.js";

export interface BenchInclusionProof {
  v: 1;
  proofId: string;
  eventHash: string;
  rootHash: string;
  merklePath: Array<{ position: "left" | "right"; hash: string }>;
  verifiedBy: "amc";
  /** P1-26: RFC 9162 proofs name their tree and carry the leaf index and tree size; absent means amc-legacy-v1. */
  algorithm?: MerkleAlgorithm;
  leafIndex?: number;
  treeSize?: number;
}

export interface BenchProofBundle {
  transparencyRoot: {
    seal: unknown;
    signature: unknown;
    sha256: string;
  } | null;
  merkleRoot: {
    root: unknown;
    signature: unknown;
    sha256: string;
  } | null;
  proofs: BenchInclusionProof[];
}

function transparencySealPaths(workspace: string): {
  sealPath: string;
  sigPath: string;
} {
  return {
    sealPath: join(workspace, ".amc", "transparency", "log.seal.json"),
    sigPath: join(workspace, ".amc", "transparency", "log.seal.sig")
  };
}

function merkleRootPaths(workspace: string): {
  rootPath: string;
  sigPath: string;
} {
  return {
    rootPath: join(workspace, ".amc", "transparency", "merkle", "current.root.json"),
    sigPath: join(workspace, ".amc", "transparency", "merkle", "current.root.sig")
  };
}

function loadJsonIfExists(path: string): unknown | null {
  if (!pathExists(path)) {
    return null;
  }
  return JSON.parse(readUtf8(path)) as unknown;
}

export function buildBenchProofs(params: {
  workspace: string;
  includeEventKinds: string[];
  maxProofs?: number;
}): BenchProofBundle {
  const entries = readTransparencyEntries(params.workspace)
    .filter((entry) => params.includeEventKinds.includes(entry.type))
    .sort((a, b) => b.ts - a.ts);
  const limit = Math.max(0, params.maxProofs ?? 30);
  const selected = entries.slice(0, limit);
  const proofs: BenchInclusionProof[] = [];
  for (const entry of selected) {
    try {
      const generated = generateTransparencyInclusionProof(params.workspace, entry.hash);
      proofs.push({
        v: 1,
        proofId: `inc_${generated.entryHash.slice(0, 16)}`,
        eventHash: generated.entryHash,
        rootHash: generated.merkleRoot,
        merklePath: generated.proofPath,
        verifiedBy: "amc",
        ...(generated.algorithm ? { algorithm: generated.algorithm, leafIndex: generated.leafIndex, treeSize: generated.treeSize } : {})
      });
    } catch {
      // Keep export robust if proof cannot be generated for a specific entry.
    }
  }

  const transparency = transparencySealPaths(params.workspace);
  const merkle = merkleRootPaths(params.workspace);
  const transparencySeal = loadJsonIfExists(transparency.sealPath);
  const transparencySig = loadJsonIfExists(transparency.sigPath);
  const merkleRoot = loadJsonIfExists(merkle.rootPath);
  const merkleSig = loadJsonIfExists(merkle.sigPath);

  return {
    transparencyRoot:
      transparencySeal && transparencySig
        ? {
            seal: transparencySeal,
            signature: transparencySig,
            sha256: sha256Hex(readFileSync(transparency.sealPath))
          }
        : null,
    merkleRoot:
      merkleRoot && merkleSig
        ? {
            root: merkleRoot,
            signature: merkleSig,
            sha256: sha256Hex(readFileSync(merkle.rootPath))
          }
        : null,
    proofs
  };
}

/**
 * Checks each proof's Merkle path and, when the bundle carries its signed merkle root, that every proof resolves to
 * that root rather than to a root the proof names for itself (P0-09). The root's signature is the caller's to check
 * under a trust context; verifyProofsAgainstSignedRoot does both. P1-26: the tree and the RFC 9162 tree size come
 * from the signed root, never from a proof, and a proof naming another tree fails; without a signed root only the
 * legacy tree is checked, so an RFC 9162 proof cannot pick its own tree size.
 */
export function verifyBenchProofBundle(bundle: BenchProofBundle): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const signedRow = bundle.merkleRoot ? bundle.merkleRoot.root as { root?: unknown; leafCount?: unknown; algorithm?: unknown } | null : null;
  const signedRoot = signedRow?.root;
  const algorithm: MerkleAlgorithm = signedRow?.algorithm === "rfc9162-sha256" ? "rfc9162-sha256" : "amc-legacy-v1";
  for (const proof of bundle.proofs) {
    if ((proof.algorithm ?? "amc-legacy-v1") !== algorithm || (signedRow && signedRow.algorithm !== undefined && signedRow.algorithm !== algorithm)) {
      errors.push(`inclusion proof ${proof.proofId} names ${proof.algorithm ?? "amc-legacy-v1"}, but the signed merkle root is ${String(signedRow?.algorithm ?? "amc-legacy-v1")}`);
    }
    const valid = verifyEntryInclusion({
      algorithm,
      entryHash: proof.eventHash,
      leafIndex: proof.leafIndex,
      treeSize: typeof signedRow?.leafCount === "number" ? signedRow.leafCount : undefined,
      proofPath: proof.merklePath,
      root: proof.rootHash
    });
    if (!valid) {
      errors.push(`invalid inclusion proof: ${proof.proofId}`);
    }
    if (bundle.merkleRoot && proof.rootHash !== signedRoot) {
      errors.push(`inclusion proof ${proof.proofId} does not resolve to the signed merkle root`);
    }
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * P0-09: inclusion proofs count only against the signed proofs/merkle.root.json an artifact carries. The root's
 * signature needs a key the trust context admits for artifact-seal, and every proof must resolve to that signed root,
 * never to a root the proof file names for itself. Proofs without a signed root leave the artifact unanchored.
 */
export function verifyProofsAgainstSignedRoot(params: {
  root: string;
  proofs: readonly BenchInclusionProof[];
  trust: TrustContext;
  candidates: ReadonlyArray<string | null | undefined>;
  /** The artifact's claimed signing time, which the root signature shares. */
  claimedSignedAt?: number | null;
}): { errors: string[]; admission: IssuerAdmission | null; anchoring: VerifierReportV1["anchoring"] } {
  const rootPath = join(params.root, "proofs", "merkle.root.json");
  const sigPath = join(params.root, "proofs", "merkle.root.sig");
  if (params.proofs.length === 0 || !pathExists(rootPath) || !pathExists(sigPath)) {
    const { errors } = verifyBenchProofBundle({ transparencyRoot: null, merkleRoot: null, proofs: [...params.proofs] });
    return { errors, admission: null, anchoring: params.proofs.length === 0
      ? { status: "not-applicable", detail: "no inclusion proofs" }
      : { status: "unanchored", detail: "inclusion proofs without a signed proofs/merkle.root.json" } };
  }
  const digest = sha256Hex(readFileSync(rootPath));
  const sig = JSON.parse(readUtf8(sigPath)) as { digestSha256?: unknown; signature?: unknown; envelope?: unknown };
  const signedRoot = JSON.parse(readUtf8(rootPath)) as { root?: unknown };
  const bound = verifyBenchProofBundle({ transparencyRoot: null, merkleRoot: { root: signedRoot, signature: sig, sha256: digest }, proofs: [...params.proofs] });
  const errors = [...bound.errors];
  if (sig.digestSha256 !== digest) errors.push("signed merkle root digest mismatch");
  const check = checkDigestSignature({ signature: "proofs/merkle.root.sig", purpose: "artifact-seal", digestHex: digest,
    signatureB64: String(sig.signature ?? ""), candidates: [...params.candidates, envelopePublicKey(sig.envelope)], context: params.trust,
    claimedSignedAt: params.claimedSignedAt ?? null });
  if (!check.verified) errors.push("signed merkle root signature invalid");
  const anchored = check.verified && sig.digestSha256 === digest && bound.ok;
  return { errors, admission: check.admission, anchoring: anchored
    ? { status: "anchored", detail: `inclusion proofs resolve to signed merkle root ${String(signedRoot.root)}` }
    : { status: "unanchored", detail: "inclusion proofs do not resolve to a verified signed merkle root" } };
}

export function writeBenchProofFiles(params: {
  outDir: string;
  bundle: BenchProofBundle;
}): {
  proofIds: string[];
  transparencyRootSha256: string;
  merkleRootSha256: string;
} {
  const proofsDir = join(params.outDir, "proofs");
  const inclDir = join(proofsDir, "inclusion");
  const checksDir = join(params.outDir, "checks");
  const metaDir = join(params.outDir, "meta");
  ensureDir(proofsDir);
  ensureDir(inclDir);
  ensureDir(checksDir);
  ensureDir(metaDir);
  writeFileAtomic(join(metaDir, ".keep"), "", 0o644);
  writeFileAtomic(join(checksDir, ".keep"), "", 0o644);

  let transparencyRootSha256 = "0".repeat(64);
  let merkleRootSha256 = "0".repeat(64);

  if (params.bundle.transparencyRoot) {
    const rootPath = join(proofsDir, "transparency.root.json");
    const sigPath = join(proofsDir, "transparency.root.sig");
    writeFileAtomic(rootPath, JSON.stringify(params.bundle.transparencyRoot.seal, null, 2), 0o644);
    writeFileAtomic(sigPath, JSON.stringify(params.bundle.transparencyRoot.signature, null, 2), 0o644);
    transparencyRootSha256 = sha256Hex(readFileSync(rootPath));
  }
  if (params.bundle.merkleRoot) {
    const rootPath = join(proofsDir, "merkle.root.json");
    const sigPath = join(proofsDir, "merkle.root.sig");
    writeFileAtomic(rootPath, JSON.stringify(params.bundle.merkleRoot.root, null, 2), 0o644);
    writeFileAtomic(sigPath, JSON.stringify(params.bundle.merkleRoot.signature, null, 2), 0o644);
    merkleRootSha256 = sha256Hex(readFileSync(rootPath));
  }

  const proofIds: string[] = [];
  for (const proof of params.bundle.proofs) {
    const proofPath = join(inclDir, `${proof.proofId}.json`);
    writeFileAtomic(proofPath, JSON.stringify(proof, null, 2), 0o644);
    proofIds.push(proof.proofId);
  }
  proofIds.sort((a, b) => a.localeCompare(b));

  return {
    proofIds,
    transparencyRootSha256,
    merkleRootSha256
  };
}

export function transparencyAndMerkleHealthy(workspace: string): boolean {
  const merkle = verifyTransparencyMerkle(workspace);
  return merkle.ok;
}
