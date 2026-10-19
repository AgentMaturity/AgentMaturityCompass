import type { LocalOutcome } from "./protocol.js";

interface FallbackOutcome extends LocalOutcome { deploymentReleases: string[]; reachedAt: string | null; deadlineAt: string | null; observedSamples: number }
/** Stage1 stub; no deployment release or physical vehicle result is claimed. */
export function runVehicleSimulator(_input: unknown): FallbackOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", deploymentReleases: [], reachedAt: null, deadlineAt: null, observedSamples: 0 };
}
