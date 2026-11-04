/**
 * The inputs a plan is compiled with beyond the profile and catalog, read from the workspace, for every caller that
 * compiles against one (`amc catalog compile`, A4 Adapt), so a CLI-built and an A4-built plan of one profile get the same
 * inputs and the same digest (P1-10F). Today that is the signed `.amc/tools.yaml`: bytes, signature and schema verified
 * from one read (loadVerifiedToolsConfigSnapshot). Absent, the plan keeps the built-in default list. Present but not
 * verifying is refused, never compiled as the wider default list. And the F1 operating profile the deployment profile
 * references (`operatingProfile`: a workspace path and the sha256 of its bytes), read once, hash-checked and
 * consistency-checked: the plan's signed-config fragments start from its, not from F1's defaults. No caller decides P1-34
 * promotions yet; they join here when one does. Messages name no host path: A4 returns them in API responses.
 */
import { readFileSync } from "node:fs";
import { parseConsistentProfile } from "../domains/operatingProfiles/operatingProfileSignature.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { sha256Hex } from "../utils/hash.js";
import { containedPath } from "../utils/pathSafety.js";
import { CompileError, type CompileInput, type DeploymentProfile } from "./compiler/types.js";

type Inputs = Pick<CompileInput, "signedTools" | "promotions" | "fromOperatingProfile">;

/** The referenced profile's fragments; a path outside the workspace, an unreadable file or other bytes refuse. */
function operatingProfileInput(workspace: string, ref: DeploymentProfile["operatingProfile"]): Inputs {
  if (ref === null) return {};
  let bytes: Buffer;
  try {
    bytes = readFileSync(containedPath(workspace, "the workspace", ref.path));
  } catch {
    throw new CompileError("OPERATING_PROFILE_UNREADABLE", `operating profile ${ref.path} cannot be read inside the workspace`);
  }
  if (sha256Hex(bytes) !== ref.sha256) throw new Error(`operating profile ${ref.path} does not match the sha256 the deployment profile records`);
  const raw = JSON.parse(bytes.toString("utf8")) as { schemaVersion?: unknown };
  if (raw.schemaVersion !== ref.schemaVersion) {
    throw new CompileError("OPERATING_PROFILE_INVALID", `operating profile ${ref.path} is schema ${String(raw.schemaVersion)}, not the ${ref.schemaVersion} the deployment profile records`);
  }
  return { fromOperatingProfile: parseConsistentProfile(bytes).proposedSignedConfigs };
}

/**
 * What to spread into compilePlan's input; throws TOOLS_CONFIG_UNVERIFIED for a tools.yaml that does not verify, and
 * refuses a referenced operating profile it cannot read, whose bytes differ from the pinned sha256 or that is inconsistent.
 */
export function compileInputs(workspace: string, profile?: DeploymentProfile): Inputs {
  const fromProfile = operatingProfileInput(workspace, profile?.operatingProfile ?? null);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (snapshot.signatureValid && snapshot.config !== null && snapshot.digestSha256 !== null) {
    return { ...fromProfile, signedTools: { config: snapshot.config, sha256: snapshot.digestSha256 } };
  }
  if (!snapshot.signatureExists && snapshot.reason === "tools config missing") return fromProfile;
  throw new CompileError("TOOLS_CONFIG_UNVERIFIED", `.amc/tools.yaml does not verify (${snapshot.reason ?? "unknown reason"}); `
    + "re-sign it with amc tools sign, or remove it to compile with the built-in default tool list");
}
