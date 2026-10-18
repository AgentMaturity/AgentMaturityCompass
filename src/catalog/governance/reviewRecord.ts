/**
 * Catalog review record format (P1-34), stored as catalog/reviews/<subject-id>/<version>/<record-id>.json, and how a
 * reviewer signs one. Nothing here verifies or counts a record: only effectiveSupport (support.ts) turns verified
 * records into a control's support, deriving the reviewer from the pinned signing key, never from these fields.
 */
import { z } from "zod";
import { signHexDigest } from "../../crypto/keys.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const nonblank = z.string().regex(/\S/, "must contain a non-whitespace character");
const isoDate = z.iso.date();
const DOMAIN = "amc.catalog-review/v1";

export const reviewRecordSchema = z.strictObject({
  recordVersion: z.literal(1),
  id: z.string(),
  subject: z.strictObject({
    kind: z.enum(["control", "pack", "crosswalk", "citation"]),
    id: z.string(),
    version: z.string(),
    digest: z.string()
  }),
  role: z.enum(["domain_lead", "legal_reviewer", "risk_owner", "second_reviewer"]),
  reviewer: z.strictObject({
    name: z.string(),
    credential: nonblank,
    affiliation: z.string(),
    conflictsDeclared: nonblank,
    // AI agents draft and refute; they never approve (truth rule 8). userId must equal the signing key's trust-list subject.
    identity: z.strictObject({ userId: z.string(), kind: z.literal("human") })
  }),
  decision: z.enum(["approve", "reject", "request_changes"]),
  scope: z.array(z.enum(["statement", "applicability", "citations", "tests", "evidence", "crosswalk"])),
  aiInputs: z.array(z.strictObject({
    kind: z.enum(["draft", "refutation", "f5_verdict"]),
    ref: z.string(),
    confirmed: z.boolean()
  })),
  notes: z.string(),
  /** The signing time the record claims; verification refuses one after the server's clock or before the key's validity. */
  decidedAt: isoDate,
  nextReviewDue: isoDate,
  /** Ed25519 over reviewRecordDigest(record without `signature`). The key only names a candidate signer. */
  signature: z.strictObject({ publicKeyPem: z.string().min(1), value: z.string().min(1) })
});
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;

/** catalog/governance/f5-confirmations.yaml: the F5 verdicts a review record adopted. Unconfirmed verdicts change nothing. */
export const f5ConfirmationsFileSchema = z.strictObject({
  confirmationsVersion: z.literal(1),
  confirmations: z.array(z.strictObject({
    station: z.string().min(1), packId: z.string().min(1), questionId: z.string().min(1),
    verdict: z.enum(["keep", "rewrite", "merge", "drop"]), reviewRecordId: z.string().min(1)
  }))
});
export type F5Confirmation = z.infer<typeof f5ConfirmationsFileSchema>["confirmations"][number];

/** sha256 hex of the domain tag, a zero byte and the canonical record without its signature. */
export const reviewRecordDigest = (unsigned: Omit<ReviewRecord, "signature">): string =>
  sha256Hex(Buffer.concat([Buffer.from(DOMAIN, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(unsigned), "utf8")]));

/** What a reviewer runs with their own key; AMC never holds it (getSigningKey refuses `catalog-review`). */
export function signReviewRecord(unsigned: Omit<ReviewRecord, "signature">, key: { privateKeyPem: string; publicKeyPem: string }): ReviewRecord {
  return { ...unsigned, signature: { publicKeyPem: key.publicKeyPem, value: signHexDigest(reviewRecordDigest(unsigned), key.privateKeyPem) } };
}
