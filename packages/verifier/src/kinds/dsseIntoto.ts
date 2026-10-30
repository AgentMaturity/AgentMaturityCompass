/**
 * DSSE-wrapped in-toto Statement v1 with AMC's control-results predicate (P1-27), bare or in a key-based Sigstore bundle.
 * The Ed25519 signature covers the DSSE PAE and is checked with the key the supplied trust lists hold for its `keyid`,
 * admitted for artifact-seal (independent-attestation when the statement claims independently_reviewed). Every subject
 * and every evidence digest must be among the supplied evidence bytes, so a changed AIBOM or bundle matches nothing.
 */
import { isCanonicalSignatureBase64, parseJson, same, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { dsseEnvelope, INTOTO_PAYLOAD_TYPE, intotoStatement, sigstoreDsseBundle, type IntotoStatement } from "../records/intoto.js";
import { attempt } from "../schema.js";
import { admit, listedPem } from "../trust.js";
import { refused } from "./common.js";

/** DSSE v1.0: "DSSEv1" SP LEN(type) SP type SP LEN(payload) SP payload, lengths in bytes. */
export function pae(payloadType: string, payload: Uint8Array): Buffer {
  const type = Buffer.from(payloadType, "utf8");
  return Buffer.concat([Buffer.from(`DSSEv1 ${type.length} `, "ascii"), type, Buffer.from(` ${payload.length} `, "ascii"), Buffer.from(payload)]);
}

const isSigstoreBundle = (value: Record<string, unknown>) => "dsseEnvelope" in value || "mediaType" in value;

/** The standard base64 bytes of `text` when it is their one canonical spelling; null otherwise. */
function canonicalBase64(text: string): Buffer | null {
  const bytes = Buffer.from(text, "base64");
  return /^[A-Za-z0-9+/]*={0,2}$/.test(text) && bytes.toString("base64") === text ? bytes : null;
}

function completeness(statement: IntotoStatement, env: Env) {
  const findings: Finding<"completeness">[] = statement.subject.filter(subject => !env.evidence.has(subject.digest.sha256))
    .map(subject => ({ code: "EVIDENCE_MISSING", detail: `subject ${subject.name} (sha256 ${subject.digest.sha256}) was not supplied; no supplied bytes hash to it` }));
  if (statement.predicate.evidence.length === 0) findings.push({ code: "EMPTY_EVIDENCE", detail: "the statement cites no evidence" });
  for (const item of statement.predicate.evidence) {
    if (!env.evidence.has(item.sha256)) findings.push({ code: "EVIDENCE_MISSING", detail: `evidence ${item.kind} ${item.sha256} was not supplied` });
  }
  return result(findings);
}

export function evaluateDsseIntoto(value: Record<string, unknown>, env: Env): Evaluation {
  const wrapped = isSigstoreBundle(value);
  const parsed = wrapped ? attempt(sigstoreDsseBundle, value) : attempt(dsseEnvelope, value);
  if (!parsed.ok) return refused("dsse-intoto", { code: parsed.error.code, detail: parsed.error.message });
  const envelope = wrapped ? (parsed.value as ReturnType<typeof sigstoreDsseBundle>).dsseEnvelope : parsed.value as ReturnType<typeof dsseEnvelope>;
  const signature = envelope.signatures[0]!;
  if (wrapped && !same((parsed.value as ReturnType<typeof sigstoreDsseBundle>).verificationMaterial.publicKey.hint, signature.keyid)) {
    return refused("dsse-intoto", { code: "MALFORMED", detail: "the bundle's public-key hint is not the signature's keyid" });
  }
  if (envelope.payloadType !== INTOTO_PAYLOAD_TYPE) {
    return refused("dsse-intoto", { code: "UNSUPPORTED_VERSION", detail: `payloadType ${envelope.payloadType} is not ${INTOTO_PAYLOAD_TYPE}` });
  }
  const payload = canonicalBase64(envelope.payload);
  if (payload === null) return refused("dsse-intoto", { code: "MALFORMED", detail: "the payload is not canonical base64" });
  let raw: unknown;
  try { raw = parseJson(payload); } catch (error) {
    return refused("dsse-intoto", { code: "MALFORMED", detail: `the payload is ${error instanceof Error ? error.message : String(error)}` });
  }
  const checked = attempt(intotoStatement, raw);
  if (!checked.ok) return refused("dsse-intoto", { code: checked.error.code, detail: `statement ${checked.error.message}` });
  const statement = checked.value;
  const { predicate } = statement;
  const integrity: Finding<"integrity">[] = [];
  const at = Date.parse;
  if (!(at(predicate.scope.window.start) <= at(predicate.scope.window.end) && at(predicate.scope.window.end) <= at(predicate.issuedAt)
    && at(predicate.issuedAt) < at(predicate.expiresAt))) {
    integrity.push({ code: "MALFORMED", detail: "times must satisfy window.start <= window.end <= issuedAt < expiresAt" });
  }
  // The keyid only selects among keys the verifier's own trust lists hold; it never supplies a key.
  const pem = listedPem(env.ctx, signature.keyid);
  if (!isCanonicalSignatureBase64(signature.sig)) integrity.push({ code: "MALFORMED", detail: "the signature is not canonical base64 of 64 bytes" });
  else if (pem !== null && !verifySignature(pae(envelope.payloadType, payload), pem, Buffer.from(signature.sig, "base64"))) {
    integrity.push({ code: "SIGNATURE_INVALID", detail: "the signature does not verify over the DSSE PAE" });
  }
  const purpose = predicate.claimKind === "independently_reviewed" ? "independent-attestation" : "artifact-seal";
  const admission = admit({ signature: "dsseEnvelope.signatures[0]", keyId: signature.keyid, purpose }, env.ctx);
  const { scope } = predicate;
  return {
    kind: "dsse-intoto", integrity, admissions: [admission], admissionFindings: [],
    unverifiable: pem === null ? [`dsseEnvelope.signatures[0]: no supplied trust list holds key ${signature.keyid}`] : [],
    anchoring: { status: "not-applicable", detail: null }, claimedAt: predicate.issuedAt,
    warnings: scope.exclusions.map(exclusion => `control ${exclusion.controlId} is excluded by the statement: ${exclusion.rationale}`),
    scope: () => scopeResult({ tenant: scope.tenant ?? undefined, deployment: scope.deployment ?? undefined, subject: scope.agent, profile: scope.profile }, env.expect),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      if (env.ctx.asOf < at(predicate.issuedAt)) findings.push({ code: "NOT_YET_VALID", detail: `issued at ${predicate.issuedAt}, after the as-of time` });
      if (env.ctx.asOf >= at(predicate.expiresAt)) findings.push({ code: "ATTESTATION_EXPIRED", detail: `expired at ${predicate.expiresAt}` });
      if (admission.entry && at(predicate.issuedAt) < at(admission.entry.validFrom)) {
        findings.push({ code: "CLAIMED_TIME_BEFORE_KEY_VALIDITY", detail: `issuedAt ${predicate.issuedAt} is before the key's validFrom ${admission.entry.validFrom}` });
      }
      return result(findings);
    },
    completeness: () => completeness(statement, env),
    satisfaction: () => {
      const failed = predicate.controls.filter(control => control.dimensions.result === "fail");
      return failed.length > 0
        ? result<"satisfaction">(failed.map(control => ({ code: "CLAIMED_RESULT_FAILED", detail: `control ${control.controlId} declares fail` })))
        : notRecomputable("a control-results statement declares results this verifier cannot recompute from the supplied bytes");
    }
  };
}
