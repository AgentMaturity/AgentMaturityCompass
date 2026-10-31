import { z } from "zod";
import { USER_ROLES } from "../auth/roles.js";
import { signatureEnvelopeSchema } from "../crypto/signing/signatureEnvelope.js";

// Leaf module: contracts (a4Gate) import these schemas without loading the chain store and its signing imports.

const riskTierSchema = z.enum(["low", "medium", "high", "critical"]);
const modeSchema = z.enum(["SIMULATE", "EXECUTE"]);
const actionClassSchema = z.enum([
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);
const roleSchema = z.enum(USER_ROLES);

const approvalRequestStatusSchema = z.enum(["PENDING", "QUORUM_MET", "DENIED", "EXPIRED", "CANCELLED", "CONSUMED"]);
const approvalDecisionKindSchema = z.enum(["APPROVE_EXECUTE", "APPROVE_SIMULATE", "DENY"]);

export const signatureSchema = z.object({
  digestSha256: z.string().length(64),
  signature: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.literal("auditor"),
  envelope: signatureEnvelopeSchema.optional()
});

export const approvalRequestSchema = z.object({
  v: z.literal(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  intentId: z.string().min(1),
  toolName: z.string().min(1),
  actionClass: actionClassSchema,
  workOrderId: z.string().min(1).nullable().optional(),
  requestedMode: modeSchema,
  effectiveMode: modeSchema,
  riskTier: riskTierSchema,
  createdTs: z.number().int(),
  expiresTs: z.number().int(),
  status: approvalRequestStatusSchema,
  requiredApprovals: z.number().int().min(0),
  requireDistinctUsers: z.boolean(),
  rolesAllowed: z.array(roleSchema),
  requiredAssurancePacks: z.record(z.string().min(1), z.object({
    minScore: z.number().min(0).max(100),
    maxSucceeded: z.number().int().min(0)
  })).optional(),
  boundHashes: z.object({
    intentHash: z.string().length(64),
    workOrderHash: z.string().length(64).nullable().optional(),
    policyHash: z.string().length(64),
    toolsHash: z.string().length(64),
    budgetsHash: z.string().length(64),
    leaseConstraintsHash: z.string().length(64)
  }),
  // The authorization intent an approver reviewed (P1-02): protected facts and digests, never raw arguments.
  // Its hash is `boundHashes.intentHash`, so a recheck can name which fact changed.
  authorizationIntent: z.record(z.string(), z.unknown()).optional(),
  // Who raised the request (P1-78): a principal key as A4 keys one (`<plane>:<userId>`) or a user id, supplied by the
  // server-side caller from its authenticated principal. The engine refuses that principal's approval and the quorum never
  // counts it. Absent on records written before P1-78 and by callers that name no initiator.
  initiator: z.string().min(1).optional()
});

export const approvalDecisionSchema = z.object({
  v: z.literal(1),
  approvalDecisionId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  roles: z.array(roleSchema),
  decision: approvalDecisionKindSchema,
  reason: z.string().min(1),
  // Optional for legacy compatibility. Bound decisions cannot move to changed requests.
  requestDigestSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  decisionTs: z.number().int()
});

export const approvalConsumedSchema = z.object({
  v: z.literal(1),
  approvalRequestId: z.string().min(1),
  agentId: z.string().min(1),
  consumedTs: z.number().int(),
  executionId: z.string().min(1).nullable().optional(),
  reason: z.string().min(1)
});

export type ApprovalRequestRecord = z.infer<typeof approvalRequestSchema>;
export type ApprovalDecisionRecord = z.infer<typeof approvalDecisionSchema>;
export type ApprovalConsumedRecord = z.infer<typeof approvalConsumedSchema>;
export type ApprovalRequestStatus = z.infer<typeof approvalRequestStatusSchema>;
export type ApprovalDecisionKind = z.infer<typeof approvalDecisionKindSchema>;
