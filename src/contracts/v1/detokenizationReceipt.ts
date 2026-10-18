import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { PROTECTED_DATA_CLASSES } from "./redactionReceipt.js";

/**
 * One release of restored values to a processor (P2-02), written before sending: "released", not "delivered" (the action
 * journal has the outcome). Never a value, a token or a hash of one. Contract references are operator claims, not proof
 * of contractual or legal sufficiency. `contractReferences` lists every in-force contract covering a released class (for
 * `phi`, BAAs only); `registryDigest` is the SHA-256 of the signed processors.yaml bytes that decided.
 */
export const detokenizationReceiptV1Schema = z.strictObject({
  schema: z.literal("amc.detokenization-receipt/v1"),
  executionId: nonEmpty,
  processorId: nonEmpty,
  contractReferences: z.array(nonEmpty).min(1),
  purposeId: nonEmpty,
  destinationId: nonEmpty,
  dataClasses: z.array(z.enum(PROTECTED_DATA_CLASSES)).min(1),
  tokenCount: z.number().int().positive(),
  registryDigest: sha256HexSchema
});
export type DetokenizationReceiptV1 = z.infer<typeof detokenizationReceiptV1Schema>;
