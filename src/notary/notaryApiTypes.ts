import { z } from "zod";

export const notaryAttestationLevelSchema = z.enum(["SOFTWARE", "HARDWARE"]);
export type NotaryAttestationLevel = z.infer<typeof notaryAttestationLevelSchema>;
/**
 * P2-08: where the level comes from. "configured" (a sealed key file, or a PKCS#11 token the operator declared),
 * "provider-metadata" (the KMS or HSM's own key metadata) or "provider-reported" (an external signer's own claim).
 * Never "attested": nothing here verifies a hardware attestation.
 */
export const notaryAttestationBasisSchema = z.enum(["configured", "provider-metadata", "provider-reported"]);
export type NotaryAttestationBasis = z.infer<typeof notaryAttestationBasisSchema>;
const notaryBackendTypeSchema = z.enum(["FILE_SEALED", "EXTERNAL_SIGNER", "KEY_PROVIDER"]);

export const notarySignRequestSchema = z.object({
  kind: z.string().min(1),
  payloadB64: z.string().min(1),
  payloadSha256: z.string().length(64).optional()
});
export type NotarySignRequest = z.infer<typeof notarySignRequestSchema>;

export const notarySignResponseSchema = z.object({
  v: z.literal(1),
  kind: z.string().min(1),
  payloadSha256: z.string().length(64),
  signatureB64: z.string().min(1),
  pubkeyPem: z.string().min(1),
  pubkeyFingerprint: z.string().length(64),
  signedTs: z.number().int(),
  backend: notaryBackendTypeSchema,
  attestationLevel: notaryAttestationLevelSchema,
  attestationBasis: notaryAttestationBasisSchema.optional(),
  claims: z.record(z.string(), z.unknown()).default({})
});
export type NotarySignResponse = z.infer<typeof notarySignResponseSchema>;

export const notaryAttestPayloadSchema = z.object({
  v: z.literal(1),
  attestationId: z.string().min(1),
  ts: z.number().int(),
  notary: z.object({
    pubkeyFingerprint: z.string().length(64),
    backend: notaryBackendTypeSchema,
    attestationLevel: notaryAttestationLevelSchema,
    attestationBasis: notaryAttestationBasisSchema.optional(),
    claims: z.record(z.string(), z.unknown()).default({})
  }),
  runtime: z.object({
    amcVersion: z.string().min(1),
    nodeVersion: z.string().min(1),
    platform: z.string().min(1),
    buildSha256: z.string().length(64),
    configSnapshot: z.object({
      trustYamlSha256: z.string().length(64).nullable(),
      opsPolicySha256: z.string().length(64).nullable(),
      approvalPolicySha256: z.string().length(64).nullable(),
      installedLockSha256: z.string().length(64).nullable()
    })
  })
});
export type NotaryAttestPayload = z.infer<typeof notaryAttestPayloadSchema>;

export const notaryAttestResponseSchema = z.object({
  v: z.literal(1),
  attestation: notaryAttestPayloadSchema,
  signatureB64: z.string().min(1),
  pubkeyPem: z.string().min(1),
  pubkeyFingerprint: z.string().length(64)
});
export type NotaryAttestResponse = z.infer<typeof notaryAttestResponseSchema>;

export const notaryTailEntrySchema = z.object({
  v: z.literal(1),
  ts: z.number().int(),
  requestId: z.string().min(1),
  kind: z.string().min(1),
  payloadSha256: z.string().length(64),
  signerFingerprint: z.string().length(64),
  attestationLevel: notaryAttestationLevelSchema,
  prevHash: z.string(),
  entryHash: z.string().length(64)
});
export type NotaryTailEntry = z.infer<typeof notaryTailEntrySchema>;

