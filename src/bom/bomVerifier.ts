import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { maturityBomSchema, type MaturityBom } from "./bomSchema.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { assertOwnerMode } from "../mode/mode.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, untrustedReasons, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";

const bomSignatureSchema = z.object({
  v: z.literal(1),
  bomSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
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

class BomTransparencyPublicationError extends Error {
  readonly code = "BOM_TRANSPARENCY_PUBLICATION_INCOMPLETE";
  constructor(readonly sigFile: string, cause: unknown) {
    super("BOM signature is published; synchronous transparency publication is incomplete", { cause });
    this.name = "BomTransparencyPublicationError";
  }
}

function bomFilesAlias(inputFile: string, sigFile: string): boolean {
  if (sigFile === inputFile) return true;
  if (!pathExists(inputFile) || !pathExists(sigFile)) return false;
  const input = statSync(inputFile), output = statSync(sigFile);
  return input.dev === output.dev && input.ino === output.ino;
}

/** Maintained awaitable owner path. The existing synchronous SDK operation above is unchanged. */
export async function signBomFileAsync(params: Parameters<typeof signBomFile>[0], options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof signBomFile>> {
  const workspace = params.workspace, inputFile = resolve(workspace, params.inputFile);
  const sigFile = resolve(workspace, params.outputSigFile ?? `${inputFile}.sig`), beforePublish = options.beforePublish;
  assertOwnerMode(workspace, "bom sign"); beforePublish?.();
  if (bomFilesAlias(inputFile, sigFile)) throw new Error("BOM signature destination must differ from its input");
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: dirname(sigFile), name: "bom-signature", operation });
  const optionalBytes = (file: string): Buffer | null => pathExists(file) ? readFileSync(file) : null;
  const prepared = locked(() => {
    if (!pathExists(inputFile)) throw new Error("BOM file not found");
    const bytes = readFileSync(inputFile), bom = maturityBomSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
    return { bytes, bom, sidecar: optionalBytes(sigFile), digest: sha256Hex(bytes) };
  });
  const descriptor = describePolicySigner(workspace, "BOM"), policy = JSON.stringify(loadTrustConfig(workspace));
  const captured = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const holder = boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file";
  const signed = await signDigestWithPolicyAsync({ workspace, kind: "BOM", digestHex: prepared.digest, expectedSigner: descriptor });
  const signature = bomSignatureSchema.parse({ v: 1, bomSha256: prepared.digest, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope });
  const sidecarBytes = JSON.stringify(signature, null, 2);
  const published = locked(() => {
    beforePublish?.(); assertOwnerMode(workspace, "bom sign");
    assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy) throw new Error("BOM signing policy changed while signing was prepared");
    if (captured !== null) {
      const envelope = signature.envelope;
      if (envelope === undefined) throw new Error("BOM prepared signature envelope is missing");
      assertPurposePublicationCurrent(workspace, captured, { provider: holder, algorithm: envelope.alg,
        publicKeyPem: descriptor.publicKeyPem, keyId: descriptor.fingerprint, signature: Buffer.from(signature.signature, "base64") });
    }
    if (!readFileSync(inputFile).equals(prepared.bytes)) throw new Error("BOM input changed while signing was prepared");
    const currentSidecar = optionalBytes(sigFile);
    if (prepared.sidecar === null ? currentSidecar !== null : currentSidecar === null || !currentSidecar.equals(prepared.sidecar)) {
      throw new Error("BOM signature destination changed while signing was prepared");
    }
    if (bomFilesAlias(inputFile, sigFile)) throw new Error("BOM signature destination must differ from its input");
    writeFileAtomic(sigFile, sidecarBytes, 0o644);
    return { sigFile, signature };
  });
  // The existing log remains synchronous and runs outside the signature lock; failures do not roll back its sidecar.
  try {
    appendTransparencyEntry({ workspace, type: "BOM_SIGNED", agentId: prepared.bom.agentId,
      artifact: { kind: "bom", sha256: signature.bomSha256, id: prepared.bom.runId } });
  } catch (error) { throw new BomTransparencyPublicationError(sigFile, error); }
  return published;
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
    const check = checkDigestSignature({ signature: "bom.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: signature.signature, envelope: signature.envelope,
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
