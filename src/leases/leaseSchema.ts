import { z } from "zod";

export const leaseScopeSchema = z.enum([
  "gateway:llm",
  "proxy:connect",
  "toolhub:intent",
  "toolhub:execute",
  "hook:observe",
  "governor:check",
  "receipt:verify",
  "diagnostic:self-run"
]);

export const leasePayloadSchema = z.object({
  v: z.literal(1),
  leaseId: z.string().min(1),
  issuedTs: z.number().int(),
  expiresTs: z.number().int(),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  workOrderId: z.string().min(1).nullable().optional(),
  scopes: z.array(leaseScopeSchema).min(1),
  routeAllowlist: z.array(z.string().startsWith("/")).min(1),
  modelAllowlist: z.array(z.string().min(1)).min(1),
  maxTokensPerMinute: z.number().int().positive(),
  maxRequestsPerMinute: z.number().int().positive(),
  maxCostUsdPerDay: z.number().positive().nullable(),
  nonce: z.string().min(8)
});

export type LeaseScope = z.infer<typeof leaseScopeSchema>;
export type LeasePayload = z.infer<typeof leasePayloadSchema>;

export const leaseRevocationsSchema = z.object({
  v: z.literal(1),
  updatedTs: z.number().int(),
  revocations: z.array(
    z.object({
      leaseId: z.string().min(1),
      revokedTs: z.number().int(),
      reason: z.string().min(1)
    })
  )
});

export type LeaseRevocations = z.infer<typeof leaseRevocationsSchema>;
