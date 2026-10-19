import type { LocalOutcome } from "./protocol.js";

interface ChangeOutcome extends LocalOutcome { mergeReleases: string[]; changeDigest: string | null }
/** Stage1 stub; no merge release is recorded. */
export function runChangeGate(_input: unknown): ChangeOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", mergeReleases: [], changeDigest: null };
}
