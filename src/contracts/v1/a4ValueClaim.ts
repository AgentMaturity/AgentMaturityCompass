import { z } from "zod";
import { claimEnvelopeSchema } from "../../claims/eligibility/schemas.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { a4SignedDigestSchema } from "./a4Release.js";

/**
 * `amc.a4-value-claim/v1`: one record per KPI per release, four lanes side by side, never merged. Rules beyond JSON
 * Schema: `observed.value` is null while any ref dangles; `verified.status: reviewed` needs an admitted external
 * record whose scope names this KPI and window.
 */
export const a4ValueClaimV1Schema = z.strictObject({
  schema: z.literal("amc.a4-value-claim/v1"),
  projectId: nonEmpty,
  revisionNo: z.number().int().min(1),
  releaseId: nonEmpty,
  kpiId: nonEmpty,
  label: nonEmpty,
  unit: nonEmpty,
  recommended: z.strictObject({
    target: z.string().nullable(), source: z.enum(["aspire_brief", "value_contract", "outcome_contract"]), note: z.string(),
    claimKind: z.literal("self_reported")
  }),
  implemented: z.strictObject({
    instrumentation: z.enum(["value_contract", "outcome_contract", "none"]), contractDigest: sha256HexSchema.nullable(),
    claimKind: z.literal("self_reported")
  }),
  observed: z.strictObject({
    value: z.number().nullable(),
    window: z.strictObject({ from: z.iso.datetime(), to: z.iso.datetime() }),
    evidenceRefs: z.array(nonEmpty),
    resolvedRefs: z.number().int().min(0),
    danglingRefs: z.number().int().min(0),
    claim: claimEnvelopeSchema
  }).refine((observed) => observed.danglingRefs === 0 || observed.value === null, { message: "observed.value must be null while a ref dangles" }),
  verified: z.strictObject({
    status: z.enum(["not_evaluated", "reviewed"]), reviewer: z.string().nullable(), reason: z.string().nullable(), claim: claimEnvelopeSchema
  }),
  objective: z.strictObject({ kind: z.enum(["business", "sustainability", "social"]), statement: nonEmpty, basis: nonEmpty }),
  createdAt: z.iso.datetime(),
  envelope: a4SignedDigestSchema
});
export type A4ValueClaimV1 = z.infer<typeof a4ValueClaimV1Schema>;
