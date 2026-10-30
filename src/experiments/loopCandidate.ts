import { readFileSync } from "node:fs";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ExperimentFile } from "./experimentSchema.js";

/** Runtime binding of an improvement-loop candidate (GAP-WP08), read by the loop from its own signed stage journal. */
export interface LoopCandidateBinding { readonly loopId: string; readonly digestSha256: string }
export type CandidateConfig = NonNullable<ExperimentFile["experiment"]["candidateConfig"]>;

/**
 * A loop candidate is model output and is never auditor-signed. It is admitted only with the binding its loop passes at
 * run time; the persisted kind alone admits nothing, so a hand-edited experiment definition cannot skip the signature.
 */
export function admitLoopCandidate(candidate: CandidateConfig, loop: LoopCandidateBinding | undefined): { valid: boolean; digestSha256: string; reason: string | null } {
  const digest = candidate.path && pathExists(candidate.path) ? sha256Hex(readFileSync(candidate.path)) : "";
  const valid = loop !== undefined && loop.loopId === candidate.loopId && loop.digestSha256 === candidate.digestSha256 && digest === candidate.digestSha256;
  return { valid, digestSha256: digest, reason: valid ? null : "improvement-loop candidate without its loop's journalled binding" };
}
