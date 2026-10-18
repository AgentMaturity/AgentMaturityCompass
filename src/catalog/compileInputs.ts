/**
 * The inputs a plan is compiled with beyond the profile and catalog, read from the workspace, for every caller that
 * compiles against one (`amc catalog compile`, A4 Adapt), so a CLI-built and an A4-built plan of one profile get the same
 * inputs and the same digest (P1-10F). Today that is the signed `.amc/tools.yaml`: bytes, signature and schema verified
 * from one read (loadVerifiedToolsConfigSnapshot). Absent, the plan keeps the built-in default list. Present but not
 * verifying is refused, never compiled as the wider default list. No caller decides P1-34 promotions yet; they join here
 * when one does. Messages name no host path: A4 returns them in API responses.
 */
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { CompileError, type CompileInput } from "./compiler/types.js";

/** What to spread into compilePlan's input; throws TOOLS_CONFIG_UNVERIFIED for a tools.yaml that does not verify. */
export function compileInputs(workspace: string): Pick<CompileInput, "signedTools" | "promotions"> {
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (snapshot.signatureValid && snapshot.config !== null && snapshot.digestSha256 !== null) {
    return { signedTools: { config: snapshot.config, sha256: snapshot.digestSha256 } };
  }
  if (!snapshot.signatureExists && snapshot.reason === "tools config missing") return {};
  throw new CompileError("TOOLS_CONFIG_UNVERIFIED", `.amc/tools.yaml does not verify (${snapshot.reason ?? "unknown reason"}); `
    + "re-sign it with amc tools sign, or remove it to compile with the built-in default tool list");
}
