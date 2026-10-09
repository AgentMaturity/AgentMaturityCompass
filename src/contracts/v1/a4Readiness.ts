import { z } from "zod";
import { claimEnvelopeSchema } from "../../claims/eligibility/schemas.js";
import { verifierReportSchema } from "../../trust/verifierReport.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_IDENTITY_CHECKS, A4_ITEM_STATUSES, A4_LANES, A4_READINESS_STATUSES } from "./a4Project.js";

/** P2-22's blocker vocabulary verbatim plus the A4-only kinds (design §7 rule 3). */
export const A4_BLOCKER_KINDS = [
  "not_evaluated", "evidence_missing", "evidence_stale", "evidence_contradictory", "evidence_untrusted", "review_pending",
  "exception_expiring", "waiver_expiring", "outcome_unknown", "source_unavailable",
  "unsupported_integration", "scope_changed", "self_approved", "effect_failed", "hold", "sod_violation", "plan_denies_native_session"
] as const;

const nextActionSchema = z.strictObject({ label: nonEmpty, route: z.string().optional(), command: z.string().optional() });

const evidenceRefFields = {
  refKind: nonEmpty,
  refId: nonEmpty,
  sha256: sha256HexSchema,
  status: z.enum(["resolved", "dangling", "payload_pruned", "unsigned"]),
  trustTier: z.string().nullable(),
  reasonCodes: z.array(nonEmpty)
};
/** Lane and claim kind pair as the migration's lane CHECK pairs them, so the four lanes never collapse into one another. */
export const a4EvidenceRefViewSchema = z.union([
  z.strictObject({ ...evidenceRefFields, lane: z.literal("observed"), claimKind: z.literal("observed") }),
  z.strictObject({ ...evidenceRefFields, lane: z.literal("verified"), claimKind: z.literal("independently_reviewed") }),
  z.strictObject({ ...evidenceRefFields, lane: z.enum(["recommendation", "implementation"]), claimKind: z.enum(["self_reported", "synthetic_example"]) })
]);

const itemFields = {
  id: nonEmpty,
  status: z.enum(A4_ITEM_STATUSES),
  kind: z.enum(A4_BLOCKER_KINDS).nullable(),
  reasonCodes: z.array(nonEmpty),
  report: verifierReportSchema.nullable(),
  acknowledged: z.strictObject({ by: nonEmpty, ts: z.number().int(), expiresTs: z.number().int(), reason: nonEmpty }).nullable(),
  nextAction: nextActionSchema.nullable(),
  mandatory: z.boolean(),
  bound: z.boolean()
};

export const a4ReadinessItemSchema = z.union([
  z.strictObject({ ...itemFields, section: z.enum([...A4_LANES, "governance"]), evidence: z.array(a4EvidenceRefViewSchema), claim: claimEnvelopeSchema.nullable() }),
  /** "integrity" is a fifth, non-claim section, never a lane: it carries no claim and no evidence ref. */
  z.strictObject({ ...itemFields, section: z.literal("integrity"), evidence: z.array(a4EvidenceRefViewSchema).max(0), claim: z.null() })
]);

/** `amc.a4-readiness/v1`: the one evaluator's output; one claim envelope per result. */
export const a4ReadinessV1Schema = z.strictObject({
  schema: z.literal("amc.a4-readiness/v1"),
  status: z.enum(A4_READINESS_STATUSES),
  items: z.array(a4ReadinessItemSchema),
  nextAction: nextActionSchema.nullable(),
  allowed: z.record(z.string(), z.strictObject({ allowed: z.boolean(), reasonCodes: z.array(nonEmpty) })),
  gates: z.strictObject({ direction: z.record(z.string(), z.unknown()).nullable(), completion: z.record(z.string(), z.unknown()).nullable() }),
  staleApprovals: z.array(z.strictObject({ gateId: nonEmpty, decisionId: nonEmpty, reasonCodes: z.array(nonEmpty) })),
  integrity: z.strictObject({ valid: z.boolean(), reasonCodes: z.array(nonEmpty) }),
  claim: claimEnvelopeSchema,
  claimBoundary: nonEmpty,
  selfApproved: z.boolean(),
  selfApprovalAllowed: z.boolean(),
  identityCheck: z.enum(A4_IDENTITY_CHECKS),
  evaluatedAt: z.iso.datetime(),
  bindingDigest: sha256HexSchema,
  fullDigest: sha256HexSchema
});
export type A4ReadinessV1 = z.infer<typeof a4ReadinessV1Schema>;
