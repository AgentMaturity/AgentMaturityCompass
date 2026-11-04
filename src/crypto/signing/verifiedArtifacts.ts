/**
 * Verified-artifact registry (AXE-35): one way for an evaluation consumer to read a signed artifact of kind K.
 * Each kind maps to the verifier that already checks the artifact's digest against its signature and the trust
 * context's keys (no new signing format). An artifact is read only when that verifier passes; a tampered or
 * unverifiable artifact, and any kind not registered here, is refused with a label instead of being parsed ad hoc.
 * Transform attestations, outcome contracts and experiment candidates are the workspace's own artefacts: they verify
 * under `workspace`'s keys (refused without one), never the trust context. tests/verifiedArtifactConsumers.test.ts
 * keeps every exported artifact verifier either registered here or named with the reason it is not.
 */
import { readFileSync } from "node:fs";
import { verifyAssuranceCertificateFile } from "../../assurance/assuranceVerifier.js";
import { verifyAuditBinderFile } from "../../audit/binderVerifier.js";
import { verifyBenchArtifactFile } from "../../bench/benchVerifier.js";
import { verifyIndustryPackAuditFile } from "../../domains/industryPackAudit.js";
import { verifySignedCandidateFile } from "../../experiments/experimentRunner.js";
import { verifyNotaryAttestationBundle } from "../../notary/notaryAttestation.js";
import { verifyOutcomeContractFile } from "../../outcomes/outcomeContractEngine.js";
import { verifyPassportArtifactFile } from "../../passport/passportVerifier.js";
import { verifyTransformAttestation } from "../../transformation/transformAttestations.js";
import type { TrustContext, VerifierReportV1 } from "../../trust/index.js";

export interface VerifiedArtifactParams {
  file: string;
  trust: TrustContext;
  publicKeyPath?: string;
  workspace?: string;
}

type VerifierError = string | { code: string; message: string };
interface Verification { ok: boolean; fileSha256: string; errors: readonly VerifierError[]; report?: VerifierReportV1 }

const entry = <V extends Verification, A>(verify: (params: VerifiedArtifactParams) => V, artifact: (verification: V) => A | null) =>
  ({ verify, artifact });

/** A workspace-self verifier's result in the registry's shape; no workspace, no verification. */
function inWorkspace<V extends { valid: boolean; reason: string | null }>(params: VerifiedArtifactParams, verify: (workspace: string) => V,
  fileSha256: (verified: V) => string): V & { ok: boolean; fileSha256: string; errors: string[] } | { ok: false; fileSha256: ""; errors: string[] } {
  if (params.workspace === undefined) return { ok: false, fileSha256: "", errors: ["this artifact verifies under its workspace's keys; no workspace was given"] };
  const verified = verify(params.workspace);
  return { ...verified, ok: verified.valid, fileSha256: fileSha256(verified), errors: verified.reason === null ? [] : [verified.reason] };
}

const REGISTRY = {
  "assurance-certificate": entry(verifyAssuranceCertificateFile, (v) => v.cert),
  passport: entry(verifyPassportArtifactFile, (v) => v.passport),
  bench: entry(verifyBenchArtifactFile, (v) => v.bench),
  "audit-binder": entry(verifyAuditBinderFile, (v) => v.binder),
  "notary-attestation": entry((p) => {
    try {
      const verified = verifyNotaryAttestationBundle(p.file, p.trust, p.publicKeyPath === undefined ? null : readFileSync(p.publicKeyPath, "utf8"));
      return { ...verified, fileSha256: verified.report.artifact.sha256 };
    } catch (error) { // not a readable bundle: refused, never thrown at the consumer
      return { ok: false, fileSha256: "", errors: [error instanceof Error ? error.message : String(error)], attestation: null };
    }
  }, (v) => v.attestation),
  "transform-attestation": entry((p) => inWorkspace(p, (ws) => verifyTransformAttestation(ws, p.file), (v) => v.fileSha256),
    (v) => "attestation" in v ? v.attestation : null),
  "industry-pack-audit": entry((p) => verifyIndustryPackAuditFile(p) ?? { ok: false, fileSha256: "", errors: ["not an industry-pack audit file"], audit: null },
    (v) => v.audit),
  "outcome-contract": entry((p) => inWorkspace(p, (ws) => verifyOutcomeContractFile(ws, p.file), (v) => v.fileSha256),
    (v) => "contract" in v ? v.contract : null),
  "experiment-candidate": entry((p) => inWorkspace(p, (ws) => verifySignedCandidateFile(ws, p.file), (v) => v.digestSha256),
    (v) => "digestSha256" in v && v.ok ? { digestSha256: v.digestSha256 } : null)
};

export type VerifiedArtifactKind = keyof typeof REGISTRY;
type Entry<K extends VerifiedArtifactKind> = (typeof REGISTRY)[K];
type VerificationOf<K extends VerifiedArtifactKind> = ReturnType<Entry<K>["verify"]>;

export type ReadVerifiedResult<K extends VerifiedArtifactKind> =
  | { status: "verified"; label: "VERIFIED"; kind: K; artifact: NonNullable<ReturnType<Entry<K>["artifact"]>>; fileSha256: string; verification: VerificationOf<K> }
  | { status: "refused"; label: "UNVERIFIED"; kind: K; fileSha256: string; reasons: string[]; verification: VerificationOf<K> };

export interface UnknownArtifactKind { status: "refused"; label: "UNKNOWN_KIND"; kind: string; reasons: string[] }

function isVerifiedArtifactKind(kind: string): kind is VerifiedArtifactKind {
  return Object.hasOwn(REGISTRY, kind);
}

/** Reads a signed artifact of a registered kind only when its registry verifier passes. */
export function readVerified<K extends VerifiedArtifactKind>(kind: K, params: VerifiedArtifactParams): ReadVerifiedResult<K>;
export function readVerified(kind: string, params: VerifiedArtifactParams): ReadVerifiedResult<VerifiedArtifactKind> | UnknownArtifactKind;
export function readVerified(kind: string, params: VerifiedArtifactParams): ReadVerifiedResult<VerifiedArtifactKind> | UnknownArtifactKind {
  if (!isVerifiedArtifactKind(kind)) {
    return { status: "refused", label: "UNKNOWN_KIND", kind, reasons: [`no verifier is registered for artifact kind ${JSON.stringify(kind)}`] };
  }
  const registered = REGISTRY[kind] as unknown as { verify: (p: VerifiedArtifactParams) => Verification; artifact: (v: Verification) => unknown };
  const verification = registered.verify(params);
  const artifact = verification.ok ? registered.artifact(verification) : null;
  if (artifact !== null && artifact !== undefined) {
    return { status: "verified", label: "VERIFIED", kind, artifact, fileSha256: verification.fileSha256, verification } as ReadVerifiedResult<VerifiedArtifactKind>;
  }
  const reasons = verification.errors.map((row) => typeof row === "string" ? row : `${row.code}: ${row.message}`);
  return { status: "refused", label: "UNVERIFIED", kind, fileSha256: verification.fileSha256,
    reasons: reasons.length > 0 ? reasons : ["the signature is not admitted by the trust context"], verification } as ReadVerifiedResult<VerifiedArtifactKind>;
}
