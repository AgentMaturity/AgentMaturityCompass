/**
 * Scoped attestation: a signed statement, by a key admitted for `independent-attestation`, that the control results
 * named by `controlResultsDigest` hold for one tenant, workspace, subject, deployment, profile and window.
 */
import { createHash } from "node:crypto";
import { canonicalEd25519Pem, canonicalize, isCanonicalSignatureBase64, same, sha256Hex, tagged, verifyEd25519 } from "../bytes.js";
import type { Finding } from "../codes.js";
import { notRecomputable, result, scopeResult, type Env, type Evaluation } from "../evaluation.js";
import { ATTESTATION_DIGEST_TAG, scopedAttestation, type ScopedAttestation } from "../records/attestation.js";
import { actionReceipt, controlResult, TERMINAL_STATES, type ActionReceipt, type ControlResult } from "../records/evidence.js";
import { arr, attempt, isRecord } from "../schema.js";
import { admit } from "../trust.js";
import { refused } from "./common.js";

/** sha256(tag, 0x00, canonical attestation without `signature`): the 32 bytes the envelope's Ed25519 signature covers. */
export function attestationDigest(attestation: Omit<ScopedAttestation, "signature"> & { signature?: unknown }): Buffer {
  const { signature: _signature, ...body } = attestation;
  return createHash("sha256").update(tagged(ATTESTATION_DIGEST_TAG, canonicalize(body))).digest();
}

interface EvidenceView {
  controls: ControlResult[] | null;
  receipts: Map<string, ActionReceipt>;
  opaque: Set<string>;
  missing: string[];
}

/** Resolves the evidence tree; malformed bound evidence is an integrity failure. */
function readEvidence(attestation: ScopedAttestation, env: Env, integrity: Finding<"integrity">[]): EvidenceView {
  const view: EvidenceView = { controls: null, receipts: new Map(), opaque: new Set(), missing: [] };
  if (!env.evidence.has(attestation.controlResultsDigest)) return view;
  const controls = attempt(arr(controlResult), env.evidence.json(attestation.controlResultsDigest));
  if (!controls.ok) {
    integrity.push({ code: "MALFORMED", detail: `evidence ${attestation.controlResultsDigest} is not a JSON array of control results (${controls.error.message})` });
    return view;
  }
  view.controls = controls.value;
  for (const ref of new Set(controls.value.flatMap(control => control.evidenceRefs))) {
    if (!env.evidence.has(ref)) { view.missing.push(ref); continue; }
    const item = env.evidence.json(ref);
    if (!isRecord(item) || item.schema !== "amc.action-receipt/v1") { view.opaque.add(ref); continue; }
    const receipt = attempt(actionReceipt, item);
    if (receipt.ok) view.receipts.set(ref, receipt.value);
    else integrity.push({ code: "MALFORMED", detail: `evidence ${ref} is not a valid amc.action-receipt/v1 (${receipt.error.message})` });
  }
  return view;
}

function considered(attestation: ScopedAttestation, controls: ControlResult[]): ControlResult[] {
  const excluded = new Set(attestation.exclusions.map(exclusion => exclusion.controlId));
  return controls.filter(control => !excluded.has(control.controlId));
}

function completeness(attestation: ScopedAttestation, view: EvidenceView) {
  if (view.controls === null) return result<"completeness">([{ code: "EVIDENCE_MISSING", detail: `the control results ${attestation.controlResultsDigest} were not supplied` }]);
  const findings: Finding<"completeness">[] = [];
  const controls = considered(attestation, view.controls);
  if (controls.length === 0) findings.push({ code: "EMPTY_EVIDENCE", detail: "the attestation covers no control result" });
  for (const control of controls) {
    if (control.evidenceRefs.length === 0) findings.push({ code: "EMPTY_EVIDENCE", detail: `control ${control.controlId} cites no evidence` });
  }
  for (const ref of view.missing) findings.push({ code: "EVIDENCE_MISSING", detail: `evidence ${ref} was not supplied` });
  const executions = new Map<string, Array<[string, ActionReceipt]>>();
  for (const entry of view.receipts) executions.set(entry[1].executionId, [...(executions.get(entry[1].executionId) ?? []), entry]);
  for (const [executionId, receipts] of executions) {
    const ordered = [...receipts].sort((a, b) => a[1].seq - b[1].seq);
    const terminal = new Set(ordered.map(([, receipt]) => receipt.state).filter(state => TERMINAL_STATES.has(state)));
    const seqs = new Set(ordered.map(([, receipt]) => receipt.seq));
    if (terminal.size > 1 || seqs.size !== ordered.length) {
      findings.push({ code: "CONTRADICTORY_EVIDENCE", detail: `execution ${executionId} has conflicting receipts (${[...terminal].join(" and ") || "same seq twice"})` });
      continue;
    }
    const last = ordered[ordered.length - 1]![1];
    if (!TERMINAL_STATES.has(last.state)) findings.push({ code: "OUTCOME_UNKNOWN", detail: `execution ${executionId} ends ${last.state}` });
    else if (!last.evidenceComplete) findings.push({ code: "EVIDENCE_MISSING", detail: `execution ${executionId}'s evidence is marked incomplete` });
  }
  return result(findings);
}

/**
 * The attestation's result is the conjunction of its control results. A declared fail, or a pass whose claim kind is
 * synthetic_example, fails it. A declared not_evaluated, a self_reported pass (no positive status) or evidence this
 * verifier cannot read cannot be recomputed. Otherwise every result is a pass by an observed or independently reviewed
 * claim over evidence that completeness found present, settled and consistent.
 */
function satisfaction(attestation: ScopedAttestation, view: EvidenceView) {
  const controls = considered(attestation, view.controls ?? []);
  const failed = controls.filter(control => control.dimensions.result === "fail" || (control.dimensions.result === "pass" && control.claimKind === "synthetic_example"));
  if (failed.length > 0) {
    return result<"satisfaction">(failed.map(control => ({ code: "CLAIMED_RESULT_FAILED",
      detail: `control ${control.controlId} declares ${control.dimensions.result} (${control.claimKind})` })));
  }
  const open = controls.filter(control => control.dimensions.result !== "pass" || control.claimKind === "self_reported"
    || control.evidenceRefs.some(ref => view.opaque.has(ref)));
  if (open.length > 0) {
    return notRecomputable(open.map(control => `control ${control.controlId} (${control.dimensions.result}, ${control.claimKind})`).join("; ")
      + ": a declared not_evaluated, a self_reported pass or evidence of an unknown kind cannot be recomputed");
  }
  return result<"satisfaction">([]);
}

export function evaluateAttestation(value: unknown, env: Env): Evaluation {
  const parsed = attempt(scopedAttestation, value);
  if (!parsed.ok) return refused("scoped-attestation", { code: parsed.error.code, detail: parsed.error.message });
  const attestation = parsed.value;
  const { signature } = attestation;
  const integrity: Finding<"integrity">[] = [];
  const at = (text: string) => Date.parse(text);
  if (!(at(attestation.window.start) < at(attestation.window.end) && at(attestation.window.end) <= at(attestation.issuedAt)
    && at(attestation.issuedAt) < at(attestation.expiresAt))) {
    integrity.push({ code: "MALFORMED", detail: "times must satisfy window.start < window.end <= issuedAt < expiresAt" });
  }
  if (signature.signedTs !== at(attestation.issuedAt)) integrity.push({ code: "MALFORMED", detail: "signature.signedTs must equal issuedAt" });
  const pem = Buffer.from(signature.pubkeyB64, "base64").toString("utf8");
  if (Buffer.from(pem, "utf8").toString("base64") !== signature.pubkeyB64 || canonicalEd25519Pem(pem) !== pem) {
    integrity.push({ code: "MALFORMED", detail: "signature.pubkeyB64 is not base64 of a canonical Ed25519 SPKI PEM" });
  } else if (!same(sha256Hex(pem), signature.fingerprint) || !same(attestation.issuerKeyId, signature.fingerprint)
    || (signature.signer.notaryFingerprint !== undefined && !same(signature.signer.notaryFingerprint, signature.fingerprint))) {
    integrity.push({ code: "DIGEST_MISMATCH", detail: "issuerKeyId, signature.fingerprint and the carried key do not agree" });
  } else if (!isCanonicalSignatureBase64(signature.sigB64) || !verifyEd25519(attestationDigest(attestation), pem, Buffer.from(signature.sigB64, "base64"))) {
    integrity.push({ code: "SIGNATURE_INVALID", detail: "the signature does not verify over the attestation digest" });
  }
  const view = readEvidence(attestation, env, integrity);
  // The carried key only locates the signer: admission looks its id up in the verifier's own trust lists.
  const admission = admit({ signature: "signature", keyId: attestation.issuerKeyId, purpose: "independent-attestation", claimedAt: at(attestation.issuedAt) }, env.ctx);
  const foreign = [...view.receipts].filter(([, receipt]) => receipt.workspaceId !== attestation.workspaceId || receipt.agentId !== attestation.subjectId)
    .map(([ref, receipt]): Finding<"scope"> => ({ code: "FOREIGN_EVIDENCE", detail: `evidence ${ref} names workspace ${receipt.workspaceId} and agent ${receipt.agentId}` }));
  return {
    kind: "scoped-attestation", integrity, unverifiable: [], admissions: [admission], admissionFindings: [],
    anchoring: { status: "not-applicable", detail: null }, claimedAt: attestation.issuedAt,
    warnings: admission.warning ? [admission.warning] : [],
    scope: () => scopeResult({ tenant: attestation.tenantId, deployment: attestation.deployment.deploymentId,
      subject: attestation.subjectId, profile: attestation.profile.id }, env.expect, foreign),
    freshness: () => {
      const findings: Finding<"freshness">[] = [];
      const issued = at(attestation.issuedAt);
      if (env.ctx.asOf < issued) findings.push({ code: "NOT_YET_VALID", detail: `issued at ${attestation.issuedAt}, after the as-of time` });
      if (env.ctx.asOf >= at(attestation.expiresAt)) findings.push({ code: "ATTESTATION_EXPIRED", detail: `expired at ${attestation.expiresAt}` });
      const known = env.ctx.knownSequences[attestation.subjectId];
      if (known !== undefined && attestation.sequence < known) {
        findings.push({ code: "REPLAYED_OR_SUPERSEDED", detail: `sequence ${attestation.sequence} for ${attestation.subjectId}; ${known} is already known` });
      }
      if (admission.entry && issued < at(admission.entry.validFrom)) {
        findings.push({ code: "CLAIMED_TIME_BEFORE_KEY_VALIDITY", detail: `issuedAt ${attestation.issuedAt} is before the key's validFrom ${admission.entry.validFrom}` });
      }
      return result(findings);
    },
    completeness: () => completeness(attestation, view),
    satisfaction: () => satisfaction(attestation, view)
  };
}
