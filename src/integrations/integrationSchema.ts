import { z } from "zod";

export const webhookRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(20).optional(),
  initialBackoffMs: z.number().int().min(1).max(60_000).optional(),
  maxBackoffMs: z.number().int().min(1).max(300_000).optional(),
  jitterFactor: z.number().min(0).max(1).optional(),
  timeoutMs: z.number().int().min(50).max(120_000).optional()
});

export const integrationDeliveryPolicySchema = z.object({
  ordered: z.boolean().default(true),
  recordDeadLetters: z.boolean().default(true),
  maxRounds: z.number().int().min(1).max(20).default(3),
  retry: webhookRetryPolicySchema.default({})
});

export const webhookIntegrationChannelSchema = z.object({
  id: z.string().min(1),
  type: z.literal("webhook"),
  url: z.string().url(),
  secretRef: z.string().startsWith("vault:"),
  enabled: z.boolean(),
  delivery: integrationDeliveryPolicySchema.optional()
});

export const slackWebhookIntegrationChannelSchema = z.object({
  id: z.string().min(1),
  type: z.literal("slack_webhook"),
  webhookUrlRef: z.string().startsWith("vault:"),
  channel: z.string().min(1).optional(),
  enabled: z.boolean(),
  delivery: integrationDeliveryPolicySchema.optional()
});

export const integrationChannelSchema = z.union([
  webhookIntegrationChannelSchema,
  slackWebhookIntegrationChannelSchema
]);

export const integrationsConfigSchema = z.object({
  integrations: z.object({
    version: z.literal(1),
    channels: z.array(integrationChannelSchema).min(1),
    defaults: z
      .object({
        delivery: integrationDeliveryPolicySchema.default({
          ordered: true,
          recordDeadLetters: true,
          maxRounds: 3,
          retry: {
            maxAttempts: 5,
            initialBackoffMs: 250,
            maxBackoffMs: 10_000,
            jitterFactor: 0.2,
            timeoutMs: 10_000
          }
        })
      })
      .default({
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          maxRounds: 3,
          retry: {
            maxAttempts: 5,
            initialBackoffMs: 250,
            maxBackoffMs: 10_000,
            jitterFactor: 0.2,
            timeoutMs: 10_000
          }
        }
      }),
    routing: z.record(z.string().min(1), z.array(z.string().min(1)))
  })
});

export type IntegrationsConfig = z.infer<typeof integrationsConfigSchema>;
