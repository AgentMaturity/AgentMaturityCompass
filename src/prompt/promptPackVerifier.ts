import { readFileSync } from "node:fs";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, workspaceSelfTrust, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { inspectPromptPackArtifact } from "./promptPackArtifact.js";
import { digestPromptPack } from "./promptPackSigner.js";

export interface PromptPackVerifyResult {
  ok: boolean;
  errors: string[];
  packId: string | null;
  templateId: string | null;
  lintStatus: "PASS" | "FAIL" | "MISSING";
  report: VerifierReportV1;
}

/**
 * Verifies a .amcprompt offline. signer.pub, the signature envelope and --pubkey only locate the signer: pack.sig and
 * lint/lint.sig need a key the trust context admits for artifact-seal (P0-09). ok equals report.trusted.
 */
export function verifyPromptPackFile(params: {
  file: string;
  publicKeyPath?: string;
  trust: TrustContext;
}): PromptPackVerifyResult {
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let found: Pick<PromptPackVerifyResult, "packId" | "templateId" | "lintStatus"> = { packId: null, templateId: null, lintStatus: "MISSING" };
  const finish = (): PromptPackVerifyResult => {
    const report = buildVerifierReport({ artifact: { kind: "prompt-pack", path: params.file, sha256: fileSha256(params.file) }, context: params.trust,
      integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, ...found, report };
  };
  const sidecarPath = `${params.file}.sha256`;
  if (pathExists(sidecarPath)) {
    const expected = readUtf8(sidecarPath).trim();
    const actual = sha256Hex(readFileSync(params.file));
    if (expected !== actual) {
      errors.push("pack sha256 sidecar mismatch");
    }
  }
  try {
    const inspected = inspectPromptPackArtifact(params.file);
    const candidates = [params.publicKeyPath ? readUtf8(params.publicKeyPath) : null, inspected.signerPub, envelopePublicKey(inspected.signature.envelope)];
    const digest = digestPromptPack(inspected.pack);
    const check = checkDigestSignature({ signature: "pack.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: inspected.signature.signature,
      candidates, context: params.trust, claimedSignedAt: inspected.signature.signedTs });
    signatures.push(check.admission);
    if (digest !== inspected.signature.digestSha256) {
      errors.push("pack signature digest mismatch");
    } else if (!check.verified || (inspected.signature.envelope !== undefined && inspected.signature.signature !== inspected.signature.envelope.sigB64)) {
      errors.push("pack signature verification failed");
    }

    const lintStatus = inspected.lint?.status ?? "MISSING";
    if (inspected.lint) {
      const lint = verifyPromptSignatureObject({ digestHex: inspected.lintDigestSha256 ?? "", signature: inspected.lintSignature, candidates, trust: params.trust });
      if (lint.admission) signatures.push(lint.admission);
      if (!inspected.lintSignature) {
        errors.push("lint signature missing");
      } else if (!inspected.lintDigestSha256 || !lint.verified) {
        errors.push("lint signature verification failed");
      }
      if (lintStatus === "FAIL") {
        errors.push("prompt lint status FAIL");
      }
    }

    if (inspected.providerFiles.openai.systemMessage.length === 0) {
      errors.push("provider/openai.json missing system message");
    }
    if (inspected.providerFiles.anthropic.system.length === 0) {
      errors.push("provider/anthropic.json missing system");
    }
    if (inspected.providerFiles.gemini.systemInstruction.length === 0) {
      errors.push("provider/gemini.json missing systemInstruction");
    }

    found = { packId: inspected.pack.packId, templateId: inspected.pack.templateId, lintStatus };
    return finish();
  } catch (error) {
    errors.push(String(error));
    return finish();
  }
}

/** A workspace's own prompt pack, checked with its own keys: a self-check, labelled workspace-self (P0-09). */
export function verifyWorkspacePromptPack(workspace: string, file: string): PromptPackVerifyResult {
  return verifyPromptPackFile({ file, trust: workspaceSelfTrust(workspace) });
}

function verifyPromptSignatureObject(params: {
  digestHex: string;
  signature: unknown;
  candidates: ReadonlyArray<string | null>;
  trust: TrustContext;
}): { verified: boolean; admission: IssuerAdmission | null } {
  const parsed = orgSignatureSchema.safeParse(params.signature);
  if (!parsed.success) {
    return { verified: false, admission: null };
  }
  const check = checkDigestSignature({ signature: "lint/lint.sig", purpose: "artifact-seal", digestHex: params.digestHex, signatureB64: parsed.data.signature,
    candidates: [...params.candidates, envelopePublicKey(parsed.data.envelope)], context: params.trust, claimedSignedAt: parsed.data.signedTs });
  const envelopeMatches = parsed.data.envelope === undefined || parsed.data.signature === parsed.data.envelope.sigB64;
  return { verified: check.verified && envelopeMatches, admission: check.admission };
}
