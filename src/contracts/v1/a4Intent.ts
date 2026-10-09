import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_GATES, A4_STAGES } from "./a4Project.js";

/** `amc.a4-intent/v1`: what a gate binds; `boundHashes.intentHash` of the gate request is its canonical sha256. */
export const a4IntentV1Schema = z.strictObject({
  schema: z.literal("amc.a4-intent/v1"),
  projectId: nonEmpty,
  stage: z.enum(A4_STAGES),
  gate: z.enum(A4_GATES),
  revisionNo: z.number().int().min(0),
  specDigest: sha256HexSchema,
  /** A4ResourceDigests slots by path, e.g. "enforce.manifestId". */
  resourceDigests: z.record(z.string(), z.string().min(1).nullable()),
  memberSetDigest: sha256HexSchema,
  evidenceRefDigests: z.array(sha256HexSchema),
  /** sha256 over A4_BOUND_ITEMS[stage] as evaluated at GATE_REQUESTED (design §7 item 7). */
  readinessBindingDigest: sha256HexSchema,
  /** The stored bound set; decide and complete recompute exactly these. */
  boundItemIds: z.array(nonEmpty),
  gatePolicyDigest: sha256HexSchema,
  excludedKeys: z.array(nonEmpty)
});
export type A4IntentV1 = z.infer<typeof a4IntentV1Schema>;
