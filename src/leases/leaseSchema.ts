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
  // v2 (P2-25) binds the lease to a signed delegation chain; v1 leases keep their meaning.
  v: z.union([z.literal(1), z.literal(2)]),
  leaseId: z.string().min(1),
  issuedTs: z.number().int(),
  expiresTs: z.number().int(),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  // A signed synthetic marker can only reduce evidence; omitted leases keep their existing meaning.
  claimKind: z.literal("synthetic_example").optional(),
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
  nonce: z.string().min(8),
  // The users.yaml user the lease is issued for (P1-78). Only a pointer: the bind resolves it against the signed users.yaml
  // and refuses one that is not an active user there. Absent on leases issued before P1-78 and by the CLI.
  principal: z.strictObject({ userId: z.string().min(1) }).optional(),
  // Lease v2 (P2-25): the digest of the signed delegation chain the lease was issued under, and the SPIFFE ID the lease
  // authority verified for the leaf delegate (null when it presented none). Present exactly when v is 2.
  delegationChainDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  spiffeId: z.string().startsWith("spiffe://").nullable().optional(),
  // Lease v2 for a delegated child (P2-25): the leases it descends from, root first. Revoking any of them revokes it.
  ancestorLeaseIds: z.array(z.string().min(1)).min(1).optional()
}).refine((lease) => lease.v === 2 ? lease.delegationChainDigest !== undefined && lease.spiffeId !== undefined
  : lease.delegationChainDigest === undefined && lease.spiffeId === undefined && lease.ancestorLeaseIds === undefined,
  "a v2 lease carries delegationChainDigest and spiffeId; a v1 lease carries none of the v2 fields");

/**
 * The revocation-list id that revokes every lease and every delegation link of one agent (P2-23 retirement, P2-25).
 * Lease ids are minted by AMC, so a lease named like this can only revoke more.
 */
export function agentLeaseRevocationId(agentId: string): string {
  return `agent:${agentId}`;
}

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
