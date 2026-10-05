import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { maturityBomSchema, type MaturityBom } from "./bomSchema.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { signDigestWithPolicy, verifySignedDigest } from "../crypto/signing/signer.js";

const bomSignatureSchema = z.object({
  v: z.literal(1),
  bomSha256: z.string().length(64),
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

export type BomSignature = z.infer<typeof bomSignatureSchema>;

export function loadBom(file: string): MaturityBom {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return maturityBomSchema.parse(parsed);
}

export function signBomFile(params: {
  workspace: string;
  inputFile: string;
  outputSigFile?: string;
}): { sigFile: string; signature: BomSignature } {
  const inputFile = resolve(params.workspace, params.inputFile);
  if (!pathExists(inputFile)) {
    throw new Error(`BOM file not found: ${inputFile}`);
  }
  const bytes = readFileSync(inputFile);
  const digest = sha256Hex(bytes);
  const signed = signDigestWithPolicy({
    workspace: params.workspace,
    kind: "BOM",
    digestHex: digest
  });
  const signature = bomSignatureSchema.parse({
    v: 1,
    bomSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  const sigFile = resolve(params.workspace, params.outputSigFile ?? `${inputFile}.sig`);
  ensureDir(dirname(sigFile));
  writeFileAtomic(sigFile, JSON.stringify(signature, null, 2), 0o644);
  const bom = loadBom(inputFile);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "BOM_SIGNED",
    agentId: bom.agentId,
    artifact: {
      kind: "bom",
      sha256: signature.bomSha256,
      id: bom.runId
    }
  });
  return {
    sigFile,
    signature
  };
}

export function verifyBomSignature(params: {
  workspace: string;
  inputFile: string;
  sigFile: string;
  pubkeyPemFile?: string;
}): { ok: boolean; reason?: string; bom: MaturityBom | null; signature: BomSignature | null } {
  const inputFile = resolve(params.workspace, params.inputFile);
  const sigFile = resolve(params.workspace, params.sigFile);
  if (!pathExists(inputFile)) {
    return { ok: false, reason: "bom file missing", bom: null, signature: null };
  }
  if (!pathExists(sigFile)) {
    return { ok: false, reason: "bom signature file missing", bom: null, signature: null };
  }
  try {
    const bom = loadBom(inputFile);
    const signature = bomSignatureSchema.parse(JSON.parse(readFileSync(sigFile, "utf8")) as unknown);
    const digest = sha256Hex(readFileSync(inputFile));
    if (digest !== signature.bomSha256) {
      return {
        ok: false,
        reason: "bom digest mismatch",
        bom,
        signature
      };
    }
    const keys = params.pubkeyPemFile
      ? [readFileSync(resolve(params.workspace, params.pubkeyPemFile), "utf8")]
      : getPublicKeyHistory(params.workspace, "auditor");
    const ok = verifySignedDigest({
      workspace: params.workspace,
      digestHex: digest,
      signed: {
        signature: signature.signature,
        envelope: signature.envelope
      }
    }) || verifyHexDigestAny(digest, signature.signature, keys);
    return {
      ok,
      reason: ok ? undefined : "signature verification failed",
      bom,
      signature
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(error),
      bom: null,
      signature: null
    };
  }
}
