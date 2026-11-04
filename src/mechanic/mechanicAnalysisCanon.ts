/** The planner consumes only the canon version. Missing canon remains an in-memory fallback, with no signing. */
import { loadCanon, readCanonForApi } from "../canon/canonLoader.js";
export function captureMechanicAnalysisCanon(workspace: string) {
  const canon = readCanonForApi(workspace).canon, version = canon.compassCanon.version;
  return { canon, assertCurrent() {
    if (loadCanon(workspace, { includePluginExtensions: false }).compassCanon.version !== version)
      throw new Error("selected mechanic canon version changed while signing");
  } };
}
