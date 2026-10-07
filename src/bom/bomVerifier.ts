import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { maturityBomSchema, type MaturityBom } from "./bomSchema.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, untrustedReasons, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";

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

function loadBom(file: string): MaturityBom {
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

/**
 * --pubkey, the current workspace's auditor key history and the key the envelope carries only locate the signer;
 * admitKey decides whether it is pinned for artifact-seal (P0-51). A workspace or embedded key never vouches by being there.
 */
export function verifyBomSignature(params: {
  workspace: string;
  inputFile: string;
  sigFile: string;
  pubkeyPemFile?: string;
  trust: TrustContext;
}): { ok: boolean; reason?: string; bom: MaturityBom | null; signature: BomSignature | null; report: VerifierReportV1 } {
  const inputFile = resolve(params.workspace, params.inputFile);
  const sigFile = resolve(params.workspace, params.sigFile);
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let bom: MaturityBom | null = null;
  let signature: BomSignature | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "maturity-bom", path: inputFile, sha256: fileSha256(inputFile) },
      context: params.trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, reason: report.trusted ? undefined : untrustedReasons(report).join("; "), bom, signature, report };
  };
  if (!pathExists(inputFile)) {
    errors.push("bom file missing");
    return finish();
  }
  if (!pathExists(sigFile)) {
    errors.push("bom signature file missing");
    return finish();
  }
  try {
    bom = loadBom(inputFile);
    signature = bomSignatureSchema.parse(JSON.parse(readFileSync(sigFile, "utf8")) as unknown);
    const digest = sha256Hex(readFileSync(inputFile));
    if (digest !== signature.bomSha256) {
      errors.push("bom digest mismatch");
      return finish();
    }
    const workspaceKeys = pathExists(join(params.workspace, ".amc", "keys", "auditor_ed25519.pub")) ? getPublicKeyHistory(params.workspace, "auditor") : [];
    const check = checkDigestSignature({ signature: "bom.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: signature.signature,
      candidates: [params.pubkeyPemFile ? readFileSync(resolve(params.workspace, params.pubkeyPemFile), "utf8") : null,
        ...workspaceKeys, envelopePublicKey(signature.envelope)],
      context: params.trust, claimedSignedAt: signature.signedTs });
    signatures.push(check.admission);
    if (!check.verified || (signature.envelope !== undefined && signature.signature !== signature.envelope.sigB64)) {
      errors.push("signature verification failed");
    }
  } catch (error) {
    errors.push(String(error));
  }
  return finish();
}
