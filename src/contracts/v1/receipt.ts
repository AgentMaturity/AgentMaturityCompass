import { z } from "zod";
import type { ReceiptKind, ReceiptPayloadV1 } from "../../receipts/receipt.js";
import { enforcementLevelSchema, isoTimeSchema, nonEmpty, sha256HexSchema } from "./common.js";

const RECEIPT_KINDS = ["llm_request", "llm_response", "tool_action", "tool_result", "guard_check", "work_accepted"] as const satisfies readonly ReceiptKind[];
true satisfies ([ReceiptKind] extends [(typeof RECEIPT_KINDS)[number]] ? true : false);

const payloadFields = {
  kind: z.enum(RECEIPT_KINDS),
  receipt_id: nonEmpty,
  ts: z.number().int(),
  agentId: z.string(),
  providerId: z.string(),
  model: z.string().nullable(),
  event_hash: z.string(),
  body_sha256: z.string(),
  session_id: z.string()
};

/** The signed payload AMC mints today (`mintReceipt`): a kind, no state. */
export const receiptV1Schema = z.strictObject({ v: z.literal(1), ...payloadFields });
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
