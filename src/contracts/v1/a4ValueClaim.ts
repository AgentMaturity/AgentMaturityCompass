import { z } from "zod";
import { claimEnvelopeSchema } from "../../claims/eligibility/schemas.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { a4SignedDigestSchema } from "./a4Release.js";

/**
 * `amc.a4-value-claim/v1`: one record per KPI per release, four lanes side by side, never merged. `observed.value` is
 * null unless at least one ref resolved and none dangles. Rule beyond JSON Schema: `verified.status: reviewed` needs an
 * admitted external record whose scope names this KPI and window.
 */
const observedFields = {
  window: z.strictObject({ from: z.iso.datetime(), to: z.iso.datetime() }),
  evidenceRefs: z.array(nonEmpty),
  claim: claimEnvelopeSchema
};
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
  observed: z.union([
    z.strictObject({ ...observedFields, value: z.null(), resolvedRefs: z.number().int().min(0), danglingRefs: z.number().int().min(0) }),
    z.strictObject({ ...observedFields, value: z.number(), resolvedRefs: z.number().int().min(1), danglingRefs: z.literal(0) })
  ]),
  verified: z.strictObject({
    status: z.enum(["not_evaluated", "reviewed"]), reviewer: z.string().nullable(), reason: z.string().nullable(), claim: claimEnvelopeSchema
  }),
  objective: z.strictObject({ kind: z.enum(["business", "sustainability", "social"]), statement: nonEmpty, basis: nonEmpty }),
  createdAt: z.iso.datetime(),
  envelope: a4SignedDigestSchema
});
export type A4ValueClaimV1 = z.infer<typeof a4ValueClaimV1Schema>;
