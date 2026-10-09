import { z } from "zod";
import { userRoleSchema } from "../../auth/userSchema.js";
import { nonEmpty, sha256HexSchema } from "./common.js";

/** A4 Forge vocabulary (design §3, §4.7). The other a4* contracts and src/a4/a4Schema.ts build on these. */
export const A4_STAGES = ["aspire", "assemble", "adapt", "activate"] as const;
export const A4_STAGE_STATES = [...A4_STAGES, "retired"] as const;
export const A4_STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"] as const;
export const A4_LANES = ["recommendation", "implementation", "observed", "verified"] as const;
export const A4_GATES = ["direction", "completion", "policy"] as const;
export const A4_PROJECT_ROLES = ["owner", "builder", "reviewer", "approver", "viewer"] as const;
export const A4_AUTH_SOURCES = ["LOCAL_USER", "WORKSPACE_ROUTER"] as const;
export const A4_ADMISSIONS = ["browser_csrf", "native_login_token"] as const;
/** session_record is host mode in G1: not a live check (readiness IDENTITY_CHECK_LIMITED until P2-33). */
export const A4_IDENTITY_CHECKS = ["users_yaml", "session_record"] as const;
export const A4_ITEM_STATUSES = ["WAITING", "READY", "COMPLETE", "BLOCKED", "NOT_EVALUATED"] as const;
export const A4_READINESS_STATUSES = ["READY", "BLOCKED", "WAITING", "COMPLETE", "ON_HOLD"] as const;

/** Never read from a request body: resolved live per request from the authenticated session (src/a4/a4Identity.ts). */
export const a4PrincipalSchema = z.strictObject({
  key: nonEmpty,
  authSource: z.enum(A4_AUTH_SOURCES),
  userId: nonEmpty,
  username: nonEmpty,
  roles: z.array(userRoleSchema).min(1),
  admission: z.enum(A4_ADMISSIONS),
  identityCheck: z.enum(A4_IDENTITY_CHECKS),
  /** Recorded on every decision. createdBy null means self-provisioned and fails closed (design §5.2). */
  provenance: z.strictObject({
    usersYamlSignerFingerprint: z.string().nullable(),
    createdTs: z.number().int().nullable(),
    createdBy: z.strictObject({ principalKey: nonEmpty, admission: z.enum(A4_ADMISSIONS) }).nullable(),
    hostMembershipId: z.string().nullable()
  })
});
export type A4Principal = z.infer<typeof a4PrincipalSchema>;

export const a4MemberSchema = z.strictObject({
  principalKey: nonEmpty,
  authSource: z.enum(A4_AUTH_SOURCES),
  userId: nonEmpty,
  username: nonEmpty,
  roles: z.array(z.enum(A4_PROJECT_ROLES)).min(1)
});
export type A4Member = z.infer<typeof a4MemberSchema>;

/** `amc.a4-project/v1`: the head, the current members (latest event per principal) and a readiness summary. */
export const a4ProjectV1Schema = z.strictObject({
  schema: z.literal("amc.a4-project/v1"),
  projectId: nonEmpty,
  workspaceId: nonEmpty,
  agentId: nonEmpty,
  name: nonEmpty,
  stage: z.enum(A4_STAGE_STATES),
  step: z.enum(A4_STEPS),
  hold: z.boolean(),
  holdReason: z.string().nullable(),
  revisionNo: z.number().int().min(0),
  headSeq: z.number().int().min(0),
  headDigest: sha256HexSchema,
  deployedReleaseId: z.string().nullable(),
  baseReleaseId: z.string().nullable(),
  createdByKey: nonEmpty,
  createdTs: z.number().int(),
  updatedTs: z.number().int(),
  members: z.array(a4MemberSchema),
  readiness: z.strictObject({ status: z.enum(A4_READINESS_STATUSES), bindingDigest: sha256HexSchema }).nullable()
});
export type A4ProjectV1 = z.infer<typeof a4ProjectV1Schema>;
