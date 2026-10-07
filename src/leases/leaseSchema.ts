import { z } from "zod";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";

export const leaseScopeSchema = z.enum([
  "gateway:llm",
  "proxy:connect",
  "toolhub:intent",
  "toolhub:execute",
  "hook:observe",
  "hook:control",
  "governor:check",
  "receipt:verify",
  "diagnostic:self-run",
  // Submitting work over the NDJSON wire (../wire/). Deliberately its own scope:
  // none of the others names this capability, and reusing one would grant wire
  // submission to every lease that already holds it. Because it is in no default
  // grant set (bridgeAuth.ts, studioState.ts, setupWizard.ts), no existing
  // credential can reach the wire until an operator mints a lease naming it.
  "wire:submit"
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
  // When present, toolhub:execute covers only these action classes (AMC-1546). Absent keeps the old meaning:
  // every class the signed action policy allows to execute.
  executeActionClasses: z.array(z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]])).optional(),
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
