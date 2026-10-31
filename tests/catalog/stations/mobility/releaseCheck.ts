import { releaseSchema, type LocalOutcome } from "./protocol.js";

interface ReleaseOutcome extends LocalOutcome { releasedLots: string[] }
/** Pending owner adapter only. Bounded shape validation does not execute a cold-chain conversion. */
export function runReleaseCheck(input: unknown): ReleaseOutcome {
  const parsed = releaseSchema.safeParse(input);
  return { result: "not_evaluated", reasonCode: parsed.success ? "dependency_unavailable" : "invalid_input",
    claimKind: "synthetic_example", releasedLots: [] };
}
