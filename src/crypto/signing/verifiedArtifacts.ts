/**
 * Verified-artifact registry (AXE-35): one way for an evaluation consumer to read a signed artifact of kind K.
 * Each kind maps to the verifier that already checks the artifact's digest against its signature and the trust
 * context's keys (no new signing format). An artifact is read only when that verifier passes; a tampered or
 * unverifiable artifact, and any kind not registered here, is refused with a label instead of being parsed ad hoc.
 */
import { verifyAssuranceCertificateFile } from "../../assurance/assuranceVerifier.js";
import { verifyAuditBinderFile } from "../../audit/binderVerifier.js";
import { verifyBenchArtifactFile } from "../../bench/benchVerifier.js";
import { verifyPassportArtifactFile } from "../../passport/passportVerifier.js";
import type { TrustContext, VerifierReportV1 } from "../../trust/index.js";

export interface VerifiedArtifactParams {
  file: string;
  trust: TrustContext;
  publicKeyPath?: string;
  workspace?: string;
}

type VerifierError = string | { code: string; message: string };
interface Verification { ok: boolean; fileSha256: string; errors: readonly VerifierError[]; report: VerifierReportV1 }

const entry = <V extends Verification, A>(verify: (params: VerifiedArtifactParams) => V, artifact: (verification: V) => A | null) =>
  ({ verify, artifact });

const REGISTRY = {
  "assurance-certificate": entry(verifyAssuranceCertificateFile, (v) => v.cert),
  passport: entry(verifyPassportArtifactFile, (v) => v.passport),
  bench: entry(verifyBenchArtifactFile, (v) => v.bench),
  "audit-binder": entry(verifyAuditBinderFile, (v) => v.binder)
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
