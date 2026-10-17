import { isCanonicalEncoding } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type ArtifactKind, type DimResult, type Env, type Evaluation } from "../evaluation.js";
import { attempt, type Check } from "../schema.js";

const notEvaluated = <D extends "scope" | "freshness" | "completeness" | "satisfaction">(): DimResult<D> =>
  ({ status: "not-evaluated", findings: [], note: "the record did not parse" });

/** A record that failed integrity before anything else could be read from it. */
export function refused(kind: ArtifactKind, finding: Finding<"integrity">): Evaluation {
  return {
    kind, integrity: [finding], unverifiable: [], admissions: [], admissionFindings: [],
    anchoring: { status: "not-applicable", detail: null }, claimedAt: null, warnings: [],
    scope: notEvaluated, freshness: notEvaluated, completeness: notEvaluated, satisfaction: notEvaluated
  };
}

/** Parses a P1-08 record, which exists in exactly one byte encoding: the canonical JSON of its content. */
export function parseCanonical<T>(check: Check<T>, value: unknown, bytes: Uint8Array): { ok: true; value: T } | { ok: false; finding: Finding<"integrity"> } {
  const parsed = attempt(check, value);
  if (!parsed.ok) return { ok: false, finding: { code: parsed.error.code, detail: parsed.error.message } };
  if (!isCanonicalEncoding(bytes, value)) return { ok: false, finding: { code: "MALFORMED", detail: "the bytes are not the canonical encoding of the record" } };
  return { ok: true, value: parsed.value };
}

/**
 * The shared tail of a P1-08 record (trust list, revocation list, rotation statements): no scope fields; freshness
 * refuses a record issued after the as-of time or before its signer's validity; completeness passes for the first record
 * of its chain and is not evaluated for a later one (its predecessor is not checked); nothing to recompute.
 */
export function statementTail(env: Env, issuedAt: string, predecessor: string | null, signerValidFrom: string | null = null): Pick<Evaluation, "scope" | "freshness" | "completeness" | "satisfaction"> {
  return {
    scope: () => scopeResult({}, env.expect),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      if (env.ctx.asOf < Date.parse(issuedAt)) findings.push({ code: "NOT_YET_VALID", detail: `issued at ${issuedAt}, after the as-of time` });
      if (signerValidFrom !== null && Date.parse(issuedAt) < Date.parse(signerValidFrom)) {
        findings.push({ code: "CLAIMED_TIME_BEFORE_KEY_VALIDITY", detail: `issuedAt ${issuedAt} is before the signer's validFrom ${signerValidFrom}` });
      }
      return result(findings);
    },
    completeness: () => result<"completeness">([], predecessor === null ? null : `the predecessor ${predecessor} is not checked; --known-sequence gives anti-rollback`),
    satisfaction: () => notRecomputable("this record states keys or revocations, not a result to recompute")
  };
}

/** P1-08 chains: only the first record (sequence 1) names no predecessor, and every later one names one. */
export function chainHead(sequence: number, predecessor: string | null): Finding<"integrity">[] {
  return (predecessor === null) === (sequence === 1) ? []
    : [{ code: "MALFORMED", detail: `sequence ${sequence} ${predecessor === null ? "names no predecessor" : "is first but names a predecessor"}` }];
}

/** P1-08 anti-rollback: a sequence below the highest one the verifier's user already saw for this id. */
export function rollback(id: string, sequence: number, env: Env): Finding<"issuerAdmission">[] {
  const known = Object.hasOwn(env.ctx.knownSequences, id) ? env.ctx.knownSequences[id] : undefined;
  return known !== undefined && sequence < known
    ? [{ code: "ROLLBACK_DETECTED", detail: `${id} has sequence ${sequence}; ${known} is already known` }] : [];
}
