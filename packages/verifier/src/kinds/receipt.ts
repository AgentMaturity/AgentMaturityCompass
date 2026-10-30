/**
 * State receipt (receipt v2): `<base64url(payload)>.<base64url(signature)>`, Ed25519 over the payload bytes as received,
 * by a key admitted for `receipt`. The receipt names no key, so its signer is searched among the supplied trust lists'
 * keys. It is anchored when the exported ledger row it names (evidence-event, `eventHash` = `event_hash`) carries a
 * writerSignature by a key admitted for `ledger-row`.
 */
import { base64UrlDecode, isCanonicalSignatureBase64, parseJson, same, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { actionReceipt, evidenceEvent, receiptPayload, type ActionReceipt, type ReceiptPayload } from "../records/evidence.js";
import { attempt, isRecord } from "../schema.js";
import { admit, listedKeys, type Admission, type TrustContext } from "../trust.js";
import { refused } from "./common.js";

function signerOf(message: Uint8Array, signature: Uint8Array, ctx: TrustContext): string | null {
  return listedKeys(ctx).find(key => verifySignature(message, key.publicKeyPem, signature))?.keyId ?? null;
}

interface Anchor {
  anchoring: Evaluation["anchoring"];
  admission: Admission | null;
  finding: Finding<"issuerAdmission"> | null;
}

/** The ledger row the receipt names, checked and admitted for ledger-row. Malformed rows are integrity failures. */
function anchorOf(payload: ReceiptPayload, env: Env, integrity: Finding<"integrity">[]): Anchor {
  const unanchored = (detail: string, admission: Admission | null = null): Anchor =>
    ({ anchoring: { status: "unanchored", detail }, admission, finding: { code: "UNANCHORED", detail } });
  const rows = env.evidence.digests().map(digest => env.evidence.json(digest))
    .filter(item => isRecord(item) && typeof item.eventHash === "string" && same(item.eventHash, payload.event_hash));
  if (rows.length === 0) return unanchored(`the ledger row ${payload.event_hash} was not supplied`);
  if (rows.length > 1) {
    integrity.push({ code: "MALFORMED", detail: `${rows.length} supplied ledger rows claim event hash ${payload.event_hash}` });
    return unanchored("the ledger row is ambiguous");
  }
  const row = attempt(evidenceEvent, rows[0]);
  if (!row.ok) {
    integrity.push({ code: "MALFORMED", detail: `the ledger row is not a valid evidence-event (${row.error.message})` });
    return unanchored("the ledger row is malformed");
  }
  if (!same(row.value.payloadSha256, payload.body_sha256)) {
    integrity.push({ code: "DIGEST_MISMATCH", detail: "the ledger row's payloadSha256 is not the receipt's body_sha256" });
  }
  const signature = row.value.writerSignature;
  const signer = isCanonicalSignatureBase64(signature) ? signerOf(Buffer.from(row.value.eventHash, "hex"), Buffer.from(signature, "base64"), env.ctx) : null;
  if (signer === null) return unanchored("no key in the supplied trust lists signed the ledger row");
  const admission = admit({ signature: "ledger row writerSignature", keyId: signer, purpose: "ledger-row" }, env.ctx);
  if (admission.finding) return unanchored(`the ledger row's signer is not admitted for ledger-row (${admission.record.status})`, admission);
  return { anchoring: { status: "anchored", detail: `the ledger key ${signer}, admitted for ledger-row, signed this eventHash` }, admission, finding: null };
}

function completeness(payload: ReceiptPayload, body: ActionReceipt | null, env: Env) {
  const findings: Finding<"completeness">[] = [];
  if (!env.evidence.has(payload.body_sha256)) findings.push({ code: "EVIDENCE_MISSING", detail: `the receipt body ${payload.body_sha256} was not supplied` });
  if (body && (body.executionId !== payload.executionId || body.state !== payload.state || body.agentId !== payload.agentId)) {
    findings.push({ code: "CONTRADICTORY_EVIDENCE", detail: "the receipt body names another execution, state or agent" });
  }
  if (payload.state === "outcome_unknown") findings.push({ code: "OUTCOME_UNKNOWN", detail: `execution ${payload.executionId} is outcome_unknown` });
  if (body && !body.evidenceComplete) findings.push({ code: "EVIDENCE_MISSING", detail: "the receipt body marks its evidence incomplete" });
  return result(findings);
}

export function evaluateReceipt(token: string, env: Env): Evaluation {
  const parts = token.split(".");
  const payloadBytes = parts.length === 2 ? base64UrlDecode(parts[0]!) : null;
  const signature = parts.length === 2 ? base64UrlDecode(parts[1]!) : null;
  if (!payloadBytes || !signature || signature.length !== 64) {
    return refused("receipt", { code: "MALFORMED", detail: "a receipt is <base64url payload>.<base64url 64-byte signature>" });
  }
  let raw: unknown;
  try { raw = parseJson(payloadBytes); } catch (error) {
    return refused("receipt", { code: "MALFORMED", detail: `the payload is ${error instanceof Error ? error.message : String(error)}` });
  }
  const parsed = attempt(receiptPayload, raw);
  if (!parsed.ok) return refused("receipt", { code: parsed.error.code, detail: parsed.error.message });
  const payload = parsed.value;
  const integrity: Finding<"integrity">[] = [];
  let body: ActionReceipt | null = null;
  if (payload.kind === "action_state" && env.evidence.has(payload.body_sha256)) {
    const checked = attempt(actionReceipt, env.evidence.json(payload.body_sha256));
    if (checked.ok) body = checked.value;
    else integrity.push({ code: "MALFORMED", detail: `the receipt body is not a valid amc.action-receipt/v1 (${checked.error.message})` });
  }
  const signer = signerOf(payloadBytes, signature, env.ctx);
  const admission = admit({ signature: "receipt", keyId: signer, purpose: "receipt" }, env.ctx);
  const anchor = anchorOf(payload, env, integrity);
  return {
    kind: "receipt", integrity, admissions: [admission, ...(anchor.admission ? [anchor.admission] : [])],
    unverifiable: signer === null ? ["receipt: no key in the supplied trust lists made this signature"] : [],
    admissionFindings: anchor.finding ? [anchor.finding] : [], anchoring: anchor.anchoring,
    claimedAt: Number.isNaN(new Date(payload.ts).getTime()) ? String(payload.ts) : new Date(payload.ts).toISOString(),
    // Until the export carries a portable pre-image (P1-30), a row's other fields cannot be bound to its signed hash.
    warnings: anchor.anchoring.status === "anchored" ? ["the ledger row is anchored, but only its eventHash is signed: its other fields (ts, eventType, claimKind, payloadSha256) are unauthenticated"] : [],
    scope: () => scopeResult({ subject: payload.agentId }, env.expect),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      if (env.ctx.asOf < payload.ts) findings.push({ code: "NOT_YET_VALID", detail: "the receipt's ts is after the as-of time" });
      if (admission.entry && payload.ts < Date.parse(admission.entry.validFrom)) {
        findings.push({ code: "CLAIMED_TIME_BEFORE_KEY_VALIDITY", detail: `ts is before the key's validFrom ${admission.entry.validFrom}` });
      }
      return result(findings);
    },
    completeness: () => completeness(payload, body, env),
    satisfaction: () => notRecomputable("a receipt proves that a ledger row was written, not the outcome of the work")
  };
}
