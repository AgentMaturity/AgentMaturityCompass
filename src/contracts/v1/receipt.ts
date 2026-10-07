import { z } from "zod";
import type { ReceiptKind, ReceiptPayloadV1 } from "../../receipts/receipt.js";
import { enforcementLevelSchema, isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

const RECEIPT_KINDS = ["llm_request", "llm_response", "tool_action", "tool_result", "guard_check", "work_accepted", "action_state"] as const satisfies readonly ReceiptKind[];
true satisfies ([ReceiptKind] extends [(typeof RECEIPT_KINDS)[number]] ? true : false);

const payloadFields = {
  kind: z.enum(RECEIPT_KINDS),
  receipt_id: nonEmpty,
  ts: z.number().int(),
  agentId: z.string(),
  providerId: z.string(),
  model: z.string().nullable(),
  event_hash: nonEmpty,
  body_sha256: nonEmpty,
  session_id: z.string()
};

/**
 * The signed payload AMC mints today (`mintReceipt`): a kind, no state. Not strict: `mintChainedReceipt` signs two
 * more members into the same v1 payload. AMC's receipt check (`parseReceipt`, P1-03) parses with this schema, so it
 * still accepts a signed member it does not know and drops it from the payload it returns.
 */
export const receiptV1Schema = z.object({
  v: z.literal(1),
  ...payloadFields,
  parent_receipt_id: z.string().nullable().optional(),
  delegation_chain: z.array(z.string()).optional()
});
true satisfies ([z.infer<typeof receiptV1Schema>] extends [ReceiptPayloadV1] ? [ReceiptPayloadV1] extends [z.infer<typeof receiptV1Schema>] ? true : false : false);

/** How an `outcome_unknown` execution was settled. A receipt that follows `outcome_unknown` must carry it (acceptance rule). */
const reconciliationSchema = z.strictObject({
  fromReceiptId: nonEmpty,
  reconciledAt: isoTimeSchema,
  method: nonEmpty,
  evidenceRefs: z.array(nonEmpty)
});

const v2Fields = {
  v: z.literal(2),
  ...payloadFields,
  executionId: nonEmpty,
  /** Null until P1-04 issues idempotency keys. */
  idempotencyKey: nonEmpty.nullable(),
  authorizationRecordDigest: sha256HexSchema.nullable(),
  enforcement: enforcementLevelSchema
};

/** One state of one execution. Only `denied` carries a reason; only `completed` or `cancelled` carries a reconciliation. */
export const receiptV2Schema = z.discriminatedUnion("state", [
  z.strictObject({ ...v2Fields, state: z.enum(["requested", "authorized", "started", "outcome_unknown"]) }),
  z.strictObject({ ...v2Fields, state: z.enum(["completed", "cancelled"]), reconciliation: reconciliationSchema.optional() }),
  z.strictObject({ ...v2Fields, state: z.literal("denied"), reason: nonEmpty })
]);
export type ReceiptV2 = z.infer<typeof receiptV2Schema>;
