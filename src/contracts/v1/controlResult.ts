import { z } from "zod";
import { claimKindSchema, statusDimensionsSchema } from "../../claims/eligibility/schemas.js";
import { exceptionRefSchema, isoTimeSchema, nonEmpty } from "./common.js";

const { applicability, evidence, enforcement, review } = statusDimensionsSchema.shape;

/** The five status dimensions of P0-08, with "`pass` needs applicable and sufficient evidence" in the shape itself. */
const dimensionsSchema = z.discriminatedUnion("result", [
  z.strictObject({
    result: z.literal("pass"),
    applicability: z.strictObject({ state: z.literal("applicable") }),
    evidence: z.literal("sufficient"),
    enforcement,
    review
  }),
  z.strictObject({ result: z.enum(["fail", "not_evaluated"]), applicability, evidence, enforcement, review })
]);

/** One control's result. Exceptions granted against the control and a paid entitlement are separate facts; neither changes the result. */
export const controlResultV1Schema = z.strictObject({
  type: z.literal("amc.control-result"),
  version: z.literal(1),
  controlId: nonEmpty,
  controlVersion: nonEmpty,
  evaluatedAt: isoTimeSchema,
  dimensions: dimensionsSchema,
  claimKind: claimKindSchema,
  evidenceRefs: z.array(nonEmpty),
  exceptions: z.array(exceptionRefSchema),
  entitlement: z.strictObject({ active: z.boolean() }).optional()
});
export type ControlResultV1 = z.infer<typeof controlResultV1Schema>;
