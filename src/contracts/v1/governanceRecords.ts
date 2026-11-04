import { z } from "zod";
import { USER_ROLES, type UserRole } from "../../auth/roles.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import type { ActionClass } from "../../types.js";
import { isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

/**
 * The P2-24 governance records (backlog A08): a scoped exception, a break-glass record and its action rows, and a review
 * record. Each record is approved before it exists (`approval` names the request its draft digest raised) and is signed
 * as an artifact under `.amc/governor/`. Refinements that JSON Schema cannot carry (no `*` wildcard in a scope name,
 * window lengths, reviewer differs from requester) are in spec/ACCEPTANCE_RULES.md.
 */
const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);
const roleSchema = z.enum(USER_ROLES as unknown as [UserRole, ...UserRole[]]);

/** No wildcard: an entry naming everything is a switch, not a scoped deviation. */
const scopedNamesSchema = z.array(nonEmpty.refine((name) => !name.includes("*"), "no wildcard")).min(1);

/** Which approval request approved the record: the agent store it lives in, its id and its binding digest. */
export const boundApprovalSchema = z.strictObject({
  agentId: nonEmpty,
  approvalRequestId: z.string().regex(/^apprreq_[a-f0-9]{32}$/),
  requestBindingDigest: sha256HexSchema
});
export type BoundApproval = z.infer<typeof boundApprovalSchema>;

const windowSchema = z.strictObject({ notBefore: isoTimeSchema, notAfter: isoTimeSchema });

export const scopedExceptionV1Schema = z.strictObject({
  schema: z.literal("amc.scoped-exception/v1"),
  exceptionId: z.string().regex(/^sex_[a-f0-9]{24}$/),
  control: z.strictObject({ controlId: nonEmpty, controlVersion: nonEmpty }),
  scope: z.strictObject({
    workspaceId: nonEmpty,
    agentIds: scopedNamesSchema,
    toolNames: scopedNamesSchema,
    actionClasses: z.array(actionClassSchema).min(1),
    /** null covers any resource and needs a written justification in `reason`. */
    resourceIds: z.array(nonEmpty).min(1).nullable(),
    maxAmount: z.strictObject({ value: z.string().regex(/^\d+(\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) }).nullable()
  }),
  window: windowSchema,
  reason: z.string().trim().min(10),
  compensatingControls: z.array(nonEmpty),
  requestedBy: nonEmpty,
  approval: boundApprovalSchema
});
export type ScopedExceptionV1 = z.infer<typeof scopedExceptionV1Schema>;

export const breakGlassRecordV1Schema = z.strictObject({
  schema: z.literal("amc.break-glass/v1"),
  breakGlassId: z.string().regex(/^bg_[a-f0-9]{24}$/),
  activatedBy: z.strictObject({ userId: nonEmpty, roles: z.array(roleSchema) }),
  reason: z.string().trim().min(10),
  scope: z.strictObject({ workspaceId: nonEmpty, agentIds: scopedNamesSchema, toolNames: scopedNamesSchema,
    actionClasses: z.array(actionClassSchema).min(1), controlIds: scopedNamesSchema }),
  window: windowSchema,
  incidentId: nonEmpty,
  postHocReviewDueAt: isoTimeSchema,
  prevBreakGlassDigest: z.union([sha256HexSchema, z.literal("GENESIS")]),
  approval: boundApprovalSchema
});
export type BreakGlassRecordV1 = z.infer<typeof breakGlassRecordV1Schema>;

/** One call made under a break-glass record: a `BREAK_GLASS_ACTION` ledger row's payload. */
export const breakGlassActionV1Schema = z.strictObject({ breakGlassId: nonEmpty, executionId: nonEmpty, authorizationDigest: sha256HexSchema, at: isoTimeSchema });
export type BreakGlassActionV1 = z.infer<typeof breakGlassActionV1Schema>;

const REVIEWABLE_KINDS = ["compiled-plan", "control-result", "scoped-exception", "break-glass-packet", "agent-output", "attestation-draft"] as const;
export type ReviewableKind = (typeof REVIEWABLE_KINDS)[number];

export const reviewRecordV1Schema = z.strictObject({
  schema: z.literal("amc.review-record/v1"),
  reviewId: z.string().regex(/^rev_[a-f0-9]{24}$/),
  subject: z.strictObject({ kind: z.enum(REVIEWABLE_KINDS), id: nonEmpty, sha256: sha256HexSchema }),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  reviewer: z.strictObject({ userId: nonEmpty, roles: z.array(roleSchema).min(1) }),
  /** Must differ from `reviewer.userId`. */
  requesterId: nonEmpty,
  findings: z.array(z.strictObject({ code: nonEmpty, severity: z.enum(["info", "minor", "major", "critical"]), note: z.string() })),
  reviewedAt: isoTimeSchema,
  expiresAt: isoTimeSchema.nullable(),
  approval: boundApprovalSchema
});
export type ReviewRecordV1 = z.infer<typeof reviewRecordV1Schema>;
