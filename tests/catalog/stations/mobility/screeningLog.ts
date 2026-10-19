import type { LocalOutcome } from "./protocol.js";

interface ScreeningOutcome extends LocalOutcome { noticeReleases: string[]; evaluatedPairs: string[] }
/** Stage1 stub; no adverse notice is released. */
export function runScreeningLog(_input: unknown): ScreeningOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", noticeReleases: [], evaluatedPairs: [] };
}
