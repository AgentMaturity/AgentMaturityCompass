import { z } from "zod";
import { userRoleSchema } from "../../auth/userSchema.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_ADMISSIONS, A4_AUTH_SOURCES, A4_IDENTITY_CHECKS, A4_ITEM_STATUSES, a4PrincipalSchema } from "./a4Project.js";

/** The single-user facts a decision was derived from (design §5.3); recorded on every decision row. */
export const a4SelfApprovalFactsSchema = z.strictObject({
  activeUserCount: z.number().int().min(0).nullable(),
  hostPrincipals: z.number().int().min(0).nullable(),
  hostedRouter: z.boolean(),
  ratcheted: z.boolean(),
  regulated: z.boolean(),
  selfApprovalAllowed: z.boolean()
});
export type A4SelfApprovalFacts = z.infer<typeof a4SelfApprovalFactsSchema>;

/** A bound readiness item as the approver saw it. */
export const a4EvaluatedItemSchema = z.strictObject({ id: nonEmpty, status: z.enum(A4_ITEM_STATUSES), reasonCodes: z.array(nonEmpty) });

/**
 * `amc.a4-decision/v1`. Identity comes from the authenticated session, never the body; `requestDigestSha256` is
 * mandatory (a decision without it counts for nothing); every gate decision is `self_reported`, never a review.
 */
export const a4DecisionV1Schema = z.strictObject({
  schema: z.literal("amc.a4-decision/v1"),
  decisionId: nonEmpty,
  gateId: nonEmpty,
  projectId: nonEmpty,
  decision: z.enum(["APPROVE_EXECUTE", "DENY"]),
  reason: z.string(),
  requestDigestSha256: sha256HexSchema,
  approverKey: nonEmpty,
  authSource: z.enum(A4_AUTH_SOURCES),
  userId: nonEmpty,
  username: nonEmpty,
  roles: z.array(userRoleSchema).min(1),
  admission: z.enum(A4_ADMISSIONS),
  identityCheck: z.enum(A4_IDENTITY_CHECKS),
  identityProvenance: a4PrincipalSchema.shape.provenance,
  selfApproved: z.boolean(),
  selfApprovalFacts: a4SelfApprovalFactsSchema,
  evaluatedItems: z.array(a4EvaluatedItemSchema),
  claimKind: z.literal("self_reported"),
  evidenceEventId: nonEmpty,
  ts: z.number().int()
});
export type A4DecisionV1 = z.infer<typeof a4DecisionV1Schema>;
