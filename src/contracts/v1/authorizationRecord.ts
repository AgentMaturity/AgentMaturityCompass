import { z } from "zod";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import type { ActionClass } from "../../types.js";
import { exceptionRefSchema, isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);
const nullableText = nonEmpty.nullable();

/**
 * Who authorized which effect, built from trusted sources at the enforcement point (P1-02 binds it). Every field is
 * AMC's own record except `agentSuppliedMetadata`: what the agent said about the call, kept apart, untrusted and never
 * decisive.
 */
export const authorizationRecordV1Schema = z.strictObject({
  schema: z.literal("amc.authorization-record/v1"),
  authorizationId: nonEmpty,
  executionId: nonEmpty,
  issuedAt: isoTimeSchema,
  expiresAt: isoTimeSchema,
  scope: z.strictObject({ workspaceId: nonEmpty, tenantId: nullableText, deploymentId: nonEmpty, deploymentDigest: sha256HexSchema }),
  subject: z.strictObject({ governedAs: nonEmpty, runAs: nonEmpty, agentConfigDigest: sha256HexSchema.nullable() }),
  principal: z.strictObject({
    principalId: nonEmpty,
    kind: z.enum(["human", "service"]),
    authenticatedVia: z.enum(["studio-session", "lease", "approval-engine", "cli-os-user"])
  }),
  delegation: z.strictObject({
    depth: z.number().int().nonnegative(),
    parentExecutionId: nullableText,
    allowedActionClasses: z.array(actionClassSchema),
    leaseId: nullableText
  }),
  session: z.strictObject({ sessionId: nullableText, runId: nullableText, callId: nonEmpty, rootCallId: nonEmpty, parentToken: nullableText }),
  control: z.strictObject({ controlId: nullableText, controlVersion: nullableText }),
  policy: z.strictObject({
    compiledPolicyDigest: sha256HexSchema.nullable(),
    policyRevision: z.number().int().nonnegative().nullable(),
    toolsConfigDigest: sha256HexSchema,
    actionPolicyDigest: sha256HexSchema,
    approvalPolicyDigest: sha256HexSchema,
    budgetsDigest: sha256HexSchema
  }),
  action: z.strictObject({
    toolName: nonEmpty,
    adapterId: nonEmpty,
    actionClass: actionClassSchema,
    mode: z.enum(["EXECUTE", "SIMULATE"]),
    argumentsDigest: sha256HexSchema,
    normalizer: nonEmpty
  }),
  resource: z.strictObject({ purpose: nullableText, dataClasses: z.array(nonEmpty) }),
  bindings: z.strictObject({
    amount: z.strictObject({ value: z.string().regex(/^-?\d+(\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) }).nullable(),
    recipient: nullableText,
    destination: nullableText,
    resourceId: nullableText,
    resourceVersion: nullableText
  }),
  authority: z.strictObject({
    approvals: z.array(z.strictObject({
      approvalRequestId: nonEmpty,
      requestBindingDigest: sha256HexSchema,
      intentHash: sha256HexSchema,
      actionClass: actionClassSchema,
      approverIds: z.array(nonEmpty).min(1),
      expiresAt: isoTimeSchema
    })),
    exceptions: z.array(exceptionRefSchema)
  }),
  idempotencyKey: nullableText,
  evidenceRefs: z.array(nonEmpty),
  /** Untrusted: copied from the call's arguments; no rule may read it. */
  agentSuppliedMetadata: z.record(z.string(), z.unknown()).optional()
});
export type AuthorizationRecordV1 = z.infer<typeof authorizationRecordV1Schema>;
