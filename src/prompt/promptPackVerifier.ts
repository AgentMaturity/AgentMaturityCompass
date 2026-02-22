import { readFileSync } from "node:fs";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { inspectPromptPackArtifact } from "./promptPackArtifact.js";
import { digestPromptPack, verifyPromptPackDigestSignature } from "./promptPackSigner.js";

export interface PromptPackVerifyResult {
  ok: boolean;
  errors: string[];
  packId: string | null;
  templateId: string | null;
  lintStatus: "PASS" | "FAIL" | "MISSING";
}

export function verifyPromptPackFile(params: {
  file: string;
  publicKeyPath?: string;
}): PromptPackVerifyResult {
  const errors: string[] = [];
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
    const digest = digestPromptPack(inspected.pack);
    if (digest !== inspected.signature.digestSha256) {
      errors.push("pack signature digest mismatch");
    } else {
      const ok = verifyPromptPackDigestSignature({
        digestHex: digest,
        signature: inspected.signature,
        publicKeyPem: inspected.signerPub
      });
      if (!ok) {
        errors.push("pack signature verification failed");
      }
    }

    const lintStatus = inspected.lint?.status ?? "MISSING";
    if (inspected.lint) {
      if (!inspected.lintSignature) {
        errors.push("lint signature missing");
      } else if (
        !inspected.lintDigestSha256 ||
        !verifyPromptSignatureObject({
          digestHex: inspected.lintDigestSha256,
          signature: inspected.lintSignature,
          signerPub: inspected.signerPub
        })
      ) {
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

    return {
      ok: errors.length === 0,
      errors,
      packId: inspected.pack.packId,
      templateId: inspected.pack.templateId,
      lintStatus
    };
  } catch (error) {
    return {
      ok: false,
      errors: [String(error)],
      packId: null,
      templateId: null,
      lintStatus: "MISSING"
    };
  }
}

export function verifyPromptSignatureObject(params: {
  digestHex: string;
  signature: unknown;
  signerPub: string;
}): boolean {
  const parsed = orgSignatureSchema.safeParse(params.signature);
  if (!parsed.success) {
    return false;
  }
  if (parsed.data.envelope) {
    try {
      if (parsed.data.signature !== parsed.data.envelope.sigB64) {
        return false;
      }
      return verifySignatureEnvelope(params.digestHex, parsed.data.envelope, {
        trustedPublicKeys: [params.signerPub],
        requireTrustedKey: true
      });
    } catch {
      return false;
    }
  }
  return verifyHexDigestAny(params.digestHex, parsed.data.signature, [params.signerPub]);
}
