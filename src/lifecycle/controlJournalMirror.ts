import { readFileSync, statSync } from "node:fs";
import { describePolicySigner } from "../crypto/signing/signer.js";
import { captureOrgPairsAuthority } from "../org/preparedOrgPairs.js";
import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { artifactSigPath, signArtifactBytes, verifyArtifactBytesSignature } from "./artifactSignature.js";

type MirrorKind = "guardrail-control-state" | "runtime-firewall-policy";
function pair(path: string): string {
  return JSON.stringify([path, artifactSigPath(path)].map(file => pathExists(file)
    ? { sha256: sha256Hex(readFileSync(file)), mode: statSync(file).mode & 0o777 } : null));
}

export function captureControlMirrorPair(path: string): () => void {
  const original = pair(path);
  return () => { if (pair(path) !== original) throw new Error("Control mirror input pair changed."); };
}

/** Internal two-family compatibility publisher. Legacy signing remains synchronous, outside the family lock. */
export function captureControlMirror(workspace: string, path: string, artifactKind: MirrorKind, input: Uint8Array, beforeSign?: () => void) {
  const assertAuthority = captureOrgPairsAuthority(workspace, beforeSign);
  const bytes = Buffer.from(input), original = pair(path), descriptor = describePolicySigner(workspace, "BUNDLE");
  return Object.freeze({ prepare() {
    assertAuthority();
    if (pair(path) !== original) throw new Error("Control mirror signing predecessor changed.");
    const signature = signArtifactBytes({ workspace, artifactKind, bytes: Buffer.from(bytes) });
    const envelope = signatureEnvelopeSchema.parse(signature.envelope);
    if (envelope.sigB64 !== signature.signature || envelope.signedTs !== signature.signedTs
      || envelope.alg !== descriptor.algorithm || envelope.signer.type !== descriptor.mode
      || envelope.fingerprint !== descriptor.fingerprint
      || Buffer.from(envelope.pubkeyB64, "base64").toString("utf8") !== descriptor.publicKeyPem
      || !verifyArtifactBytesSignature({ workspace, artifactKind, bytes: Buffer.from(bytes), signature })) {
      throw new Error("Control mirror signature differs from its original signer.");
    }
    const signatureBytes = JSON.stringify(signature, null, 2) + "\n";
    return Object.freeze({ publish(assertCanonicalCurrent: () => void) {
      assertAuthority();
      assertCanonicalCurrent();
      if (pair(path) !== original) throw new Error("Control mirror publication predecessor changed.");
      writeFileAtomic(path, bytes, 0o600);
      writeFileAtomic(artifactSigPath(path), signatureBytes, 0o644);
    } });
  } });
}
