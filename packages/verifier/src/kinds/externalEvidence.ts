/**
 * External evidence profile v1, signed by an authority whose key a supplied trust list admits for `evidence-authority`
 * with that entry's `authority` scope (producers, capture methods, highest tier). Never an authority from the profile.
 */
import { same, verifyEd25519 } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { externalEvidence, normalizedDigest, signingBytes, type ExternalEvidence } from "../records/externalEvidence.js";
import type { TrustListEntry } from "../records/trustList.js";
import { attempt } from "../schema.js";
import { admit, listedPem } from "../trust.js";
import { refused } from "./common.js";

const RANK = { SELF_REPORTED: 0, ATTESTED: 1, OBSERVED: 2 } as const;

/** The highest tier the admitted authority supports for this capture method. */
function admittedTier(profile: ExternalEvidence, entry: TrustListEntry): keyof typeof RANK {
  if (profile.provenance.captureMethod === "import") return "SELF_REPORTED";
  return profile.provenance.captureMethod === "governed-capture" && entry.authority?.maxTrustTier === "OBSERVED" ? "OBSERVED" : "ATTESTED";
}

function authorityScope(profile: ExternalEvidence, entry: TrustListEntry, env: Env): Finding<"issuerAdmission">[] {
  const authority = entry.authority;
  // As in AMC: an authority two lists name matches neither, so no list wins by shadowing another's scope.
  const named = env.ctx.lists.flatMap(list => list.entries).filter(item => item.keyId === entry.keyId && item.purposes.includes("evidence-authority"));
  const problems = [
    named.length > 1 ? "more than one supplied trust list names this authority" : null,
    profile.provenance.authorityId !== profile.signature?.authorityId ? "provenance.authorityId is not the signing authority" : null,
    !authority?.producers.includes(profile.source.producer) ? `the authority is not admitted for producer ${profile.source.producer}` : null,
    profile.provenance.captureMethod !== "import" && !authority?.captureMethods.includes(profile.provenance.captureMethod)
      ? `the authority is not admitted for capture method ${profile.provenance.captureMethod}` : null
  ];
  return problems.filter((problem): problem is string => problem !== null).map(detail => ({ code: "ISSUER_WRONG_PURPOSE", detail }));
}

function completeness(profile: ExternalEvidence, env: Env) {
  const findings: Finding<"completeness">[] = [];
  if (profile.events.length === 0) findings.push({ code: "EMPTY_EVIDENCE", detail: "the profile holds no events" });
  if (!env.evidence.has(profile.source.originalSha256)) {
    findings.push({ code: "EVIDENCE_MISSING", detail: `the original source bytes ${profile.source.originalSha256} were not supplied` });
  }
  const settled = new Set(profile.events.filter(event => event.kind === "tool-result").map(event => event.toolCallId));
  for (const event of profile.events) {
    if (event.kind === "tool-call" && !settled.has(event.toolCallId)) findings.push({ code: "OUTCOME_UNKNOWN", detail: `tool call ${event.toolCallId} has no result` });
    if (event.outcome === "unknown") findings.push({ code: "OUTCOME_UNKNOWN", detail: `event ${event.id} has outcome unknown` });
  }
  return result(findings);
}

export function evaluateExternalEvidence(value: unknown, env: Env): Evaluation {
  const parsed = attempt(externalEvidence, value);
  if (!parsed.ok) return refused("external-evidence", { code: parsed.error.code, detail: parsed.error.message });
  const profile = parsed.value;
  const integrity: Finding<"integrity">[] = [];
  if (!same(normalizedDigest(profile), profile.normalization.normalizedSha256)) {
    integrity.push({ code: "DIGEST_MISMATCH", detail: "normalization.normalizedSha256 is not the profile's semantic digest" });
  }
  const unverifiable: string[] = [];
  const keyId = profile.signature !== null && /^[0-9a-f]{64}$/.test(profile.signature.authorityId) ? profile.signature.authorityId : null;
  const pem = keyId === null ? null : listedPem(env.ctx, keyId);
  if (profile.signature !== null && pem === null) unverifiable.push("signature: the authority key is not in the supplied trust lists");
  if (profile.signature !== null && pem !== null && !verifyEd25519(signingBytes(profile), pem, Buffer.from(profile.signature.value, "base64"))) {
    integrity.push({ code: "SIGNATURE_INVALID", detail: "the authority signature does not verify" });
  }
  const claimed = Date.parse(profile.normalization.ingestedAt);
  const admission = admit({ signature: profile.signature === null ? "signature (none: unsigned profile)" : "signature", keyId,
    purpose: "evidence-authority", claimedAt: claimed }, env.ctx);
  const entry = admission.entry;
  return {
    kind: "external-evidence", integrity, unverifiable, admissions: [admission],
    admissionFindings: entry ? authorityScope(profile, entry, env) : [],
    anchoring: { status: "not-applicable", detail: null }, claimedAt: profile.normalization.ingestedAt,
    warnings: admission.warning ? [admission.warning] : [],
    scope: () => scopeResult({ subject: profile.session.id }, env.expect),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      if (env.ctx.asOf < claimed) findings.push({ code: "NOT_YET_VALID", detail: `ingested at ${profile.normalization.ingestedAt}, after the as-of time` });
      if (entry && claimed < Date.parse(entry.validFrom)) {
        findings.push({ code: "CLAIMED_TIME_BEFORE_KEY_VALIDITY", detail: `ingestedAt is before the key's validFrom ${entry.validFrom}` });
      }
      return result(findings);
    },
    completeness: () => completeness(profile, env),
    satisfaction: () => {
      const declared = profile.provenance.trustTier;
      if (declared === "SELF_REPORTED" || !entry) return notRecomputable("a self-reported profile makes no positive claim to recompute");
      const recomputed = admittedTier(profile, entry);
      return RANK[declared] > RANK[recomputed]
        ? result<"satisfaction">([{ code: "CLAIMED_RESULT_FAILED", detail: `declares ${declared}; the admitted authority and capture method support ${recomputed}` }])
        : result<"satisfaction">([]);
    }
  };
}
