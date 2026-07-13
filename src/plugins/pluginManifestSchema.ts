import { z } from "zod";
import { pluginArtifactPathSchema, pluginIdSchema, pluginVersionSchema } from "./pluginIdentifiers.js";
import { pluginArtifactKindSchema, pluginRiskCategorySchema } from "./pluginTypes.js";

export const pluginManifestSchema = z.object({
  v: z.literal(1),
  plugin: z.object({
    id: pluginIdSchema,
    name: z.string().min(1),
    version: pluginVersionSchema,
    description: z.string().min(1),
    publisher: z.object({
      org: z.string().min(1),
      contact: z.string().min(1),
      website: z.string().min(1),
      pubkeyFingerprint: z.string().length(64)
    }),
    compatibility: z.object({
      amcMinVersion: z.string().min(1),
      nodeMinVersion: z.string().min(1),
      schemaVersions: z.object({
        policyPacks: z.number().int().positive(),
        assurancePacks: z.number().int().positive(),
        complianceMaps: z.number().int().positive(),
        adapters: z.number().int().positive(),
        outcomes: z.number().int().positive(),
        casebooks: z.number().int().positive(),
        transform: z.number().int().positive()
      })
    }),
    risk: z.object({
      category: pluginRiskCategorySchema,
      notes: z.string().min(1),
      touches: z
        .array(
          z.enum([
            "policy",
            "assurance",
            "compliance",
            "adapters",
            "learn",
            "transform",
            "outcomes",
            "casebooks"
          ])
        )
        .min(1)
    })
  }),
  artifacts: z.array(
    z.object({
      path: pluginArtifactPathSchema,
      sha256: z.string().length(64),
      bytes: z.number().int().nonnegative(),
      kind: pluginArtifactKindSchema
    })
  ),
  generatedTs: z.number().int(),
  signing: z.object({
    algorithm: z.literal("ed25519"),
    pubkeyFingerprint: z.string().length(64)
  })
});

export const pluginManifestSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("publisher")
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginManifestSignature = z.infer<typeof pluginManifestSignatureSchema>;

