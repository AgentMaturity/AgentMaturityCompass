import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { buildMerkleProofFromEntryHashes, buildMerkleRootFromEntryHashes, merkleLeafHash, verifyMerkleProof } from "./merkle.js";
import { transparencyEntrySchema } from "./logSchema.js";
import { merkleProofPayloadSchema, merkleProofSignatureSchema, type MerkleProofPayload } from "./proofSchema.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";

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

function merkleDir(workspace: string): string {
  return join(transparencyDir(workspace), "merkle");
}

function merkleLeavesPath(workspace: string): string {
  return join(merkleDir(workspace), "leaves.jsonl");
}

function merkleRootsPath(workspace: string): string {
  return join(merkleDir(workspace), "roots.jsonl");
}

function currentRootPath(workspace: string): string {
  return join(merkleDir(workspace), "current.root.json");
}

function currentRootSigPath(workspace: string): string {
  return join(merkleDir(workspace), "current.root.sig");
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
  const rootPath = currentRootPath(workspace);
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
  writeFileAtomic(currentRootSigPath(workspace), JSON.stringify(signature, null, 2), 0o644);
}

function tarCreate(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create merkle proof bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to extract merkle proof bundle: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

export function rebuildTransparencyMerkle(workspace: string): {
  leafCount: number;
  root: string;
  currentRootPath: string;
  currentRootSigPath: string;
} {
  ensureDir(merkleDir(workspace));
  const entryHashes = readTransparencyEntryHashes(workspace);
  const root = buildMerkleRootFromEntryHashes(entryHashes);
  const leavesText = entryHashes
    .map((entryHash, index) =>
      JSON.stringify(
        merkleLeafRowSchema.parse({
          v: 1,
          index,
          entryHash,
          leafHash: merkleLeafHash(entryHash)
        })
      )
    )
    .join("\n");
  writeFileAtomic(merkleLeavesPath(workspace), leavesText.length > 0 ? `${leavesText}\n` : "", 0o644);

  const row = merkleRootRowSchema.parse({
    v: 1,
    ts: Date.now(),
    leafCount: entryHashes.length,
    root,
    lastEntryHash: entryHashes[entryHashes.length - 1] ?? ""
  });
  const rootHistoryLine = JSON.stringify(row);
  const currentHistory = pathExists(merkleRootsPath(workspace)) ? readUtf8(merkleRootsPath(workspace)) : "";
  writeFileAtomic(merkleRootsPath(workspace), `${currentHistory}${rootHistoryLine}\n`, 0o644);
  writeCurrentRoot(workspace, row);
  return {
    leafCount: entryHashes.length,
    root,
    currentRootPath: currentRootPath(workspace),
    currentRootSigPath: currentRootSigPath(workspace)
  };
}

export function verifyTransparencyMerkle(workspace: string): {
  ok: boolean;
  errors: string[];
  root: string | null;
  leafCount: number;
} {
  const errors: string[] = [];
  if (!pathExists(currentRootPath(workspace)) || !pathExists(currentRootSigPath(workspace))) {
    errors.push("merkle root or signature missing");
    return {
      ok: false,
      errors,
      root: null,
      leafCount: 0
    };
  }
  let currentRoot: z.infer<typeof merkleRootRowSchema> | null = null;
  try {
    currentRoot = merkleRootRowSchema.parse(JSON.parse(readUtf8(currentRootPath(workspace))) as unknown);
  } catch (error) {
    errors.push(`invalid current.root.json: ${String(error)}`);
  }
  if (!currentRoot) {
    return { ok: false, errors, root: null, leafCount: 0 };
  }
  const digest = sha256Hex(readFileSync(currentRootPath(workspace)));
  try {
    const sig = rootSignatureSchema.parse(JSON.parse(readUtf8(currentRootSigPath(workspace))) as unknown);
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
  const entryHashes = readTransparencyEntryHashes(workspace);
  const expected = buildMerkleRootFromEntryHashes(entryHashes);
  if (expected !== currentRoot.root) {
    errors.push(`merkle root mismatch: expected ${expected}, found ${currentRoot.root}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    root: currentRoot.root,
    leafCount: entryHashes.length
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
  if (!pathExists(currentRootPath(workspace))) {
    return null;
  }
  return merkleRootRowSchema.parse(JSON.parse(readUtf8(currentRootPath(workspace))) as unknown);
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
  if (!pathExists(currentRootPath(workspace)) || !pathExists(currentRootSigPath(workspace))) {
    rebuildTransparencyMerkle(workspace);
  }
}

export function updateTransparencyMerkleAfterAppend(workspace: string): void {
  rebuildTransparencyMerkle(workspace);
}
