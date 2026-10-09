/** Reviewer exceptions are signed comparison choices, not independent legal reviews. */
import { z } from "zod";
import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../../crypto/signing/signatureEnvelope.js";
import { signDigestWithPolicy } from "../../crypto/signing/signer.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { admitKey } from "../../trust/admission.js";
import type { TrustContext } from "../../trust/trustContext.js";
import { digestOf } from "../digest.js";
import type { ControlRecord } from "../types.js";
import type { DeploymentProfile } from "./types.js";

const text = z.string().min(1);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const stationMergeExceptionSchema = z.strictObject({
  id: text, mergeKey: text, chosenControlId: text, profileDigest: digest,
  controlDigests: z.record(text, digest),
  reviewer: z.strictObject({ name: text, credential: text }),
  rationale: text, expiresAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  signature: z.strictObject({
    digestSha256: z.string().regex(/^[0-9a-f]{64}$/), signature: text,
    signedTs: z.number().int().nonnegative(), signer: z.literal("auditor"),
    envelope: signatureEnvelopeSchema.optional()
  }).optional()
});
export type StationMergeException = z.infer<typeof stationMergeExceptionSchema>;
export interface ExceptionRejection { id: string; mergeKey: string; reason: string }

/** Bind the entire normalized deployment scope and every candidate's current bytes. */
export function stationExceptionBinding(profile: DeploymentProfile, controls: readonly ControlRecord[]) {
  const { mergeExceptions: _exceptions, ...scope } = profile;
  return {
    profileDigest: digestOf(scope),
    controlDigests: Object.fromEntries([...controls].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      .map((c) => [c.id, digestOf(c)]))
  };
}

export function stationExceptionDigest(exception: StationMergeException): string {
  const { signature: _signature, ...body } = stationMergeExceptionSchema.parse(exception);
  return digestOf(body);
}

/** Uses the existing plan-signing route; the operator must separately admit its key for config-signature. */
export function signStationMergeException(workspace: string, exception: Omit<StationMergeException, "signature">): StationMergeException {
  assertOwnerMode(workspace, "catalog reviewer exception");
  const body = stationMergeExceptionSchema.parse(exception);
  const digestHex = stationExceptionDigest(body).slice("sha256:".length);
  return { ...body, signature: signDigestWithPolicy({ workspace, kind: "CONTROL_PLAN", digestHex }) };
}

/** No key is trusted because the exception names it; no workspace-self or unpinned admission authorizes a waiver. */
export function stationExceptionRejection(exception: StationMergeException, profile: DeploymentProfile,
  controls: readonly ControlRecord[], asOfMs: number, trust?: TrustContext): string | null {
  if (!(Date.parse(exception.expiresAt) > asOfMs)) return "EXCEPTION_EXPIRED";
  if (!controls.some((c) => c.id === exception.chosenControlId)) return "CHOSEN_CONTROL_ABSENT";
  const binding = stationExceptionBinding(profile, controls);
  if (exception.profileDigest !== binding.profileDigest) return "PROFILE_DRIFTED";
  if (digestOf(exception.controlDigests) !== digestOf(binding.controlDigests)) return "CANDIDATES_DRIFTED";
  const signed = exception.signature;
  if (!signed?.envelope) return "EXCEPTION_UNSIGNED";
  const digestHex = stationExceptionDigest(exception).slice("sha256:".length);
  if (signed.digestSha256 !== digestHex) return "EXCEPTION_DIGEST_MISMATCH";
  if (signed.envelope.sigB64 !== signed.signature || signed.envelope.signedTs !== signed.signedTs
    || signed.signedTs > asOfMs || !verifySignatureEnvelope(digestHex, signed.envelope)) return "EXCEPTION_SIGNATURE_INVALID";
  if (!trust || trust.mode !== "pinned" || trust.asOf.getTime() !== asOfMs) return "EXCEPTION_TRUST_UNAVAILABLE";
  const admission = admitKey({
    publicKeyPem: Buffer.from(signed.envelope.pubkeyB64, "base64").toString("utf8"),
    purpose: "config-signature", signature: exception.id, context: trust
  });
  return admission.status === "admitted" ? null : `EXCEPTION_SIGNER_${admission.status.toUpperCase().replaceAll("-", "_")}`;
}
