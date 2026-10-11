import { z } from "zod";
import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

/**
 * A signed statement about one deployment snapshot, one profile and one window, never about the agent in general.
 * The signature proves who issued it and that it is unchanged, not that it is true; the issuer key is admitted
 * against a pinned trust list for the `independent-attestation` purpose.
 */
export const scopedAttestationV1Schema = z.strictObject({
  type: z.literal("amc.scoped-attestation"),
  version: z.literal(1),
  snapshotDigest: sha256HexSchema,
  deployment: z.strictObject({ deploymentId: nonEmpty, deploymentDigest: sha256HexSchema }),
  profile: z.strictObject({ id: nonEmpty, version: nonEmpty }),
  window: z.strictObject({ start: isoTimeSchema, end: isoTimeSchema }),
  exclusions: z.array(z.strictObject({ controlId: nonEmpty, rationale: nonEmpty })),
  controlResultsDigest: sha256HexSchema,
  issuerKeyId: sha256HexSchema,
  issuedAt: isoTimeSchema,
  expiresAt: isoTimeSchema,
  signature: signatureEnvelopeSchema
});
export type ScopedAttestationV1 = z.infer<typeof scopedAttestationV1Schema>;
