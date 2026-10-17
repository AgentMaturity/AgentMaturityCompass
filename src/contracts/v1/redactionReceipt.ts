import { z } from "zod";
import type { ProtectedDataClass } from "../../vault/dataClassification.js";
import { nonEmpty, sha256HexSchema } from "./common.js";

const PROTECTED_DATA_CLASSES = ["phi", "pii", "card_number", "bank_account", "credential"] as const satisfies readonly ProtectedDataClass[];
true satisfies ([ProtectedDataClass] extends [(typeof PROTECTED_DATA_CLASSES)[number]] ? true : false);

/**
 * One redaction of protected data before a row was committed (P2-02). It carries classes, detector names, counts, the
 * declared fields that matched and the digest of the redacted text only: never a raw value, a span or a hash of one.
 * `detectorsVersion` is the detector-set digest. Detection is heuristic; a receipt does not show that nothing was missed.
 * Sources are the native session's inputs and operator compaction text. `gateway` and `bridge` are the plan's sources for
 * stored gateway and bridge evidence, reserved in v1 so emitting them later does not change this enum; no receipt names
 * them yet.
 */
export const redactionReceiptV1Schema = z.strictObject({
  schema: z.literal("amc.redaction-receipt/v1"),
  sessionId: nonEmpty,
  source: z.enum(["user/message", "user/attachment", "tool/result", "loop/inbox", "operator/compaction", "gateway", "bridge"]),
  callId: nonEmpty.nullable(),
  detectorsVersion: sha256HexSchema,
  findings: z.array(z.strictObject({ dataClass: z.enum(PROTECTED_DATA_CLASSES), detector: nonEmpty, count: z.number().int().positive() })).min(1),
  declaredFields: z.array(nonEmpty),
  redactedDigest: sha256HexSchema
});
export type RedactionReceiptV1 = z.infer<typeof redactionReceiptV1Schema>;
