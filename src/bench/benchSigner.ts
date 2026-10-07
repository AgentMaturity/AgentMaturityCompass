import { readFileSync } from "node:fs";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { sha256Hex } from "../utils/hash.js";
import { benchSignatureSchema, type BenchArtifact } from "./benchSchema.js";

export function signBenchJson(workspace: string, bench: BenchArtifact): {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: {
    v: 1;
    alg: "ed25519";
    pubkeyB64: string;
    fingerprint: string;
    sigB64: string;
    signedTs: number;
    signer: {
      type: "VAULT" | "NOTARY";
      attestationLevel: "SOFTWARE" | "HARDWARE";
      notaryFingerprint?: string;
    };
  };
} {
  return benchSignatureSchema.parse(signSerializedPayloadWithAuditor(workspace, JSON.stringify(bench)));
}

export function digestFile(path: string): string {
  return sha256Hex(readFileSync(path));
}
