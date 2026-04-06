import { z } from "zod";

export const valueTrustKindSchema = z.enum(["OBSERVED", "ATTESTED", "SELF_REPORTED"]);

export const valueEventSchema = z.object({
  v: z.literal(1),
  eventId: z.string().min(1),
  ts: z.number().int(),
  scope: z.object({
    type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
    idHash: z.string().min(8)
  }),
  kpiId: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  source: z.object({
    sourceId: z.string().min(1),
    trustKind: valueTrustKindSchema,
    signatureValid: z.boolean()
  }),
  evidenceRefs: z.object({
    receiptIds: z.array(z.string().min(1)).optional(),
    eventHashes: z.array(z.string().min(1)).optional(),
    artifactHashes: z.array(z.string().min(1)).optional(),
    runIds: z.array(z.string().min(1)).optional(),
    correlationIds: z.array(z.string().min(1)).optional()
  }).default({}),
  labels: z.object({
    agentType: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    modelFamily: z.string().min(1).optional()
  }).default({})
});

export type ValueEvent = z.infer<typeof valueEventSchema>;

export const valueWebhookPayloadSchema = z.object({
  v: z.literal(1),
  sourceId: z.string().min(1),
  scope: z.object({
    type: z.enum(["WORKSPACE", "NODE", "AGENT"]),
    id: z.string().min(1)
  }),
  events: z.array(
    z.object({
      ts: z.number().int().optional(),
      kpiId: z.string().min(1),
      value: z.number(),
      unit: z.string().min(1).optional(),
      labels: z.record(z.string(), z.string()).optional()
    })
  ).min(1)
});
