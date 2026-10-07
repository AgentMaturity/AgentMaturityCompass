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
  "MIGRATION_RECEIPT"
] as const;

export type SignKind = (typeof SIGN_KINDS)[number];

export type SignerMode = "VAULT" | "NOTARY";

export interface SignatureEnvelope {
  v: 1;
  alg: "ed25519";
  pubkeyB64: string;
  fingerprint: string;
  sigB64: string;
  signedTs: number;
  signer: {
    type: SignerMode;
    attestationLevel: "SOFTWARE" | "HARDWARE";
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

