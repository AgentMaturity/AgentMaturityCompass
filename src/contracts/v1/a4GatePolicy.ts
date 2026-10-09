import { z } from "zod";
import { userRoleSchema } from "../../auth/userSchema.js";
import { actionClassSchema } from "../../fleet/typedGraph.js";
import { nonEmpty } from "./common.js";

/**
 * role_vote: satisfied by a role-labelled APPROVE on the gate (an acknowledgement, never a review).
 * review_record: satisfied only by an evidence ref resolving to an admitted external record whose issuer key is
 * outside the workspace's own keys and on the operator's trust list.
 */
export const a4RequiredReviewSchema = z.strictObject({
  kind: z.enum(["role_vote", "review_record"]),
  role: userRoleSchema.optional(),
  label: nonEmpty
});

/** Every field may only tighten the signed floors (design §6.3). */
export const a4GateRuleSchema = z.strictObject({
  actionClass: actionClassSchema,
  minApprovals: z.number().int().min(1).optional(),
  rolesAllowed: z.array(userRoleSchema).optional(),
  requireDistinctUsers: z.boolean().optional(),
  ttlDays: z.number().int().min(1).max(90).default(14),
  requiredReviews: z.array(a4RequiredReviewSchema).default([])
});

export const A4_GATE_POLICY_KEYS = [
  "aspire.direction", "aspire.completion", "assemble.direction", "assemble.completion",
  "adapt.direction", "adapt.completion", "activate.direction", "activate.completion", "policy"
] as const;

/**
 * `amc.a4-gate-policy/v1`, carried in the CREATED / GATE_POLICY_CHANGED payload. There is no allowSelfApproval (it
 * is derived per evaluation) and no admin-decision flag (it does not exist).
 */
export const a4GatePolicyV1Schema = z.strictObject({
  schema: z.literal("amc.a4-gate-policy/v1"),
  gates: z.strictObject(Object.fromEntries(A4_GATE_POLICY_KEYS.map((key) => [key, a4GateRuleSchema])) as Record<(typeof A4_GATE_POLICY_KEYS)[number], typeof a4GateRuleSchema>)
});
export type A4GatePolicyV1 = z.infer<typeof a4GatePolicyV1Schema>;
