/** A signed trust list (its issuer is the pinned root set) and a signed revocation list (its issuer a `revocation-list` key). */
import { canonicalize, statementMessage, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { result, type Env, type Evaluation } from "../evaluation.js";
import { signedRevocationList } from "../records/statements.js";
import { signedTrustList } from "../records/trustList.js";
import { attempt } from "../schema.js";
import { admit, listFacts, listedPem, rootAdmission } from "../trust.js";
import { chainHead, parseCanonical, refused, rollback, statementTail } from "./common.js";

export function evaluateTrustList(value: unknown, env: Env): Evaluation {
  const parsed = attempt(signedTrustList, value);
  if (!parsed.ok) return refused("trust-list", { code: parsed.error.code, detail: parsed.error.message });
  const { list } = parsed.value;
  const facts = listFacts(parsed.value, env.ctx.roots, env.ctx.asOf, env.ctx.knownSequences, env.ctx.pinnedThreshold, env.ctx.distrust);
  const integrity: Finding<"integrity">[] = facts.badSignature === null ? []
    : [{ code: "SIGNATURE_INVALID", detail: `the signature by ${facts.badSignature} does not verify` }];
  const admissions = parsed.value.signatures.filter(row => env.ctx.roots.has(row.keyId))
    .map(row => rootAdmission(`signatures[${row.keyId}]`, row.keyId, env.ctx));
  const admissionFindings: Finding<"issuerAdmission">[] = [];
  if (facts.pinned.length < facts.threshold) {
    admissionFindings.push({ code: "ISSUER_NOT_PINNED", detail: `${facts.pinned.length} signature(s) by pinned roots; the list requires ${facts.threshold}` });
  }
  if (facts.expired) admissionFindings.push({ code: "TRUST_LIST_EXPIRED", detail: `the list expired at ${list.expiresAt}` });
  if (facts.rolledBackFrom !== null) {
    admissionFindings.push({ code: "ROLLBACK_DETECTED", detail: `${list.listId} has sequence ${list.sequence}; ${facts.rolledBackFrom} is already known` });
  }
  return {
    kind: "trust-list", integrity, unverifiable: [], admissions, admissionFindings,
    anchoring: { status: "not-applicable", detail: null }, claimedAt: list.issuedAt, warnings: [],
    ...statementTail(env, list.issuedAt, null),
    completeness: () => result<"completeness">([])
  };
}

export function evaluateRevocationList(value: unknown, bytes: Uint8Array, env: Env): Evaluation {
  const parsed = parseCanonical(signedRevocationList, value, bytes);
  if (!parsed.ok) return refused("revocation-list", parsed.finding);
  const { list, signature, anchor } = parsed.value;
  const integrity: Finding<"integrity">[] = chainHead(list.sequence, list.previousSha256);
  const pem = listedPem(env.ctx, signature.keyId);
  if (pem !== null && !verifySignature(statementMessage("AMC_REVOCATION_LIST_V1", "AMC_REVOCATION_LIST_V2_DIGEST", canonicalize(list), parsed.value.signatureVersion), pem, Buffer.from(signature.signature, "base64"))) {
    integrity.push({ code: "SIGNATURE_INVALID", detail: "the signature does not verify" });
  }
  const admission = admit({ signature: "signature", keyId: signature.keyId, purpose: "revocation-list" }, env.ctx);
  return {
    kind: "revocation-list", integrity, unverifiable: pem === null ? ["signature: the signing key is not in the supplied trust lists"] : [],
    admissions: [admission], admissionFindings: rollback(list.listId, list.sequence, env),
    anchoring: { status: "not-applicable", detail: null }, claimedAt: list.issuedAt,
    warnings: anchor === null ? [] : ["anchor.transparencyEntryHash names a workspace transparency entry; it is not checked offline"],
    ...statementTail(env, list.issuedAt, list.previousSha256, admission.entry?.validFrom ?? null)
  };
}
