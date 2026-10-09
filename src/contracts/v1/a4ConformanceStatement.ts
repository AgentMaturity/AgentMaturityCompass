import { z } from "zod";
import { claimEnvelopeSchema, claimKindSchema, statusDimensionsSchema } from "../../claims/eligibility/schemas.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_STAGES } from "./a4Project.js";

const { applicability, evidence, result, enforcement, review } = statusDimensionsSchema.shape;
const acknowledgementSchema = z.strictObject({ by: nonEmpty, ts: z.number().int(), expiresTs: z.number().int(), reason: nonEmpty });

/**
 * `amc.a4-conformance-statement/v1`: per control, the five status dimensions; counts, never a score or a percentage.
 * Owner-settled requirements stay in counts.unresolved; an acknowledged item stays WAITING.
 */
export const a4ConformanceStatementV1Schema = z.strictObject({
  schema: z.literal("amc.a4-conformance-statement/v1"),
  stage: z.enum(A4_STAGES),
  revisionDigest: sha256HexSchema,
  planDigest: sha256HexSchema.nullable(),
  evaluatedAt: z.iso.datetime(),
  controls: z.array(z.strictObject({
    controlId: nonEmpty, version: nonEmpty, support: nonEmpty, reviewStatus: nonEmpty,
    applicability, evidence, result, enforcement, review, claimKind: claimKindSchema,
    evidenceRefs: z.array(nonEmpty), notEvaluatedReason: z.string().optional()
  })),
  counts: z.strictObject({
    pass: z.number().int().min(0), fail: z.number().int().min(0), not_evaluated: z.number().int().min(0),
    not_applicable: z.number().int().min(0), unresolved: z.number().int().min(0)
  }),
  ownerOutOfScope: z.array(z.strictObject({ controlId: nonEmpty, by: nonEmpty, ts: z.number().int(), reason: nonEmpty })),
  unsupported: z.array(nonEmpty),
  missingFacts: z.array(nonEmpty),
  /** review_record refs only; a role vote is never an expert review. */
  expertReview: z.strictObject({ required: z.boolean(), records: z.array(nonEmpty), acknowledgement: acknowledgementSchema.nullable() }),
  claim: claimEnvelopeSchema,
  claimBoundary: nonEmpty
});
export type A4ConformanceStatementV1 = z.infer<typeof a4ConformanceStatementV1Schema>;
