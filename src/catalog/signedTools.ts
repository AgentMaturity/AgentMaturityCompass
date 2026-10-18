/**
 * The signed `.amc/tools.yaml` a plan is compiled from (P1-10F), for every caller that compiles against a workspace
 * (`amc catalog compile`, A4 Adapt), so they cannot drift apart. Bytes, signature and schema are verified from one read
 * (loadVerifiedToolsConfigSnapshot). Absent, the plan keeps the built-in default list. Present but not verifying is
 * refused, never compiled as the wider default list. Messages name no host path: A4 returns them in API responses.
 */
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { CompileError, type CompileInput } from "./compiler/types.js";

/** `{ signedTools }` to spread into compilePlan's input, `{}` when there is no tools.yaml; throws TOOLS_CONFIG_UNVERIFIED. */
export function verifiedSignedTools(workspace: string): Pick<CompileInput, "signedTools"> {
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (snapshot.signatureValid && snapshot.config !== null && snapshot.digestSha256 !== null) {
    return { signedTools: { config: snapshot.config, sha256: snapshot.digestSha256 } };
  }
  if (!snapshot.signatureExists && snapshot.reason === "tools config missing") return {};
  throw new CompileError("TOOLS_CONFIG_UNVERIFIED", `.amc/tools.yaml does not verify (${snapshot.reason ?? "unknown reason"}); `
    + "re-sign it with amc tools sign, or remove it to compile with the built-in default tool list");
}
