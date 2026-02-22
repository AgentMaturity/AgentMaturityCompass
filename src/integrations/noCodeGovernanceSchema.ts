import { z } from "zod";

export const noCodeAdapterTypeSchema = z.enum(["n8n", "make", "zapier"]);
export const webhookPlatformSchema = z.enum(["n8n", "make", "zapier", "generic"]);

export const noCodeAdapterRecordSchema = z.object({
  id: z.string().min(1),
  type: noCodeAdapterTypeSchema,
  webhookUrl: z.string().url(),
  enabled: z.boolean().default(true),
  addedTs: z.number().int().nonnegative()
});

export const noCodeGovernanceConfigSchema = z.object({
  noCodeAdapters: z.object({
    version: z.literal(1),
    adapters: z.array(noCodeAdapterRecordSchema).default([])
  })
});

export type NoCodeAdapterType = z.infer<typeof noCodeAdapterTypeSchema>;
export type WebhookPlatform = z.infer<typeof webhookPlatformSchema>;
export type NoCodeAdapterRecord = z.infer<typeof noCodeAdapterRecordSchema>;
export type NoCodeGovernanceConfig = z.infer<typeof noCodeGovernanceConfigSchema>;

export function defaultNoCodeGovernanceConfig(): NoCodeGovernanceConfig {
  return noCodeGovernanceConfigSchema.parse({
    noCodeAdapters: {
      version: 1,
      adapters: []
    }
  });
}
