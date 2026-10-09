import { z } from "zod";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { USER_ROLES } from "../auth/roles.js";

const roleSchema = z.enum(USER_ROLES);
const actionClassSchema = z.enum(ACTION_CLASSES as [
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

const assuranceRequirementSchema = z.object({
  minScore: z.number().min(0).max(100),
  maxSucceeded: z.number().int().min(0)
});

export const approvalClassPolicySchema = z.object({
  requiredApprovals: z.number().int().min(0).default(0),
  rolesAllowed: z.array(roleSchema).default(["APPROVER", "OWNER"]),
  requireDistinctUsers: z.boolean().default(false),
  ttlMinutes: z.number().int().min(1).default(15),
  requireAssurancePacks: z.record(z.string().min(1), assuranceRequirementSchema).optional()
});

/** The A4 gate-policy fields a project may change at all (each change may still only tighten, design §6.3). */
export const A4_GATE_CHANGE_FIELDS = ["minApprovals", "rolesAllowed", "requireDistinctUsers", "ttlDays", "requiredReviews"] as const;

/**
 * The optional signed `a4` floor (A4 Forge, design §6.3): a project's gate policy may only tighten it. `regulated: true`
 * forces every project regulated; `allowSelfApproval: false` turns single-user self-approval off workspace-wide;
 * `maxTtlMinutes` caps how far an effect gate's `quorumFloor.ttlMinutes` may raise a class rule (absent: not at all).
 */
export const approvalA4FloorSchema = z.object({
  regulated: z.union([z.literal("auto"), z.literal(true)]).default("auto"),
  allowSelfApproval: z.boolean().default(true),
  allowedGateChanges: z.array(z.enum(A4_GATE_CHANGE_FIELDS)).default([...A4_GATE_CHANGE_FIELDS]),
  minTtlDays: z.number().int().min(1).max(90).optional(),
  maxTtlDays: z.number().int().min(1).max(90).optional(),
  maxTtlMinutes: z.number().int().min(1).optional()
});

export const approvalPolicySchema = z.object({
  approvalPolicy: z.object({
    version: z.literal(1),
    defaults: z.object({
      simulateAlwaysAllowed: z.boolean().default(true)
    }),
    actionClasses: z.partialRecord(actionClassSchema, approvalClassPolicySchema),
    a4: approvalA4FloorSchema.optional()
  })
});

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ApprovalClassPolicy = z.infer<typeof approvalClassPolicySchema>;
export type ApprovalA4Floor = z.infer<typeof approvalA4FloorSchema>;
