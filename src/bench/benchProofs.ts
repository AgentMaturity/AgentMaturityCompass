import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { readTransparencyEntries } from "../transparency/logChain.js";
import { generateTransparencyInclusionProof, verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { verifyMerkleProof } from "../transparency/merkle.js";
import type { IssuerAdmission, TrustContext, VerifierReportV1 } from "../trust/index.js";
import { checkDigestSignature, envelopePublicKey } from "../trust/signatureCheck.js";

export interface BenchInclusionProof {
  v: 1;
  proofId: string;
  eventHash: string;
  rootHash: string;
  merklePath: Array<{ position: "left" | "right"; hash: string }>;
  verifiedBy: "amc";
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
        verifiedBy: "amc"
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

export function verifyBenchProofBundle(bundle: BenchProofBundle): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const proof of bundle.proofs) {
    const valid = verifyMerkleProof({
      entryHash: proof.eventHash,
      proofPath: proof.merklePath,
      root: proof.rootHash
    });
    if (!valid) {
      errors.push(`invalid inclusion proof: ${proof.proofId}`);
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
}): { errors: string[]; admission: IssuerAdmission | null; anchoring: VerifierReportV1["anchoring"] } {
  const errors = params.proofs
    .filter((proof) => !verifyMerkleProof({ entryHash: proof.eventHash, proofPath: proof.merklePath, root: proof.rootHash }))
    .map((proof) => `invalid inclusion proof: ${proof.proofId}`);
  if (params.proofs.length === 0) return { errors, admission: null, anchoring: { status: "not-applicable", detail: "no inclusion proofs" } };
  const rootPath = join(params.root, "proofs", "merkle.root.json");
  const sigPath = join(params.root, "proofs", "merkle.root.sig");
  if (!pathExists(rootPath) || !pathExists(sigPath)) {
    return { errors, admission: null, anchoring: { status: "unanchored", detail: "inclusion proofs without a signed proofs/merkle.root.json" } };
  }
  const digest = sha256Hex(readFileSync(rootPath));
  const sig = JSON.parse(readUtf8(sigPath)) as { digestSha256?: unknown; signature?: unknown; envelope?: unknown };
  if (sig.digestSha256 !== digest) errors.push("signed merkle root digest mismatch");
  const check = checkDigestSignature({ signature: "proofs/merkle.root.sig", purpose: "artifact-seal", digestHex: digest,
    signatureB64: String(sig.signature ?? ""), candidates: [...params.candidates, envelopePublicKey(sig.envelope)], context: params.trust });
  if (!check.verified) errors.push("signed merkle root signature invalid");
  const signedRoot = (JSON.parse(readUtf8(rootPath)) as { root?: unknown }).root;
  const unbound = params.proofs.filter((proof) => proof.rootHash !== signedRoot);
  errors.push(...unbound.map((proof) => `inclusion proof ${proof.proofId} does not resolve to the signed merkle root`));
  const anchored = check.verified && unbound.length === 0;
  return { errors, admission: check.admission, anchoring: anchored
    ? { status: "anchored", detail: `inclusion proofs resolve to signed merkle root ${String(signedRoot)}` }
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
