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

export const approvalPolicySchema = z.object({
  approvalPolicy: z.object({
    version: z.literal(1),
    defaults: z.object({
      simulateAlwaysAllowed: z.boolean().default(true)
    }),
    actionClasses: z.partialRecord(actionClassSchema, approvalClassPolicySchema)
  })
});

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ApprovalClassPolicy = z.infer<typeof approvalClassPolicySchema>;
