/**
 * The scoped attestation v2 (spec/schemas/v2/scoped-attestation). Mirrors src/contracts/v2/scopedAttestation.ts. v1 lacks
 * the tenant, workspace, subject and sequence a verdict needs, so it is UNSUPPORTED_VERSION here.
 */
import { arr, int, isoTime, lit, nonEmpty, obj, oneOf, opt, sha256, str } from "../schema.js";

/** The signature envelope AMC artifacts carry, refusing unknown members here: none of them is signed. */
const signatureEnvelope = obj({
  v: lit(1),
  alg: oneOf(["ed25519", "ecdsa-p256-sha256"] as const),
  pubkeyB64: nonEmpty,
  fingerprint: str({ length: 64 }),
  sigB64: nonEmpty,
  signedTs: int(),
  signer: obj({
    type: oneOf(["VAULT", "NOTARY"] as const),
    attestationLevel: oneOf(["SOFTWARE", "HARDWARE"] as const),
    notaryFingerprint: opt(str({ length: 64 }))
  })
});

export const scopedAttestation = obj({
  type: lit("amc.scoped-attestation"),
  version: lit(2, "UNSUPPORTED_VERSION"),
  tenantId: nonEmpty,
  workspaceId: nonEmpty,
  subjectId: nonEmpty,
  sequence: int({ min: 1 }),
  snapshotDigest: sha256,
  deployment: obj({ deploymentId: nonEmpty, deploymentDigest: sha256 }),
  profile: obj({ id: nonEmpty, version: nonEmpty }),
  window: obj({ start: isoTime, end: isoTime }),
  exclusions: arr(obj({ controlId: nonEmpty, rationale: nonEmpty })),
  controlResultsDigest: sha256,
  issuerKeyId: sha256,
  issuedAt: isoTime,
  expiresAt: isoTime,
  signature: signatureEnvelope
});
export type ScopedAttestation = ReturnType<typeof scopedAttestation>;

/** The domain tag of the attestation digest: sha256(tag, 0x00, canonical attestation without `signature`). */
export const ATTESTATION_DIGEST_TAG = "AMC_SCOPED_ATTESTATION_V2";
