import { z } from "zod";
import { pluginIdSchema, pluginVersionSchema } from "./pluginIdentifiers.js";
import { pluginRegistryTypeSchema, pluginRiskCategorySchema } from "./pluginTypes.js";

export const pluginRegistryConfigSchema = z.object({
  pluginRegistries: z.object({
    version: z.literal(1),
    registries: z.array(
      z.object({
        id: z.string().min(1),
        type: pluginRegistryTypeSchema,
        base: z.string().min(1),
        pinnedRegistryPubkeyFingerprint: z.string().length(64),
        allowPluginPublishers: z.array(z.string().length(64)).default([]),
        allowRiskCategories: z.array(pluginRiskCategorySchema).default(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        autoUpdate: z.boolean().default(false)
      })
    )
  })
});

export const pluginRegistryIndexSchema = z.object({
  v: z.literal(1),
  registry: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    issuerFingerprint: z.string().length(64),
    updatedTs: z.number().int()
  }),
  plugins: z.array(
    z.object({
      id: pluginIdSchema,
      versions: z
        .array(
          z.object({
            version: pluginVersionSchema,
            sha256: z.string().length(64),
            url: z.string().min(1),
            publisherFingerprint: z.string().length(64),
            riskCategory: pluginRiskCategorySchema
          })
        )
        .min(1)
    })
  )
});

export const pluginRegistryIndexSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("registry")
});

export const installedPluginsLockSchema = z.object({
  v: z.literal(1),
  updatedTs: z.number().int(),
  installed: z.array(
    z.object({
      id: pluginIdSchema,
      version: pluginVersionSchema,
      sha256: z.string().length(64),
      registryFingerprint: z.string().length(64),
      publisherFingerprint: z.string().length(64),
      installedTs: z.number().int()
    })
  ),
  policySnapshot: z.object({
    actionPolicySha256: z.string().length(64),
    toolsSha256: z.string().length(64),
    budgetsSha256: z.string().length(64),
    approvalPolicySha256: z.string().length(64),
    opsPolicySha256: z.string().length(64),
    registriesSha256: z.string().length(64)
  })
});

export const pluginOverridesSchema = z.object({
  overrides: z.object({
    version: z.literal(1),
    allow: z.array(
      z.object({
        kind: z.enum(["policy_pack", "assurance_pack", "compliance_map", "adapter", "learn_md", "transform_overlay"]),
        id: z.string().min(1),
        allowedPublisherFingerprints: z.array(z.string().length(64)).min(1)
      })
    )
  })
});

export type PluginRegistryConfig = z.infer<typeof pluginRegistryConfigSchema>;
export type PluginRegistryIndex = z.infer<typeof pluginRegistryIndexSchema>;
export type InstalledPluginsLock = z.infer<typeof installedPluginsLockSchema>;
export type PluginOverrides = z.infer<typeof pluginOverridesSchema>;

