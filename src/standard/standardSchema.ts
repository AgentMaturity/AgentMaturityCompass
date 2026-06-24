import { z } from "zod";

export const STANDARD_SCHEMA_NAMES = [
  "amcbench.schema.json",
  "amcprompt.schema.json",
  "amccert.schema.json",
  "amcaudit.schema.json",
  "amcpass.schema.json",
  "amcproof.schema.json",
  "registry.bench.schema.json",
  "registry.passport.schema.json"
] as const;

export const standardSchemaNameSchema = z.enum(STANDARD_SCHEMA_NAMES);

export const standardMetaSchema = z.object({
  v: z.literal(1),
  generatedTs: z.number().int(),
  schemas: z.array(
    z.object({
      name: standardSchemaNameSchema,
      sha256: z.string().length(64)
    })
  ).min(1)
});

export type StandardMeta = z.infer<typeof standardMetaSchema>;

export const standardBundleSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: z
    .object({
      v: z.literal(1),
      alg: z.literal("ed25519"),
      pubkeyB64: z.string().min(1),
      fingerprint: z.string().length(64),
      sigB64: z.string().min(1),
      signedTs: z.number().int(),
      signer: z.object({
        type: z.enum(["VAULT", "NOTARY"]),
        attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
        notaryFingerprint: z.string().length(64).optional()
      })
    })
    .optional()
});

export type StandardBundleSignature = z.infer<typeof standardBundleSignatureSchema>;
