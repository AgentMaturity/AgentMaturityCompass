import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { writeFileAtomic } from "../../utils/fs.js";
import type { Domain } from "../domainRegistry.js";
import { buildOperatingProfile } from "./operatingProfileBuilder.js";
import type { OperatingProfile, OperatingProfileConsistency } from "./operatingProfileTypes.js";

export const OPERATING_PROFILE_DIR = "amc-operating-profiles";

export interface EmitOperatingProfileInput {
  workspacePath: string;
  station: Domain;
  agentId: string;
  dryRun?: boolean;
  outputPath?: string;
  generatedAt?: string;
}

export interface EmitOperatingProfileResult {
  station: Domain;
  riskTier: OperatingProfile["riskTier"];
  path: string;
  written: boolean;
  consistency: OperatingProfileConsistency;
  profile: OperatingProfile;
}

export function defaultOperatingProfilePath(workspacePath: string, agentId: string, station: Domain): string {
  return join(resolve(workspacePath), OPERATING_PROFILE_DIR, agentId, `${station}.operating-profile.json`);
}

/**
 * `.amc/**` holds signed configs. A profile is a proposal the operator signs
 * with the existing commands, never a write into that tree — so any target
 * under `<workspace>/.amc` is refused before anything is built.
 */
export function assertOutsideSignedConfigTree(workspacePath: string, targetPath: string): void {
  const signedRoot = join(resolve(workspacePath), ".amc");
  const rel = relative(signedRoot, resolve(targetPath));
  const inside = rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
  if (inside) {
    throw new Error(`Refusing to write an operating profile under ${signedRoot}: .amc/** is reserved for signed configs; sign with the existing commands instead.`);
  }
}

/** Resolves the profile target and refuses it when it sits under `.amc/`; callers run this before any other write. */
export function resolveOperatingProfilePath(input: Pick<EmitOperatingProfileInput, "workspacePath" | "agentId" | "station" | "outputPath">): string {
  const workspacePath = resolve(input.workspacePath);
  const agentId = input.agentId.trim() || "default";
  const path = input.outputPath
    ? (isAbsolute(input.outputPath) ? input.outputPath : resolve(workspacePath, input.outputPath))
    : defaultOperatingProfilePath(workspacePath, agentId, input.station);
  assertOutsideSignedConfigTree(workspacePath, path);
  return path;
}

export function emitOperatingProfile(input: EmitOperatingProfileInput): EmitOperatingProfileResult {
  const agentId = input.agentId.trim() || "default";
  const path = resolveOperatingProfilePath(input);

  const profile = buildOperatingProfile({ station: input.station, agentId, generatedAt: input.generatedAt });
  const written = input.dryRun !== true;
  if (written) {
    writeFileAtomic(path, `${JSON.stringify(profile, null, 2)}\n`, 0o644);
  }
  return {
    station: input.station,
    riskTier: profile.riskTier,
    path,
    written,
    consistency: profile.consistency,
    profile
  };
}
