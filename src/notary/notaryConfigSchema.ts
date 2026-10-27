import { z } from "zod";

export const notaryBackendSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FILE_SEALED"),
    keyFile: z.string().min(1).default("keys/notary_ed25519.enc.json"),
    publicKeyFile: z.string().min(1).default("keys/notary_ed25519.pub")
  }),
  z.object({
    type: z.literal("EXTERNAL_SIGNER"),
    command: z.string().min(1),
    args: z.array(z.string()).default([])
  }),
  // P2-08: a key held by a key provider (src/keys/provider.ts); credentials, PINs and module paths come from the environment.
  z.object({
    type: z.literal("KEY_PROVIDER"),
    ref: z.strictObject({
      provider: z.enum(["aws-kms", "gcp-kms", "azure-kv", "pkcs11"]),
      id: z.string().min(1).max(2048),
      version: z.string().min(1).max(256).optional()
    })
  })
]);

export const notaryConfigSchema = z.object({
  notary: z.object({
    version: z.literal(1),
    bindHost: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().positive().default(4343),
    unixSocketPath: z.string().min(1).nullable().default(null),
    backend: notaryBackendSchema.default({
      type: "FILE_SEALED",
      keyFile: "keys/notary_ed25519.enc.json",
      publicKeyFile: "keys/notary_ed25519.pub"
    }),
    auth: z.object({
      enabled: z.boolean().default(true),
      headerName: z.string().min(1).default("x-amc-notary-auth"),
      tsHeaderName: z.string().min(1).default("x-amc-notary-ts"),
      hmacAlg: z.literal("sha256").default("sha256"),
      maxClockSkewSeconds: z.number().int().positive().default(120)
    }).default({
      enabled: true,
      headerName: "x-amc-notary-auth",
      tsHeaderName: "x-amc-notary-ts",
      hmacAlg: "sha256",
      maxClockSkewSeconds: 120
    }),
    allowedSignKinds: z.array(z.string().min(1)).default([
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
      "OPS_POLICY"
    ]),
    rateLimitPerMinute: z.number().int().positive().default(120)
  })
});

export type NotaryConfig = z.infer<typeof notaryConfigSchema>;
export type NotaryBackendConfig = z.infer<typeof notaryBackendSchema>;

