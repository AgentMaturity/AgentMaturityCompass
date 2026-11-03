import { z } from "zod";
import { benchTrustLabelSchema } from "./benchSchema.js";

export const benchRegistryVersionSchema = z.literal(1);

export const benchRegistryItemVersionSchema = z.object({
  version: z.string().min(1),
  sha256: z.string().length(64),
  url: z.string().min(1),
  signerFingerprint: z.string().length(64),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"])
});

export const benchRegistryBenchItemSchema = z.object({
  benchId: z.string().min(1),
  scopeType: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  labels: z
    .object({
      industry: z.enum(["software", "fintech", "health", "manufacturing", "other"]).optional(),
      agentType: z.enum(["code-agent", "support-agent", "ops-agent", "research-agent", "sales-agent", "other"]).optional(),
      deployment: z.enum(["single", "host", "k8s", "compose"]).optional()
    })
    .default({}),
  evidence: z.object({
    integrityIndex: z.number().min(0).max(1).nullable(),
    trustLabel: benchTrustLabelSchema
  }),
  versions: z.array(benchRegistryItemVersionSchema).min(1)
});

export const benchRegistryIndexSchema = z.object({
  v: benchRegistryVersionSchema,
  registry: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    issuerFingerprint: z.string().length(64),
    updatedTs: z.number().int()
  }),
  benches: z.array(benchRegistryBenchItemSchema).default([])
});

export const benchRegistryIndexSignatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("registry")
});

export const benchRegistryConfigSchema = z.object({
  benchRegistries: z.object({
    version: z.literal(1),
    registries: z.array(
      z.object({
        id: z.string().min(1),
        type: z.enum(["file", "http"]),
        base: z.string().min(1),
        pinnedRegistryFingerprint: z.string().length(64),
        allowSignerFingerprints: z.array(z.string().length(64)).default([]),
        allowTrustLabels: z.array(benchTrustLabelSchema).default(["HIGH", "MEDIUM", "LOW"]),
        requireBenchProofs: z.boolean().default(true),
        autoUpdate: z.boolean().default(false)
      })
    )
  })
});

export type BenchRegistryIndex = z.infer<typeof benchRegistryIndexSchema>;
export type BenchRegistryIndexSignature = z.infer<typeof benchRegistryIndexSignatureSchema>;
export type BenchRegistryConfig = z.infer<typeof benchRegistryConfigSchema>;
