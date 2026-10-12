/** Shape validation of each record the verifier reads, without signatures or trust: what AMC's own schemas accept. */
import { same } from "./bytes.js";
import { scopedAttestation } from "./records/attestation.js";
import { actionReceipt, controlResult, evidenceEvent, receiptPayload } from "./records/evidence.js";
import { externalEvidence, normalizedDigest } from "./records/externalEvidence.js";
import { signedKeyRotation, signedRevocationList, signedRootRotation } from "./records/statements.js";
import { signedTrustList } from "./records/trustList.js";
import { attempt, type Check, type ShapeCode } from "./schema.js";

const CHECKS = {
  "trust-list": signedTrustList,
  "scoped-attestation": scopedAttestation,
  "receipt-payload": receiptPayload,
  "action-receipt": actionReceipt,
  "control-result": controlResult,
  "evidence-event": evidenceEvent,
  "key-rotation": signedKeyRotation,
  "root-rotation": signedRootRotation,
  "revocation-list": signedRevocationList,
  "external-evidence": externalEvidence
} satisfies Record<string, Check<unknown>>;
export type RecordKind = keyof typeof CHECKS;
export const RECORD_KINDS = Object.keys(CHECKS) as RecordKind[];

/** `ok` when `value` is a well-formed record of `kind`; otherwise the first problem and its integrity code. */
export function validateRecord(kind: RecordKind, value: unknown): { ok: true } | { ok: false; code: ShapeCode | "DIGEST_MISMATCH"; message: string } {
  const parsed = attempt(CHECKS[kind] as Check<unknown>, value);
  if (!parsed.ok) return { ok: false, code: parsed.error.code, message: parsed.error.message };
  if (kind === "external-evidence") {
    const profile = parsed.value as ReturnType<typeof externalEvidence>;
    if (!same(normalizedDigest(profile), profile.normalization.normalizedSha256)) return { ok: false, code: "DIGEST_MISMATCH", message: "normalization: digest mismatch" };
  }
  return { ok: true };
}
