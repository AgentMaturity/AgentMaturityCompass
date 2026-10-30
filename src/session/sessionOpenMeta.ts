import type { SessionOpenParams } from "./sessionApiTypes.js";

/** First-row identity and provenance, in stable hash pre-image order. */
export function buildSessionOpenMeta(params: SessionOpenParams): Record<string, unknown> {
  return {
    runtime: params.runtime ?? "amc",
    agentId: params.agentId,
    harnessVersion: params.harnessVersion,
    compositionDigest: params.compositionDigest,
    policyDigest: params.policyDigest,
    ...(params.parent === undefined ? {} : { parentSession: { ...params.parent } }),
    ...(params.acceptedWork === undefined ? {} : { acceptedWork: { ...params.acceptedWork } })
  };
}
