import { z } from "zod";
import { approvalRequestSchema } from "../../approvals/approvalChainStore.js";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { a4DecisionV1Schema } from "./a4Decision.js";
import { a4IntentV1Schema } from "./a4Intent.js";
import { A4_GATES, A4_STAGES } from "./a4Project.js";

/**
 * `amc.a4-gate/v1`: one documentary gate request (an ApprovalRequestRecord), its decisions, the quorum and three
 * integrity facts about bytes (never a claim about the agent).
 */
export const a4GateV1Schema = z.strictObject({
  schema: z.literal("amc.a4-gate/v1"),
  gateId: nonEmpty,
  projectId: nonEmpty,
  revisionNo: z.number().int().min(0),
  stage: z.enum(A4_STAGES),
  gate: z.enum(A4_GATES),
  request: approvalRequestSchema,
  bindingDigest: sha256HexSchema,
  intent: a4IntentV1Schema,
  readinessSha256: sha256HexSchema,
  boundItems: z.array(nonEmpty),
  gatePolicyDigest: sha256HexSchema,
  requestedByKey: nonEmpty,
  excludedKeys: z.array(nonEmpty),
  expiresTs: z.number().int(),
  decisions: z.array(a4DecisionV1Schema),
  quorum: z.strictObject({
    status: z.enum(["PENDING", "QUORUM_MET", "DENIED", "EXPIRED"]),
    approvals: z.number().int().min(0),
    required: z.number().int().min(1)
  }),
  integrity: z.strictObject({
    /** binding_digest recomputes from the stored request. */
    bindingDigestValid: z.boolean(),
    /** every counted decision carries a requestDigestSha256 equal to binding_digest. */
    decisionsBound: z.boolean(),
    /** the A4_RECORD envelope verifies; null while none was written. */
    envelopeValid: z.boolean().nullable()
  }),
  supersededBy: z.strictObject({ seq: z.number().int().min(0), kind: nonEmpty }).nullable(),
  ts: z.number().int()
});
export type A4GateV1 = z.infer<typeof a4GateV1Schema>;
