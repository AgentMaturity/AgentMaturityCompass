import { z } from "zod";
import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

/** The signature envelope, refusing unknown members here: none of them is covered by the attestation digest. */
const strictEnvelopeSchema = z.strictObject({
  ...signatureEnvelopeSchema.shape,
  signer: z.strictObject(signatureEnvelopeSchema.shape.signer.shape)
});

/**
 * A signed statement about one tenant, workspace, subject, deployment snapshot, profile and window, never about the
 * agent in general. The signature proves who issued it and that it is unchanged, not that it is true; the issuer key is
 * admitted against a pinned trust list for the `independent-attestation` purpose. `sequence` increases per subject, so a
 * verifier holding a later one refuses an earlier one (P1-06). The signed bytes are the 32-byte
 * sha256("AMC_SCOPED_ATTESTATION_V1", 0x00, canonical attestation without `signature`), as spec/ACCEPTANCE_RULES.md states.
 */
export const scopedAttestationV1Schema = z.strictObject({
  type: z.literal("amc.scoped-attestation"),
  version: z.literal(1),
  tenantId: nonEmpty,
  workspaceId: nonEmpty,
  subjectId: nonEmpty,
  sequence: z.number().int().positive(),
  snapshotDigest: sha256HexSchema,
  deployment: z.strictObject({ deploymentId: nonEmpty, deploymentDigest: sha256HexSchema }),
  profile: z.strictObject({ id: nonEmpty, version: nonEmpty }),
  window: z.strictObject({ start: isoTimeSchema, end: isoTimeSchema }),
  exclusions: z.array(z.strictObject({ controlId: nonEmpty, rationale: nonEmpty })),
  controlResultsDigest: sha256HexSchema,
  issuerKeyId: sha256HexSchema,
  issuedAt: isoTimeSchema,
  expiresAt: isoTimeSchema,
  signature: strictEnvelopeSchema
});
export type ScopedAttestationV1 = z.infer<typeof scopedAttestationV1Schema>;
