import type { LocalOutcome } from "./protocol.js";

interface ReleaseOutcome extends LocalOutcome { releasedLots: string[] }
/** Stage1 stub. No P2-27 conversion, fixture reuse or physical release is implemented. */
export function runReleaseCheck(_input: unknown): ReleaseOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", releasedLots: [] };
}
