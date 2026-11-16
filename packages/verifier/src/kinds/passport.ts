/**
 * An AMC passport (.amcpass): `passport.json` signed in `passport.sig` (the signer's key over the raw SHA-256 digest of
 * the passport's canonical JSON). The signing key is taken only from the supplied trust lists, admitted for artifact-seal;
 * a key the signature envelope or `signer.pub` names only selects among them. Revocation is checked against signed
 * passport revocation lists the verifier's user supplies, whose signer must be pinned for revocation-list AND be the
 * passport's own issuer: the key the passport names in `issuance.revocationListKeyId` (an older passport: the key that
 * signed it). Another pinned issuer's list never stands in. Without a list, freshness is not evaluated: nobody checked
 * whether the passport was revoked.
 */
import { canonicalize, canonicalSigningPem, parseJson, same, sha256Hex, signingKeyId, statementMessage, verifySignature } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { signedRevocationList, type SignedRevocationList } from "../records/statements.js";
import { anyRecord, attempt, int, lit, nonEmpty, obj, oneOf, opt, sha256, str } from "../schema.js";
import { admit, listedKeys, listedPem, type Admission } from "../trust.js";
import { parseCanonical, refused, rollback } from "./common.js";

/** A signed revocation list exactly as supplied: its parsed JSON and its bytes (one canonical encoding only). */
export interface SuppliedList { value: unknown; bytes: Uint8Array }

const passportSig = obj({
  digestSha256: sha256,
  signature: nonEmpty,
  signedTs: int(),
  signer: lit("auditor"),
  envelope: opt(obj({
    v: lit(1, "UNSUPPORTED_VERSION"),
    alg: oneOf(["ed25519", "ecdsa-p256-sha256"] as const),
    pubkeyB64: nonEmpty,
    fingerprint: sha256,
    sigB64: nonEmpty,
    signedTs: int(),
    signer: anyRecord
  }))
});

/** The fields this verifier reads from passport.json; everything else is covered by the signature but not interpreted. */
const passportFields = (value: unknown) => {
  const record = anyRecord(value, "passport.json");
  const id = str({ regex: /^pass_[A-Za-z0-9_-]{8,}$/, what: "a passport id" })(record.passportId, "passport.json.passportId");
  const generatedTs = int()(record.generatedTs, "passport.json.generatedTs");
  const expiresTs = record.expiresTs === undefined ? generatedTs + 90 * 24 * 60 * 60 * 1000 : int()(record.expiresTs, "passport.json.expiresTs");
  const issuance = record.issuance === undefined ? null : anyRecord(record.issuance, "passport.json.issuance");
  return { id, generatedTs, expiresTs, issuance };
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Which listed key made the passport signature: the one the envelope names, or else the listed key it verifies under. */
function signingKey(digest: Buffer, sig: ReturnType<typeof passportSig>, env: Env): { keyId: string | null; pem: string | null } {
  if (sig.envelope !== undefined) {
    const named = canonicalSigningPem(Buffer.from(sig.envelope.pubkeyB64, "base64").toString("utf8"));
    const keyId = named === null ? null : signingKeyId(named.pem);
    return { keyId, pem: keyId === null ? null : listedPem(env.ctx, keyId) };
  }
  const found = listedKeys(env.ctx).find(key => verifySignature(digest, key.publicKeyPem, Buffer.from(sig.signature, "base64")));
  return found === undefined ? { keyId: null, pem: null } : { keyId: found.keyId, pem: found.publicKeyPem };
}

interface ListCheck {
  integrity: Finding<"integrity">[];
  unverifiable: string[];
  admissions: Admission[];
  admissionFindings: Finding<"issuerAdmission">[];
  lists: SignedRevocationList[];
}

/** Each supplied list must be canonical, name the passport's list, verify under a key pinned for revocation-list and not roll back. */
function checkLists(supplied: readonly SuppliedList[], expected: { listId: string | null; signerKeyId: string | null }, env: Env): ListCheck {
  const expectedListId = expected.listId;
  const out: ListCheck = { integrity: [], unverifiable: [], admissions: [], admissionFindings: [], lists: [] };
  supplied.forEach((item, index) => {
    const at = `revocation list ${index + 1}`;
    const parsed = parseCanonical(signedRevocationList, item.value, item.bytes);
    if (!parsed.ok) { out.integrity.push({ code: parsed.finding.code, detail: `${at}: ${parsed.finding.detail}` }); return; }
    const { list, signature } = parsed.value;
    if (expectedListId === null ? !list.listId.startsWith("passports:") : list.listId !== expectedListId) {
      out.integrity.push({ code: "MALFORMED", detail: `${at} is ${list.listId}, not ${expectedListId ?? "a passport revocation list (passports:...)"}` });
      return;
    }
    if (expected.signerKeyId === null || !same(signature.keyId, expected.signerKeyId)) {
      out.integrity.push({ code: "MALFORMED", detail: `${at} is signed by key ${signature.keyId}, not by ${expected.signerKeyId ?? "a key this passport's issuer names"}, the key that signs this passport's revocation list` });
      return;
    }
    const pem = listedPem(env.ctx, signature.keyId);
    if (pem === null) out.unverifiable.push(`${at}: no supplied trust list holds its signing key ${signature.keyId}`);
    else if (!verifySignature(statementMessage("AMC_REVOCATION_LIST_V1", "AMC_REVOCATION_LIST_V2_DIGEST", canonicalize(list), parsed.value.signatureVersion), pem,
      Buffer.from(signature.signature, "base64"))) {
      out.integrity.push({ code: "SIGNATURE_INVALID", detail: `${at}: the signature does not verify` });
      return;
    }
    out.admissions.push(admit({ signature: `${at} signature`, keyId: signature.keyId, purpose: "revocation-list" }, env.ctx));
    out.admissionFindings.push(...rollback(list.listId, list.sequence, env).map(finding => ({ ...finding, detail: `${at}: ${finding.detail}` })));
    out.lists.push(parsed.value);
  });
  return out;
}

export function evaluatePassport(members: ReadonlyMap<string, Buffer>, supplied: readonly SuppliedList[], env: Env): Evaluation {
  const json = members.get("passport.json");
  const sigBytes = members.get("passport.sig");
  if (json === undefined || sigBytes === undefined) return refused("passport", { code: "MALFORMED", detail: "the archive has no amc-passport/passport.json and passport.sig" });
  let value: unknown;
  let sig: ReturnType<typeof passportSig>;
  let fields: ReturnType<typeof passportFields>;
  try {
    value = parseJson(json);
    fields = passportFields(value);
    const parsedSig = attempt(passportSig, parseJson(sigBytes));
    if (!parsedSig.ok) return refused("passport", { code: parsedSig.error.code, detail: `passport.sig ${parsedSig.error.message}` });
    sig = parsedSig.value;
  } catch (error) {
    return refused("passport", { code: "MALFORMED", detail: error instanceof Error ? error.message : String(error) });
  }
  const integrity: Finding<"integrity">[] = [];
  if (!Buffer.from(`${canonicalize(value)}\n`, "utf8").equals(json)) integrity.push({ code: "MALFORMED", detail: "passport.json is not in AMC's canonical encoding" });
  const digestHex = sha256Hex(canonicalize(value));
  if (!same(digestHex, sig.digestSha256)) integrity.push({ code: "DIGEST_MISMATCH", detail: "passport.json does not hash to the digest passport.sig signs" });
  if (sig.envelope !== undefined && sig.envelope.sigB64 !== sig.signature) integrity.push({ code: "MALFORMED", detail: "passport.sig carries two different signatures" });
  const digest = Buffer.from(digestHex, "hex");
  const key = signingKey(digest, sig, env);
  const unverifiable: string[] = [];
  if (key.pem === null) unverifiable.push("passport.sig: no supplied trust list holds a key that made this signature");
  else if (!verifySignature(digest, key.pem, Buffer.from(sig.signature, "base64"))) integrity.push({ code: "SIGNATURE_INVALID", detail: "passport.sig does not verify" });
  const passportAdmission = admit({ signature: "passport.sig", keyId: key.keyId, purpose: "artifact-seal" }, env.ctx);
  const listId = typeof fields.issuance?.revocationListId === "string" ? fields.issuance.revocationListId : null;
  const listSigner = typeof fields.issuance?.revocationListKeyId === "string" ? fields.issuance.revocationListKeyId : key.keyId;
  const lists = checkLists(supplied, { listId, signerKeyId: listSigner }, env);
  const revoked = lists.lists.flatMap(signed => signed.list.revoked).find(row => row.kind === "passport" && row.id === fields.id);
  const selfIssued = fields.issuance?.selfIssued === true;
  return {
    kind: "passport", integrity: [...integrity, ...lists.integrity], unverifiable: [...unverifiable, ...lists.unverifiable],
    admissions: [passportAdmission, ...lists.admissions], admissionFindings: lists.admissionFindings,
    anchoring: { status: "not-applicable", detail: null }, claimedAt: iso(fields.generatedTs),
    warnings: [
      selfIssued ? "self-issued: the workspace signed this passport about its own agent; nobody outside it checked the figures"
        : "the passport does not say who issued it (made before 2026-11-16); treat it as self-issued",
      "the passport's status (VERIFIED, INFORMATIONAL or UNTRUSTED) is the issuing workspace's own check, not an outside verification",
      "times are the issuing machine's own clock (time basis: claimed)",
      "the transparency proofs inside the passport are checked by AMC (amc passport verify), not by this verifier",
      ...(listId === null && supplied.length > 0 ? ["the passport names no revocation list; a passports:... list signed by the key that signed the passport was accepted"] : [])
    ],
    scope: () => scopeResult({}, env.expect),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      if (env.ctx.asOf < fields.generatedTs) findings.push({ code: "NOT_YET_VALID", detail: `made at ${iso(fields.generatedTs)}, after the as-of time` });
      if (env.ctx.asOf >= fields.expiresTs) findings.push({ code: "ATTESTATION_EXPIRED", detail: `the passport expired at ${iso(fields.expiresTs)}` });
      for (const signed of lists.lists) {
        if (env.ctx.asOf < Date.parse(signed.list.issuedAt)) findings.push({ code: "NOT_YET_VALID", detail: `revocation list sequence ${signed.list.sequence} was issued after the as-of time` });
      }
      if (revoked) findings.push({ code: "REPLAYED_OR_SUPERSEDED", detail: `the passport was revoked at ${revoked.revokedAt}: ${revoked.reason}` });
      return result(findings, supplied.length === 0
        ? "no passport revocation list was supplied (--revocation-list), so whether the passport was revoked was not checked" : null);
    },
    completeness: () => result<"completeness">([]),
    satisfaction: () => notRecomputable("a passport states figures its issuer computed; this verifier does not recompute them")
  };
}
