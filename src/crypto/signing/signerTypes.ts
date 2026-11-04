import type { SigningAlgorithm } from "../../keys/algorithmPolicy.js";
import type { NotaryAttestationBasis } from "../../notary/notaryApiTypes.js";

export const SIGN_KINDS = [
  "TRANSPARENCY_ROOT",
  "MERKLE_ROOT",
  "CERT",
  "BUNDLE",
  "BOM",
  "INSTALLED_LOCK",
  "RELEASE_MANIFEST",
  "BACKUP_MANIFEST",
  "ORG_SCORECARD",
  "TRANSFORM_PLAN",
  "COMPLIANCE_MAPS",
  "OPS_POLICY",
  "REPAIR_RECEIPT",
  "MIGRATION_RECEIPT",
  "CONTROL_PLAN",
  "CONTROL_RESULT",
  "A4_RECORD",
  "A4_PACKAGE"
] as const;

export type SignKind = (typeof SIGN_KINDS)[number];

const CONFIG_KINDS: ReadonlySet<SignKind> = new Set(["INSTALLED_LOCK", "COMPLIANCE_MAPS", "OPS_POLICY", "TRANSFORM_PLAN", "CONTROL_PLAN"]);
/** The existing vault policy mapping, also used when describing the key before constructing signed metadata. */
export function signingPurposeForKind(kind: SignKind): "config-signature" | "artifact-seal" {
  return CONFIG_KINDS.has(kind) ? "config-signature" : "artifact-seal";
}

export type SignerMode = "VAULT" | "NOTARY";

export interface SignatureEnvelope {
  v: 1;
  alg: SigningAlgorithm;
  pubkeyB64: string;
  fingerprint: string;
  sigB64: string;
  signedTs: number;
  signer: {
    type: SignerMode;
    attestationLevel: "SOFTWARE" | "HARDWARE";
    attestationBasis?: NotaryAttestationBasis;
    notaryFingerprint?: string;
  };
}

export interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: SignatureEnvelope;
}

