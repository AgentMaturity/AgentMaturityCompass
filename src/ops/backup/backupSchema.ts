import { signatureEnvelopeSchema } from "../../crypto/signing/signatureEnvelope.js";
import { z } from "zod";
import { SIGNING_ALGORITHMS } from "../../keys/algorithmPolicy.js";

export const backupManifestSchema = z.object({
  v: z.literal(1),
  backupId: z.string().min(1),
  createdTs: z.number().int(),
  workspace: z.object({
    pathHint: z.string().min(1),
    amcVersion: z.string().min(1),
    nodeVersion: z.string().min(1)
  }),
  policy: z.object({
    opsPolicySha256: z.string().length(64)
  }),
  payload: z.object({
    encryption: z.object({
      scheme: z.literal("PASSPHRASE_AES_256_GCM"),
      saltB64: z.string().min(1),
      nonceB64: z.string().min(1),
      kdf: z.object({
        name: z.literal("scrypt"),
        N: z.number().int().min(2),
        r: z.number().int().min(1),
        p: z.number().int().min(1)
      })
    }),
    payloadSha256: z.string().length(64)
  }),
  files: z.array(
    z.object({
      path: z.string().min(1),
      sha256: z.string().length(64),
      bytes: z.number().int().min(0)
    })
  ),
  integrity: z.object({
    transparencyRoot: z.string(),
    transparencySealSigSha256: z.string().length(64),
    evidenceDbSha256: z.string().length(64).nullable()
  }),
  signing: z.object({
    algorithm: z.enum(SIGNING_ALGORITHMS),
    auditorFingerprint: z.string().length(64)
  })
});

export type BackupManifest = z.infer<typeof backupManifestSchema>;

export const backupManifestSigSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export type BackupManifestSig = z.infer<typeof backupManifestSigSchema>;
