/** Compiler output proposals must stay outside signed configs through lexical and physical aliases. */
import { join, resolve } from "node:path";
import { assertOutsideSignedConfigTree } from "../../domains/operatingProfiles/operatingProfileEmit.js";
import { isWithin, physicalPathWithMissingSuffix } from "../../utils/pathSafety.js";

/** A point-in-time guard before signing/output writes, not atomic protection against concurrent filesystem changes. */
export function assertCompilerOutputOutsideSignedConfigTree(workspace: string, target: string): void {
  // Keep the original lexical boundary even when .amc is a symlink to an outside directory.
  assertOutsideSignedConfigTree(workspace, target);
  const signedRoot = physicalPathWithMissingSuffix(join(resolve(workspace), ".amc"));
  const output = physicalPathWithMissingSuffix(target);
  if (isWithin(signedRoot, output)) {
    throw new Error("Refusing compiler output in .amc/**: reserved for signed configs.");
  }
}
